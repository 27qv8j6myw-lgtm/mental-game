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

export interface AuthUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
}

interface AuthCtx {
  mode: AuthMode;
  user: AuthUser | null;
  configured: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  continueAsGuest: () => void;
  error: string | null;
}

const Ctx = createContext<AuthCtx | null>(null);
const GUEST_KEY = "mentalgame-guest";

function mapUser(u: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): AuthUser {
  const meta = u.user_metadata ?? {};
  return {
    uid: u.id,
    displayName:
      (meta.full_name as string) || (meta.name as string) || u.email || null,
    photoURL: (meta.avatar_url as string) || (meta.picture as string) || null,
    email: u.email ?? null,
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
      signIn: async () => {
        setError(null);
        if (!isSupabaseConfigured || !supabase) {
          setError(
            "백엔드(Supabase)가 아직 설정되지 않았어요. .env 설정 후 이용할 수 있어요."
          );
          return;
        }
        localStorage.removeItem(GUEST_KEY);
        const { error: e } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.origin },
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
      continueAsGuest: () => {
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
