import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 설정은 Vite 환경변수(.env)로 주입한다.
 * .env.example 을 복사해 .env 를 만들고 값을 채우면 로그인/아카이브가 활성화된다.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
