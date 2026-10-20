/// <reference types="vite/client" />

/** 빌드 시각 (vite.config.ts 의 define). 배포된 version.json 과 비교해 새 버전을 알아낸다 */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
