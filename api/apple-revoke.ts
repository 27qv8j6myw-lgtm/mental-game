/*
 * Apple 로 로그인 토큰 취소 (Vercel 함수, POST /api/apple-revoke) — 회원 탈퇴할 때
 * 앱스토어 규정: Apple 로그인을 쓰는 앱은 계정을 지울 때 Sign in with Apple REST API 로 토큰을 취소해야 한다.
 * 앱이 탈퇴 직전에 Apple 로그인 창을 한 번 더 띄워 받은 인증 코드(authorization code)를 보내면,
 * 코드를 토큰으로 바꾼 뒤(/auth/token) 그 토큰을 취소한다(/auth/revoke). 취소되면 아이폰 설정의
 * 'Apple로 로그인' 목록에서도 멘탈게임이 빠진다.
 * - 필요한 환경변수: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY(.p8 파일 내용), VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *   (APPLE_CLIENT_ID 가 없으면 앱 번들 ID kr.mentalgame.golf)
 */

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

/** Apple 인증 서버 (로컬 시험 때만 바꾼다) */
const APPLE = env.APPLE_AUTH_URL ?? "https://appleid.apple.com";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** base64url (JWT 조각) */
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const text = (s: string) => new TextEncoder().encode(s);

/**
 * Apple 에 보낼 client_secret: .p8 키로 서명한 ES256 JWT (5분).
 * Web Crypto 의 ECDSA 서명은 JWT 가 쓰는 r||s 모양 그대로 나온다
 */
async function clientSecret(teamId: string, keyId: string, clientId: string, pem: string): Promise<string> {
  const header = b64url(text(JSON.stringify({ alg: "ES256", kid: keyId })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    text(JSON.stringify({ iss: teamId, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: clientId }))
  );
  // .p8 (PKCS#8 PEM). Vercel 환경변수에 줄바꿈을 \n 으로 넣었어도 읽히게
  const body = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, text(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

/** 로그인한 사용자인지 Supabase 에 묻는다 (아무나 이 함수를 부르지 못하게) */
async function signedIn(token: string): Promise<boolean> {
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return false;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` } });
    return r.ok;
  } catch {
    return false;
  }
}

const form = (o: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(o).toString(),
});

export async function POST(request: Request): Promise<Response> {
  const teamId = env.APPLE_TEAM_ID;
  const keyId = env.APPLE_KEY_ID;
  const pem = env.APPLE_PRIVATE_KEY;
  if (!teamId || !keyId || !pem) return json(503, { error: "NO_KEY" });
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s*/i, "");
  if (!(await signedIn(token))) return json(401, { error: "UNAUTHORIZED" });

  let code: unknown;
  try {
    code = ((await request.json()) as { code?: unknown })?.code;
  } catch {
    return json(400, { error: "BAD_REQUEST" });
  }
  if (typeof code !== "string" || !code || code.length > 2000) return json(400, { error: "BAD_REQUEST" });

  const clientId = env.APPLE_CLIENT_ID ?? "kr.mentalgame.golf";
  let secret: string;
  try {
    secret = await clientSecret(teamId, keyId, clientId, pem);
  } catch (e) {
    console.error("apple-revoke key", e);
    return json(502, { error: "KEY_SETUP" });
  }

  try {
    // 1) 인증 코드 → 토큰
    const t = await fetch(`${APPLE}/auth/token`, form({ client_id: clientId, client_secret: secret, code, grant_type: "authorization_code" }));
    const tb = (await t.json().catch(() => null)) as { refresh_token?: string; access_token?: string; error?: string } | null;
    const revoke = tb?.refresh_token ?? tb?.access_token;
    if (!t.ok || !revoke) {
      console.error("apple-revoke token", t.status, tb?.error);
      return json(502, { error: "TOKEN", detail: tb?.error ?? null });
    }
    // 2) 토큰 취소 (리프레시 토큰이 있으면 그것을: 앱과의 연결이 끊어진다)
    const r = await fetch(
      `${APPLE}/auth/revoke`,
      form({
        client_id: clientId,
        client_secret: secret,
        token: revoke,
        token_type_hint: tb?.refresh_token ? "refresh_token" : "access_token",
      })
    );
    if (!r.ok) {
      console.error("apple-revoke revoke", r.status, await r.text().catch(() => ""));
      return json(502, { error: "REVOKE" });
    }
    return json(200, { revoked: true });
  } catch (e) {
    console.error("apple-revoke", e);
    return json(502, { error: "UPSTREAM" });
  }
}
