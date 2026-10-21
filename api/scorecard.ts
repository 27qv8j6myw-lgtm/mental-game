import Anthropic from "@anthropic-ai/sdk";

/*
 * 스코어카드 사진 읽기 (Vercel 함수, POST /api/scorecard)
 * 사진을 Claude 에 보내 홀별 파·타수·퍼트·티샷 방향·패널티·샌드샷과 인쇄된 합계를 JSON 으로 받는다.
 * 앱은 이 값을 확인 화면에 채워 보여주고, 사용자가 고친 뒤 기록 라운드로 저장한다 (src/scorecard.ts).
 * - 관리자만: 앱의 Supabase 로그인 토큰으로 Supabase 의 is_admin() (supabase/admin.sql) 을 불러 확인한다
 * - 필요한 환경변수: ANTHROPIC_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 */

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const MODEL = "claude-opus-5-5";
/** 앱이 줄여서 보내지만(긴 쪽 2000px JPEG) 혹시 모를 큰 요청은 막는다 (base64 글자 수) */
const MAX_IMAGE_CHARS = 4_000_000;
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const nInt = nullable({ type: "integer" });

/** 돌려받을 모양. 읽을 수 없는 칸은 null */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isScorecard", "date", "courseName", "teeName", "playerName", "holes", "totals"],
  properties: {
    isScorecard: { type: "boolean" },
    date: nullable({ type: "string", format: "date" }),
    courseName: nullable({ type: "string" }),
    teeName: nullable({ type: "string" }),
    playerName: nullable({ type: "string" }),
    holes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hole", "par", "score", "putts", "fairway", "gir", "penalty", "sand"],
        properties: {
          hole: { type: "integer" },
          par: nInt,
          score: nInt,
          putts: nInt,
          fairway: nullable({ type: "string", enum: ["hit", "left", "right", "short"] }),
          gir: nullable({ type: "boolean" }),
          penalty: nInt,
          sand: nInt,
        },
      },
    },
    totals: {
      type: "object",
      additionalProperties: false,
      required: ["outScore", "inScore", "totalScore", "outPutts", "inPutts", "totalPutts"],
      properties: {
        outScore: nInt,
        inScore: nInt,
        totalScore: nInt,
        outPutts: nInt,
        inPutts: nInt,
        totalPutts: nInt,
      },
    },
  },
};

const PROMPT = `This image should be a golf scorecard, often a screenshot exported from a golf app. Read it and fill in the JSON schema.

- isScorecard: false if the image is not a golf scorecard (then leave the other fields null or empty).
- date: the round date as YYYY-MM-DD.
- courseName: the course name exactly as printed, without a trailing hole count such as "(18)". Example: "클럽72 (오션)".
- teeName: the label of the yardage row (the tee), e.g. "Regular", "White", "Blue".
- playerName: the name of the player whose scores you read. If there are several players, read only the first player.
- holes: one entry per hole that appears on the card, in order (9 or 18 entries). hole is the hole number.
  - par: from the par row (파 / Par).
  - score: the player's strokes on that hole. The number is often drawn inside a square or circle whose shape or color shows birdie/par/bogey; read only the number. Ignore small dots under the number (they mark handicap stroke holes).
  - putts: from the putts row (퍼트 / Putts).
  - fairway: from the fairway row (페어웨이 / Fairway / FIR). A target or circle symbol means the fairway was hit: "hit". An arrow pointing left or up-left means a miss to the left: "left". An arrow pointing right or up-right means a miss to the right: "right". An arrow pointing down means the drive came up short: "short". Blank cells (par 3 holes, or nothing recorded): null.
  - gir: from the green-in-regulation row (그린적중률 / GIR). A check mark: true. A blank cell when the row exists: false. No such row: null.
  - penalty: the number in the penalty row (패널티 / Penalty). sand: the number in the sand shot row (샌드샷 / Sand).
- totals: the subtotals printed on the card for the player's strokes and putts: OUT (아웃, holes 1-9), IN (인, holes 10-18) and TOTAL (합계). Use null when a subtotal is not printed.

Copy what is printed. Never compute or guess a value; if a cell is unreadable or missing, use null.`;

/** 이 로그인 토큰의 사용자가 관리자인지 Supabase 에 묻는다. 토큰이 틀리거나 만료됐으면 "signed-out" */
async function adminCheck(token: string): Promise<"admin" | "not-admin" | "signed-out"> {
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return "signed-out";
  try {
    const r = await fetch(`${url}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: { apikey: anon, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
    });
    if (r.status === 401) return "signed-out";
    return r.ok && (await r.json()) === true ? "admin" : "not-admin";
  } catch {
    return "not-admin";
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json(503, { error: "NO_KEY" });
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s*/i, "");
  const who = await adminCheck(token);
  if (who === "signed-out") return json(401, { error: "UNAUTHORIZED" });
  if (who === "not-admin") return json(403, { error: "ADMIN_ONLY" });

  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "BAD_REQUEST" });
  }
  const image = typeof body.image === "string" ? body.image : "";
  const mediaType = MEDIA_TYPES.find((t) => t === body.mediaType) as MediaType | undefined;
  if (!image || !mediaType) return json(400, { error: "BAD_REQUEST" });
  if (image.length > MAX_IMAGE_CHARS) return json(413, { error: "TOO_LARGE" });

  // 함수 시간 제한(60초) 안에 끝나도록 다시 시도하지 않는다 (앱에서 다시 누르면 된다)
  const client = new Anthropic({ timeout: 55_000, maxRetries: 0 });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // 안전 판단으로 거절되면 서버가 알맞은 다른 모델로 다시 돌린다
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return json(422, { error: "UNREADABLE" });
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json(422, { error: "UNREADABLE" });
    const card = JSON.parse(text.text) as { isScorecard?: boolean };
    if (!card.isScorecard) return json(422, { error: "NOT_SCORECARD" });
    return json(200, card);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: "BUSY" });
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: "TIMEOUT" });
    if (e instanceof SyntaxError) return json(422, { error: "UNREADABLE" });
    console.error("scorecard", e);
    return json(502, { error: "UPSTREAM" });
  }
}
