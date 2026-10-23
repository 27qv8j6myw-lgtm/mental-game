import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isSupabaseConfigured, supabase } from "./supabase";
import { isNativeApp, NATIVE_LOGIN_REDIRECT, openNativeLogin, requestAppleLogin } from "./native";
import { apiUrl } from "./scorecard";

export type AuthMode = "loading" | "signed-in" | "signed-out";
export type OAuthProvider = "google" | "kakao";
/** 프로필에서 연결·해제할 수 있는 로그인 (Apple 은 iOS 앱에서만 연결) */
export type LinkProvider = OAuthProvider | "apple";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
  isAnonymous: boolean;
  providers: string[];
  /** 계좌이체 라운드용으로 저장해 둔 내 계좌 (다음 라운드 자동 입력) */
  bank: { name: string; account: string } | null;
  /** 대기실에서 고른 성별 (다음 라운드에도 쓴다. KGA 남/여 레이팅 선택에 필요). 고른 적 없으면 null */
  gender: "male" | "female" | null;
  /** 앱에서 쓸 이름(실명)을 직접 정했는지. 안 정했으면 처음에 묻는다 (카카오 닉네임 대신) */
  nameSet: boolean;
  /** 로그인한 서비스(카카오·구글)의 이름. 이름을 정할 때 미리 채워 둔다 */
  providerName: string | null;
}

interface AuthCtx {
  mode: AuthMode;
  user: AuthUser | null;
  configured: boolean;
  signIn: (provider: OAuthProvider) => Promise<void>;
  signOutUser: () => Promise<void>;
  /** iOS 앱에서만: Apple 로 로그인 (아이폰의 Apple 로그인 창) */
  signInWithApple: () => Promise<void>;
  /** 회원 탈퇴 (supabase/account.sql). 성공하면 true (로그인 화면으로) */
  deleteAccount: () => Promise<boolean>;
  /** 로그인 화면에 띄울 안내 (탈퇴 완료 등) */
  notice: string | null;
  linkProvider: (provider: OAuthProvider) => Promise<void>;
  unlinkProvider: (provider: LinkProvider) => Promise<void>;
  /** iOS 앱: 아이폰의 Apple 로그인 창으로 지금 계정에 Apple 을 연결한다 */
  linkApple: () => Promise<void>;
  /** 내 계정(user_metadata)에 계좌를 저장해 다음 라운드에서도 쓴다 */
  saveBankAccount: (name: string, account: string) => Promise<void>;
  /** 내 계정(user_metadata)에 성별을 저장해 다음 라운드에서도 쓴다 */
  saveGender: (gender: "male" | "female") => Promise<void>;
  /** 앱에서 쓸 이름(실명)을 저장한다 (성별도 고르면 함께). 성공하면 true */
  saveName: (name: string, gender?: "male" | "female") => Promise<boolean>;
  error: string | null;
  clearError: () => void;
  /** 게스트 세션에서 로그인해 게스트로 친 라운드를 이 계정으로 옮겼으면 그 결과 (홈에 알린다) */
  guestMoved: GuestMoved | null;
  clearGuestMoved: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

/* ---- 게스트 기록 옮기기 (supabase/guest.sql) ----
 * 예전 '로그인 없이 참여하기'(익명 계정) 세션이 남은 폰은 로그인 화면을 띄운다.
 * 로그인 버튼을 누르면 먼저 게스트로 표를 받아 두고, 로그인한 뒤 그 표를 내서 게스트로 친 라운드를 새 계정으로 옮긴다. */
export interface GuestMoved {
  moved: number;
  skipped: number;
}
const CLAIM_KEY = "mentalgame-guest-claim";
const readClaim = () => {
  try {
    return localStorage.getItem(CLAIM_KEY);
  } catch {
    return null;
  }
};
const dropClaim = () => {
  try {
    localStorage.removeItem(CLAIM_KEY);
  } catch {
    /* 저장소를 못 쓰면 그대로 */
  }
};
let claiming: Promise<GuestMoved | null> | null = null;
/** 받아 둔 표를 낸다 (여러 번 불러도 한 번만). 통신이 안 되면 표를 두고 다음에 다시 낸다 */
function claimGuest(): Promise<GuestMoved | null> {
  if (claiming) return claiming;
  const token = readClaim();
  const db = supabase;
  if (!token || !db) return Promise.resolve(null);
  claiming = (async () => {
    const { data, error } = await db.rpc("claim_guest_rounds", { p_token: token });
    if (error) {
      console.error("게스트 기록 옮기기 실패", error);
      // 서버가 거절했으면(guest.sql 실행 전 등) 표를 버린다. 통신 오류(코드 없음)면 다음에 다시
      if (error.code) dropClaim();
      claiming = null;
      return null;
    }
    dropClaim();
    return data as GuestMoved;
  })();
  return claiming;
}

/** Apple 로그인 nonce: 추측할 수 없는 값 */
function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** iOS 앱의 Apple 로그인 창을 띄워 신원 토큰을 받는다 (취소하면 null) */
async function appleIdToken(): Promise<
  { token: string; nonce: string; fullName?: string } | { error: string } | null
> {
  // 토큰을 다른 곳에서 다시 쓰지 못하게: 원래 값은 Supabase 에, SHA-256 은 Apple 에 준다
  const raw = randomNonce();
  const result = await requestAppleLogin(await sha256(raw));
  if (result.cancelled) return null;
  if (!result.idToken) return { error: result.error ?? "no token" };
  return { token: result.idToken, nonce: raw, fullName: result.fullName ?? undefined };
}

/**
 * 회원 탈퇴 전에 Apple 토큰을 취소한다 (앱스토어 규정, api/apple-revoke.ts).
 * Apple 로그인 창을 한 번 더 띄워 받은 인증 코드를 서버에 넘긴다. 취소하거나 실패해도 탈퇴는 그대로 한다
 */
async function revokeAppleToken(): Promise<void> {
  try {
    const result = await requestAppleLogin(await sha256(randomNonce()));
    // 창을 닫았거나 인증 코드를 넘기지 않는 예전 앱
    if (!result.authCode || !supabase) return;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(apiUrl("apple-revoke"), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ code: result.authCode }),
    });
    if (!res.ok) console.warn("Apple 토큰을 취소하지 못함", res.status);
  } catch (e) {
    console.warn("Apple 토큰을 취소하지 못함", e);
  }
}

function oauthOptions(provider: OAuthProvider) {
  const native = isNativeApp();
  return {
    // iOS 앱: 로그인 창은 앱이 열고(시스템 로그인 창), 끝나면 앱 주소로 돌아와 앱이 이 웹에 결과를 넘긴다
    redirectTo: native ? NATIVE_LOGIN_REDIRECT : window.location.origin,
    skipBrowserRedirect: native,
    // Supabase 기본 scope에는 account_email이 있어, 비즈 앱이 아니면 카카오가 KOE205로 거절한다.
    ...(provider === "kakao" && {
      queryParams: { scope: "profile_nickname profile_image" },
    }),
  };
}

const REDIRECT_ERRORS: Record<string, string> = {
  identity_already_exists:
    "이미 다른 멘탈게임 계정에서 쓰고 있는 계정이라 연결할 수 없어요.",
  manual_linking_disabled:
    "계정 연결 기능이 아직 활성화되지 않았어요. 관리자에게 문의해 주세요.",
  access_denied: "요청이 취소됐어요.",
};

/** OAuth 리다이렉트로 돌아올 때 Supabase가 URL에 붙인 에러를 읽고 주소를 정리한다. */
function takeRedirectError(): string | null {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const code =
    query.get("error_code") || hash.get("error_code") || query.get("error") || hash.get("error");
  if (!code) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return REDIRECT_ERRORS[code] ?? "요청을 처리하지 못했어요. 다시 시도해 주세요.";
}

function mapUser(u: {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown>;
  identities?: { provider: string }[];
}): AuthUser {
  const meta = u.user_metadata ?? {};
  const isAnonymous = !!u.is_anonymous;
  // 로그인할 때마다 카카오·구글 이름으로 full_name 이 덮어써져서, 직접 정한 이름은 mg_name 에 따로 둔다
  const appName = typeof meta.mg_name === "string" && meta.mg_name.trim() ? meta.mg_name.trim() : null;
  const providerName = (meta.full_name as string) || (meta.name as string) || null;
  return {
    uid: u.id,
    displayName: isAnonymous ? null : appName || providerName || u.email || null,
    nameSet: !!appName,
    providerName,
    photoURL: isAnonymous
      ? null
      : (meta.avatar_url as string) || (meta.picture as string) || null,
    email: u.email ?? null,
    isAnonymous,
    providers: (u.identities ?? []).map((i) => i.provider),
    bank:
      typeof meta.bank_name === "string" && typeof meta.bank_account === "string"
        ? { name: meta.bank_name, account: meta.bank_account }
        : null,
    gender: meta.mg_gender === "female" || meta.mg_gender === "male" ? meta.mg_gender : null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mode, setMode] = useState<AuthMode>(
    isSupabaseConfigured ? "loading" : "signed-out"
  );
  const [error, setError] = useState<string | null>(null);
  const [guestMoved, setGuestMoved] = useState<GuestMoved | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const redirectError = takeRedirectError();
    if (redirectError) setError(redirectError);

    const apply = (sUser: Parameters<typeof mapUser>[0] | undefined) => {
      if (!sUser) {
        setUser(null);
        setMode("signed-out");
        return;
      }
      const u = mapUser(sUser);
      // 게스트 세션에서 로그인했다: 게스트 기록을 이 계정으로 옮긴 뒤에 화면을 연다
      // (라운드 목록·열려 있던 라운드가 옮긴 기록을 보도록, 그동안은 불러오는 중)
      if (!u.isAnonymous && readClaim()) {
        void claimGuest().then((r) => {
          if (r && (r.moved > 0 || r.skipped > 0)) setGuestMoved(r);
          setUser(u);
          setMode("signed-in");
        });
        return;
      }
      setUser(u);
      setMode("signed-in");
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session?.user));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user));

    return () => sub.subscription.unsubscribe();
  }, []);

  const api = useMemo<AuthCtx>(
    () => ({
      mode,
      user,
      configured: isSupabaseConfigured,
      error,
      signIn: async (provider) => {
        setError(null);
        if (!isSupabaseConfigured || !supabase) {
          setError(
            "백엔드(Supabase)가 아직 설정되지 않았어요. .env 설정 후 이용할 수 있어요."
          );
          return;
        }
        // 게스트 세션이면: 로그인한 뒤 게스트로 친 라운드를 새 계정으로 옮길 표를 먼저 받아 둔다
        if (user?.isAnonymous) {
          const { data, error: ce } = await supabase.rpc("create_guest_claim");
          if (ce) console.error("게스트 표 받기 실패", ce);
          else if (data)
            try {
              localStorage.setItem(CLAIM_KEY, String(data));
            } catch {
              /* 저장소를 못 쓰면 옮기지 못한다 (관리자가 옮길 수 있다) */
            }
        }
        const { data: started, error: e } = await supabase.auth.signInWithOAuth({
          provider,
          options: oauthOptions(provider),
        });
        if (!e && isNativeApp() && started.url) openNativeLogin(started.url);
        if (e) {
          setError("로그인에 실패했어요. 다시 시도해 주세요.");
          console.error(e);
        }
      },
      linkProvider: async (provider) => {
        if (!supabase) return;
        setError(null);
        const { data: started, error: e } = await supabase.auth.linkIdentity({
          provider,
          options: oauthOptions(provider),
        });
        if (!e && isNativeApp() && started?.url) openNativeLogin(started.url);
        if (e) {
          console.error(e);
          setError(
            (e.code && REDIRECT_ERRORS[e.code]) ||
              "계정 연결을 시작하지 못했어요. 다시 시도해 주세요."
          );
        }
      },
      linkApple: async () => {
        if (!supabase || !isNativeApp()) return;
        setError(null);
        const result = await appleIdToken();
        if (!result) return;
        if ("error" in result) {
          console.error("Apple 연결 실패", result.error);
          setError("Apple 계정을 연결하지 못했어요. 다시 시도해 주세요.");
          return;
        }
        const { data, error: e } = await supabase.auth.linkIdentity({
          provider: "apple",
          token: result.token,
          nonce: result.nonce,
        });
        if (e) {
          console.error(e);
          setError(
            (e.code && REDIRECT_ERRORS[e.code]) || "Apple 계정을 연결하지 못했어요. 다시 시도해 주세요."
          );
          return;
        }
        // 연결한 Apple 이 user.identities 에 들어간 세션으로 바꾼다 (새로고침 뒤에도 연결됨으로)
        const { data: refreshed } = await supabase.auth.refreshSession();
        const u = refreshed.user ?? data.user;
        if (u) setUser(mapUser(u));
      },
      unlinkProvider: async (provider) => {
        if (!supabase) return;
        setError(null);
        const { data, error: idErr } = await supabase.auth.getUserIdentities();
        if (idErr || !data) {
          console.error(idErr);
          setError("연결 정보를 불러오지 못했어요. 다시 시도해 주세요.");
          return;
        }
        const identity = data.identities.find((i) => i.provider === provider);
        if (!identity) {
          // 다른 기기에서 이미 해제했으면: 이 기기의 연결 표시만 새로 받아 맞춘다
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.user) setUser(mapUser(refreshed.user));
          return;
        }
        const { error: e } = await supabase.auth.unlinkIdentity(identity);
        if (e) {
          console.error(e);
          setError("연결을 해제하지 못했어요. 다시 시도해 주세요.");
          return;
        }
        // 저장된 세션의 user.identities를 갱신해야 새로고침 후에도 해제 상태가 유지된다.
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed.user) setUser(mapUser(refreshed.user));
      },
      saveBankAccount: async (name, account) => {
        if (!supabase) return;
        const { data, error: e } = await supabase.auth.updateUser({
          data: { bank_name: name, bank_account: account },
        });
        if (e) {
          console.error(e);
          return;
        }
        if (data.user) setUser(mapUser(data.user));
      },
      saveGender: async (gender) => {
        if (!supabase) return;
        const { data, error: e } = await supabase.auth.updateUser({ data: { mg_gender: gender } });
        if (e) {
          console.error(e);
          return;
        }
        if (data.user) setUser(mapUser(data.user));
      },
      saveName: async (name, gender) => {
        if (!supabase) return false;
        const { data, error: e } = await supabase.auth.updateUser({
          data: { mg_name: name.trim(), ...(gender && { mg_gender: gender }) },
        });
        if (e) {
          console.error(e);
          return false;
        }
        if (data.user) setUser(mapUser(data.user));
        return true;
      },
      clearError: () => setError(null),
      guestMoved,
      clearGuestMoved: () => setGuestMoved(null),
      signOutUser: async () => {
        if (supabase) await supabase.auth.signOut();
        setUser(null);
        setMode("signed-out");
      },
      signInWithApple: async () => {
        setError(null);
        setNotice(null);
        if (!supabase || !isNativeApp()) return;
        const result = await appleIdToken();
        if (!result) return;
        if ("error" in result) {
          console.error("Apple 로그인 실패", result.error);
          setError("Apple 로그인에 실패했어요. 다시 시도해 주세요.");
          return;
        }
        const { data, error: e } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: result.token,
          nonce: result.nonce,
        });
        if (e) {
          console.error(e);
          setError("Apple 로그인에 실패했어요. 다시 시도해 주세요.");
          return;
        }
        // Apple 은 이름을 처음 한 번만 알려 준다: 이름을 정할 때 미리 채우도록 계정에 적어 둔다
        const meta = data.user?.user_metadata ?? {};
        if (result.fullName && !meta.full_name && !meta.name) {
          const { data: up } = await supabase.auth.updateUser({ data: { full_name: result.fullName } });
          if (up.user) setUser(mapUser(up.user));
        }
      },
      deleteAccount: async () => {
        if (!supabase) return false;
        // Apple 로 로그인(연결)한 계정은 앱에서 Apple 토큰도 취소한다 (계정이 지워지기 전에, 로그인한 채로)
        if (isNativeApp() && user?.providers.includes("apple")) await revokeAppleToken();
        const { error: rpcErr } = await supabase.rpc("delete_my_account");
        if (rpcErr) {
          console.error("회원 탈퇴 실패", rpcErr);
          return false;
        }
        // 계정이 없어졌으니 이 기기의 로그인과 보관해 둔 화면·목록도 지운다
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        try {
          for (const k of Object.keys(localStorage)) if (k.startsWith("mentalgame")) localStorage.removeItem(k);
        } catch {
          /* 저장소를 못 쓰면 그대로 */
        }
        setUser(null);
        setMode("signed-out");
        setNotice("탈퇴했어요. 그동안 멘탈게임을 써 주셔서 고마워요.");
        return true;
      },
      notice,
    }),
    [mode, user, error, guestMoved, notice]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
