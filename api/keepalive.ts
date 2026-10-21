/*
 * Supabase 깨우기 (Vercel Cron, 매일 한 번 — vercel.json 의 crons)
 * Free 플랜은 1주일 동안 쓰지 않으면 DB 를 멈춘다. 매일 DB 를 실제로 한 번 조회해서 깨어 있게 한다.
 * CRON_SECRET 환경변수를 넣어 두면 Vercel 이 그 값을 Authorization 헤더로 보내고, 그 요청만 받는다
 * (넣지 않으면 누가 불러도 가벼운 조회 한 번뿐이라 그대로 받는다)
 */

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function GET(request: Request): Promise<Response> {
  const secret = env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json(401, { error: "UNAUTHORIZED" });
  }
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return json(503, { error: "NO_SUPABASE" });
  const at = new Date().toISOString();
  try {
    // 로그인 없이 라운드 하나를 조회한다: 권한(RLS) 때문에 빈 결과지만 DB 에서 실제로 쿼리가 돈다
    const r = await fetch(`${url}/rest/v1/rounds?select=id&limit=1`, {
      headers: { apikey: anon, authorization: `Bearer ${anon}` },
    });
    if (!r.ok) console.error("keepalive", r.status, await r.text().catch(() => ""));
    return json(r.ok ? 200 : 502, { ok: r.ok, status: r.status, at });
  } catch (e) {
    console.error("keepalive", e);
    return json(502, { ok: false, at });
  }
}
