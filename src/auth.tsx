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
}

interface AuthCtx {
  mode: AuthMode;
  user: AuthUser | null;
  configured: boolean;
  signIn: (provider: OAuthProvider) => Promise<void>;
  signOutUser: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  error: string | null;
}

const Ctx = createContext<AuthCtx | null>(null);
const GUEST_KEY = "mentalgame-guest";

function mapUser(u: {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown>;
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
          options: {
            redirectTo: window.location.origin,
            // Supabase 기본 scope에는 account_email이 있어, 비즈 앱이 아니면 카카오가 KOE205로 거절한다.
            ...(provider === "kakao" && {
              queryParams: { scope: "profile_nickname profile_image" },
            }),
          },
        });
        if (e) {
          setError("로그인에 실패했어요. 다시 시도해 주세요.");
          console.error(e);
        }
      },
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
