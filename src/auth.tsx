import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isSupabaseConfigured, supabase } from "./supabase";

export type AuthMode = "loading" | "signed-in" | "guest" | "signed-out";
export type OAuthProvider = "google" | "kakao";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
  isAnonymous: boolean;
  providers: string[];
}

interface AuthCtx {
  mode: AuthMode;
  user: AuthUser | null;
  configured: boolean;
  signIn: (provider: OAuthProvider) => Promise<void>;
  signOutUser: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  linkProvider: (provider: OAuthProvider) => Promise<void>;
  unlinkProvider: (provider: OAuthProvider) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const GUEST_KEY = "mentalgame-guest";

function oauthOptions(provider: OAuthProvider) {
  return {
    redirectTo: window.location.origin,
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
  return {
    uid: u.id,
    displayName: isAnonymous
      ? null
      : (meta.full_name as string) || (meta.name as string) || u.email || null,
    photoURL: isAnonymous
      ? null
      : (meta.avatar_url as string) || (meta.picture as string) || null,
    email: u.email ?? null,
    isAnonymous,
    providers: (u.identities ?? []).map((i) => i.provider),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mode, setMode] = useState<AuthMode>(
    isSupabaseConfigured ? "loading" : "signed-out"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      if (localStorage.getItem(GUEST_KEY)) setMode("guest");
      return;
    }

    const redirectError = takeRedirectError();
    if (redirectError) setError(redirectError);

    supabase.auth.getSession().then(({ data }) => {
      const sUser = data.session?.user;
      if (sUser) {
        setUser(mapUser(sUser));
        setMode("signed-in");
      } else {
        setMode(localStorage.getItem(GUEST_KEY) ? "guest" : "signed-out");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const sUser = session?.user;
      if (sUser) {
        setUser(mapUser(sUser));
        setMode("signed-in");
      } else {
        setUser(null);
        setMode(localStorage.getItem(GUEST_KEY) ? "guest" : "signed-out");
      }
    });

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
        localStorage.removeItem(GUEST_KEY);
        const { error: e } = await supabase.auth.signInWithOAuth({
          provider,
          options: oauthOptions(provider),
        });
        if (e) {
          setError("로그인에 실패했어요. 다시 시도해 주세요.");
          console.error(e);
        }
      },
      linkProvider: async (provider) => {
        if (!supabase) return;
        setError(null);
        const { error: e } = await supabase.auth.linkIdentity({
          provider,
          options: oauthOptions(provider),
        });
        if (e) {
          console.error(e);
          setError(
            (e.code && REDIRECT_ERRORS[e.code]) ||
              "계정 연결을 시작하지 못했어요. 다시 시도해 주세요."
          );
        }
      },
      unlinkProvider: async (provider) => {
        if (!supabase) return;
        setError(null);
        const { data, error: idErr } = await supabase.auth.getUserIdentities();
        const identity = data?.identities.find((i) => i.provider === provider);
        if (idErr || !identity) {
          console.error(idErr);
          setError("연결 정보를 불러오지 못했어요. 다시 시도해 주세요.");
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
      clearError: () => setError(null),
      signOutUser: async () => {
        localStorage.removeItem(GUEST_KEY);
        if (supabase) await supabase.auth.signOut();
        setUser(null);
        setMode("signed-out");
      },
      continueAsGuest: async () => {
        setError(null);
        // Supabase가 연결돼 있으면 익명 로그인으로 온라인 라운드에 참여할 수 있게 한다.
        if (isSupabaseConfigured && supabase) {
          const { error: e } = await supabase.auth.signInAnonymously();
          if (e) {
            console.error(e);
            setError(
              "게스트 참여를 시작할 수 없어요. 관리자에게 익명 로그인 활성화를 요청하세요."
            );
          }
          return;
        }
        // 오프라인(백엔드 미설정) 폴백: 로컬 단일 기기 모드
        localStorage.setItem(GUEST_KEY, "1");
        setMode("guest");
      },
    }),
    [mode, user, error]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
