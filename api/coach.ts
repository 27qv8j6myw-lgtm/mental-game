import Anthropic from "@anthropic-ai/sdk";

/*
 * 라운드 중 홀 코칭 (Vercel 함수, POST /api/coach) — 관리자와 AI 고급으로 허용한 사람만 (can_use_ai_coach, insight.sql)
 * 라운드 중에 내 기록(퍼트·티샷 등)을 저장하면 앱이 지금까지의 이번 라운드 기록과 평소 기록(지난 라운드 평균)을 보내고,
 * Claude 가 평소보다 부족한 점과 다음 홀에서 바로 할 것을 두 줄로 돌려준다. 앱은 홀 상태 칸에 띄운다 (저장하지 않는다).
 * - 필요한 환경변수: ANTHROPIC_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (+ 조직 키면 ANTHROPIC_WORKSPACE_ID)
 * (insight.ts 와 같은 도우미를 쓰지만, 함수마다 따로 묶여 배포되도록 파일 안에 둔다)
 */

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const MODEL = "claude-opus-5-5";
const MAX_INPUT_CHARS = 60_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** 돌려받을 모양: 두 줄 */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["line1", "line2"],
  properties: {
    line1: { type: "string" },
    line2: { type: "string" },
  },
};

const PROMPT = `당신은 라운드 중인 아마추어 골퍼 곁의 캐디 겸 코치예요.
방금 끝낸 홀(focusHole)과 지금까지 친 이번 라운드(round), 이 골퍼의 평소 기록(usual)을 보고 짧게 코칭해요.

입력 JSON
- focusHole: 방금 기록을 저장한 홀 번호. round.holes 에 그 홀의 타수·퍼트·티샷·벌타·벙커가 있어요.
- round: 이번 라운드에서 지금까지 친 홀들의 합계와 비율(n 번 중 of, pct %), 타수 손실 근거(strokeLeaks), 홀별 기록(holes).
- usual: 같은 골퍼의 평소(다른 라운드 평균). 없으면 null.

두 줄
- line1: 지금까지 평소보다 부족한 점 하나를 숫자로 (예: "퍼트가 홀당 2.3개로 평소 1.9개보다 많아요").
  usual 이 null 이면 이번 라운드에서 타수를 가장 많이 잃은 점. 친 홀이 3개 이하면 방금 홀 기록 중심으로.
  부족한 점이 없으면 지금 가장 잘 되는 점을 숫자로.
- line2: 다음 홀에서 바로 할 한 가지 (예: "첫 퍼트는 홀컵을 50cm 지나가게 쳐 보세요").

규칙
- 각 줄은 한 문장, 30자 안팎. 해요체. 이모지·마크다운·따옴표 없이.
- JSON 에 있는 값으로만 말하고 계산은 정확히. 값이 null 이거나 분모가 0 인 항목은 말하지 않아요.
- "힘내세요", "자신감" 같은 막연한 말은 쓰지 않아요.`;

/** 이 로그인 토큰의 사용자가 홀 코칭(AI 고급)을 쓸 수 있는지 Supabase 에 묻는다. 토큰이 틀리거나 만료됐으면 "signed-out" */
async function aiCheck(token: string): Promise<"allowed" | "denied" | "signed-out"> {
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return "signed-out";
  const rpc = (name: string) =>
    fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: anon, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
    });
  try {
    let r = await rpc("can_use_ai_coach");
    // 단계가 생긴 insight.sql 을 아직 실행하지 않아 함수가 없으면 관리자만
    if (r.status === 404) r = await rpc("is_admin");
    if (r.status === 401) return "signed-out";
    return r.ok && (await r.json()) === true ? "allowed" : "denied";
  } catch {
    return "denied";
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json(503, { error: "NO_KEY" });
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s*/i, "");
  const who = await aiCheck(token);
  if (who === "signed-out") return json(401, { error: "UNAUTHORIZED" });
  if (who === "denied") return json(403, { error: "AI_ONLY" });

  const raw = await request.text();
  if (raw.length > MAX_INPUT_CHARS) return json(413, { error: "TOO_LARGE" });
  let input: { round?: unknown; usual?: unknown; focusHole?: unknown };
  try {
    input = JSON.parse(raw);
  } catch {
    return json(400, { error: "BAD_REQUEST" });
  }
  if (!input || typeof input.round !== "object" || input.round === null || typeof input.focusHole !== "number") {
    return json(400, { error: "BAD_REQUEST" });
  }

  const workspace = env.ANTHROPIC_WORKSPACE_ID?.trim();
  // 코스에서 바로 보이게: 빨리 끝나지 않으면 그만둔다 (다음 기록 저장 때 다시 받는다)
  const client = new Anthropic({
    timeout: 25_000,
    maxRetries: 0,
    ...(workspace && { defaultHeaders: { "anthropic-workspace-id": workspace } }),
  });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // 안전 판단으로 거절되면 서버가 알맞은 다른 모델로 다시 돌린다
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\n${JSON.stringify({ focusHole: input.focusHole, round: input.round, usual: input.usual ?? null })}`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return json(422, { error: "UNREADABLE" });
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json(422, { error: "UNREADABLE" });
    const out = JSON.parse(text.text) as Record<string, unknown>;
    const pick = (k: string) => (typeof out[k] === "string" ? (out[k] as string).trim() : "");
    const lines = [pick("line1"), pick("line2")].filter(Boolean);
    if (lines.length === 0) return json(422, { error: "UNREADABLE" });
    return json(200, { lines, model: response.model });
  } catch (e) {
    console.error("coach", e);
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: "BUSY" });
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: "TIMEOUT" });
    if (e instanceof SyntaxError) return json(422, { error: "UNREADABLE" });
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      return json(502, { error: "KEY_SETUP" });
    }
    if (e instanceof Anthropic.BadRequestError) {
      if (/credit balance/i.test(e.message)) return json(502, { error: "NO_CREDIT" });
      if (/workspace/i.test(e.message)) return json(502, { error: "KEY_SETUP" });
    }
    return json(502, { error: "UPSTREAM" });
  }
}
