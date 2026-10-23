import Anthropic from "@anthropic-ai/sdk";

/*
 * 라운드 기록 AI 분석 (Vercel 함수, POST /api/insight) — 관리자와 관리자가 허용한 사람만
 * 앱이 이 라운드 기록과 같은 사람의 평소 기록(지난 라운드 평균)·같은 코스 기록을 정리해 보내면,
 * Claude 가 화면 칸마다 붙일 짧은 분석(지표·티샷·스코어 분포·같은 코스 비교·종합)을 돌려준다.
 * 앱은 받은 분석을 round_insights (supabase/insight.sql) 에 저장해 다시 열 때 쓴다.
 * - 권한: 앱의 Supabase 로그인 토큰으로 can_use_ai() (supabase/insight.sql) 를 불러 확인한다
 *   (insight.sql 을 아직 실행하지 않은 DB 면 is_admin() 으로)
 * - 필요한 환경변수: ANTHROPIC_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (+ 조직 키면 ANTHROPIC_WORKSPACE_ID)
 * (scorecard.ts 와 같은 도우미를 쓰지만, 함수마다 따로 묶여 배포되도록 파일 안에 둔다)
 */

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const MODEL = "claude-opus-5-5";
/** 라운드 기록 JSON 크기 상한 (18홀 + 평소 기록이면 수 KB) */
const MAX_INPUT_CHARS = 60_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** 돌려받을 모양: 화면 칸마다 붙일 문단 */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["stats", "teeShot", "scoring", "course", "summary"],
  properties: {
    stats: { type: "string" },
    teeShot: { type: "string" },
    scoring: { type: "string" },
    course: { type: "string" },
    summary: { type: "string" },
  },
};

const PROMPT = `당신은 아마추어 골퍼의 타수를 줄여 주는 코치예요.
목적은 칭찬이나 일반론이 아니라, 이 기록에서 타수를 잃은 곳을 숫자로 짚고 그 원인과 바로 해 볼 연습·공략을 구체적으로 알려 주는 거예요.

입력 JSON
- round: 이번 라운드. 합계와 비율(n 번 중 of, pct %), 파3·파4·파5 파 대비 평균(parTypes),
  타수 손실 근거(strokeLeaks: 3퍼트 이상으로 더 친 퍼트 threePuttExtra, 벌타 penalties, 벙커에서 한 번에 못 나와 더 친 샷 bunkerExtra,
  보기를 넘긴 타수 beyondBogey — 각각 타수와 홀 번호, 그린을 놓친 홀 missedGreenHoles, GIR 후 3퍼트 홀 girThreePuttHoles), 홀별 기록(holes).
- usual: 같은 골퍼의 평소(다른 라운드 평균, 라운드당 손실 leaksPerRound 포함). 없으면 null.
- sameCourse: 같은 코스에서 친 다른 라운드 평균과 홀별 평균 타수. 없으면 null.
- round.greenSpeed: 그린스피드(스팀프미터 m). 없으면 null. 2.8 이상은 빠른 그린, 2.4 이하는 느린 그린이에요. 퍼트 기록을 해석할 때만 써요.

각 칸은 이 순서로 써요.
1) 무엇이 타수를 잃게 했는지: 숫자와 홀 번호로 (예: "GIR 6번 중 3번이 3퍼트(2·7·15번 홀)로 3타를 더 쳤어요")
2) 기록으로 보아 가능성이 큰 원인
3) 다음 연습이나 라운드에서 바로 할 구체적인 방법 (무엇을, 어느 거리에서, 몇 번)
4) 고치면 줄일 수 있는 타수 (근거 숫자에서 어림)

해석 기준 (기록이 그렇게 말할 때만 써요)
- GIR 후 3퍼트가 많다: 그린에 올렸어도 핀에서 멀었다는 뜻이라 아이언 거리 정확도(번호별 캐리 거리 확인, 핀보다 그린 가운데 공략)와 10m 이상 롱퍼트 거리감을 함께 짚어요.
- 페어웨이는 지켰는데 GIR 이 낮다: 세컨드 샷(아이언·유틸) 정확도와 클럽 선택.
- 페어웨이가 낮고 훅이나 슬라이스로 치우친다: 정렬·스윙 경로, 그 방향에 OB·해저드가 있던 홀은 티샷 클럽을 낮추는 공략.
- 짧은 티샷(짧음)이 많다: 임팩트·탑볼.
- 그린 놓친 홀 추가 샷이 1.5 이상이거나 스크램블이 낮다: 30~50m 어프로치와 칩샷으로 한 번에 그린에 올리기.
- 벙커에서 더 친 샷이 있거나 샌드 세이브가 낮다: 벙커에서 한 번에 나오기.
- 벌타가 보기를 넘긴 홀과 겹친다: 그 홀의 티샷 클럽·목표 선택(코스 매니지먼트).
- 파3 평균이 나쁘다: 미들·롱 아이언 정확도. 파5 가 나쁘다: 레이업 거리와 세 번째 샷 거리 선택.
- 전반과 후반 차이가 크다: 후반 체력·루틴.

다섯 칸
- stats: 지표(페어웨이·GIR·홀당 퍼트·GIR 후 3퍼트·스크램블·그린 놓친 홀 추가 샷·샌드 세이브) 가운데 타수를 가장 많이 잃게 한 두 가지.
- teeShot: 티샷 방향·OB·해저드·벙커가 만든 손실과 공략.
- scoring: 스코어 분포와 보기를 넘긴 홀들(beyondBogey)의 공통 원인, 파3·4·5 가운데 약한 쪽.
- course: sameCourse 가 있으면 이 코스 평균(몇 라운드인지)과 비교하고, 평균보다 크게 잃은 홀의 공략. sameCourse 가 null 이면 빈 문자열("").
- summary: 첫 문장은 이번 라운드 한 줄 평. 이어서 다음 라운드 우선순위 두 가지와 각각 줄일 수 있는 타수.

규칙
- 각 칸 3~5문장, 350자 안팎. 해요체. 표·목록·마크다운 없이 문장으로만.
- JSON 에 있는 값으로만 말해요. 비율은 소수 첫째 자리까지, 계산은 정확히.
- 원인은 기록으로 짐작한 것이니 "~했을 가능성이 커요"처럼 써요.
- usual 이 있으면 평소와 견줘 무엇이 나빠지거나 좋아졌는지도 짚어요. 없으면 비교하지 않아요.
- 다른 골퍼 평균·핸디캡별 통계 같은 바깥 수치는 쓰지 않아요.
- 값이 null 이거나 분모가 0 인 항목은 말하지 않아요.
- "꾸준히 연습하세요", "자신감을 가지세요" 같은 막연한 말은 쓰지 않아요.`;

/** 이 로그인 토큰의 사용자가 AI 분석을 쓸 수 있는지 Supabase 에 묻는다. 토큰이 틀리거나 만료됐으면 "signed-out" */
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
    let r = await rpc("can_use_ai");
    // insight.sql 을 아직 실행하지 않아 함수가 없으면 관리자만
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
  let input: { round?: unknown; usual?: unknown; sameCourse?: unknown };
  try {
    input = JSON.parse(raw);
  } catch {
    return json(400, { error: "BAD_REQUEST" });
  }
  if (!input || typeof input.round !== "object" || input.round === null) return json(400, { error: "BAD_REQUEST" });

  const workspace = env.ANTHROPIC_WORKSPACE_ID?.trim();
  // 함수 시간 제한(60초) 안에 끝나도록 다시 시도하지 않는다 (앱에서 다시 누르면 된다)
  const client = new Anthropic({
    timeout: 55_000,
    maxRetries: 0,
    ...(workspace && { defaultHeaders: { "anthropic-workspace-id": workspace } }),
  });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // 안전 판단으로 거절되면 서버가 알맞은 다른 모델로 다시 돌린다
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: `${PROMPT}\n\n${JSON.stringify({ round: input.round, usual: input.usual ?? null, sameCourse: input.sameCourse ?? null })}`,
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
    return json(200, {
      sections: {
        stats: pick("stats"),
        teeShot: pick("teeShot"),
        scoring: pick("scoring"),
        course: input.sameCourse ? pick("course") : "",
        summary: pick("summary"),
      },
      model: response.model,
    });
  } catch (e) {
    console.error("insight", e);
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: "BUSY" });
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: "TIMEOUT" });
    if (e instanceof SyntaxError) return json(422, { error: "UNREADABLE" });
    // 키·워크스페이스·크레딧 설정 문제는 관리자가 고칠 수 있게 따로 알린다
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
