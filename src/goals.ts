import { cachedRanking, loadRanking, type RankRound } from "./ranking";
import { setNoticeSource, type NoticeItem } from "./notices";

/*
 * 시즌 목표: 올해 평균 타수 · 베스트 스코어 · 라운드 수 (각각 고르지 않아도 된다).
 * 목표는 내 계정(user_metadata.mg_goal)에, 진행은 랭킹과 같은 자료(18홀을 끝까지 친 라운드, ranking.sql)로 계산한다.
 * 이루면 종 알림에 '시즌 목표를 이뤘어요' (이룬 날부터 30일)
 */

export type GoalKind = "avg" | "best" | "rounds";
export interface SeasonGoal {
  year: number;
  avg?: number;
  best?: number;
  rounds?: number;
  /** 한 줄 다짐 */
  motto?: string;
  /** 다짐한 날 YYYY-MM-DD (이날 전에 이미 이룬 목표는 알림·축하하지 않는다) */
  setOn?: string;
}

export const GOAL_KINDS: GoalKind[] = ["avg", "best", "rounds"];
export const GOAL_LABEL: Record<GoalKind, string> = { avg: "평균 타수", best: "베스트 스코어", rounds: "라운드 수" };
/** 목표를 고를 때 한 줄 */
export const GOAL_TAGLINE: Record<GoalKind, string> = {
  avg: "매 라운드가 쌓여 만드는 꾸준함",
  best: "언젠가 꼭 오는 인생 라운드",
  rounds: "필드 위에서 보낸 날들",
};
export const GOAL_UNIT: Record<GoalKind, string> = { avg: "타", best: "타", rounds: "라운드" };
/** 한 줄 다짐 최대 글자 */
export const MOTTO_MAX = 30;
/** 평균은 이만큼 쳐야 계산한다 (한두 번으로 이루지 않게) */
export const AVG_MIN_ROUNDS = 3;
/** 입력 범위 */
export const GOAL_RANGE: Record<GoalKind, [number, number]> = { avg: [55, 150], best: [50, 150], rounds: [1, 300] };
/** 타수 막대: 목표보다 이만큼 위에서 시작해 목표에서 꽉 찬다 */
const SPAN = 10;
/** 이룬 날부터 종 알림에 남기는 날 */
const NOTICE_DAYS = 30;

export const todaySeoul = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
export const seoulYear = () => Number(todaySeoul().slice(0, 4));

/** 계정에 저장된 값 → 목표 (숫자가 아닌 값은 버린다) */
export function parseGoal(v: unknown): SeasonGoal | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.year !== "number") return null;
  const g: SeasonGoal = { year: o.year };
  for (const k of GOAL_KINDS) if (typeof o[k] === "number" && Number.isFinite(o[k])) g[k] = o[k] as number;
  if (typeof o.motto === "string" && o.motto.trim()) g.motto = o.motto.trim().slice(0, MOTTO_MAX);
  if (typeof o.setOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.setOn)) g.setOn = o.setOn;
  return g;
}

/** "86.4" → 86.4 (평균은 0.1 단위, 나머지는 정수). 비었거나 범위 밖이면 null */
export function parseGoalInput(kind: GoalKind, text: string): number | null {
  const t = text.replace(",", ".").trim();
  if (!t) return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  const r = kind === "avg" ? Math.round(v * 10) / 10 : Math.round(v);
  const [lo, hi] = GOAL_RANGE[kind];
  return r >= lo && r <= hi ? r : null;
}

export const hasGoal = (g: SeasonGoal | null | undefined, year = seoulYear()): g is SeasonGoal =>
  !!g && g.year === year && GOAL_KINDS.some((k) => g[k] != null);

/** 목표 한 줄 요약 "평균 85타 · 베스트 79타 · 30라운드" */
export function goalSummary(g: SeasonGoal): string {
  return [
    g.avg != null && `평균 ${g.avg}타`,
    g.best != null && `베스트 ${g.best}타`,
    g.rounds != null && `${g.rounds}라운드`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface GoalProgress {
  kind: GoalKind;
  target: number;
  /** 지금 값 (평균은 AVG_MIN_ROUNDS 라운드 전이면 null, 베스트는 라운드가 없으면 null) */
  current: number | null;
  done: boolean;
  /** 남은 타수·라운드 (이뤘거나 계산 전이면 null) */
  remain: number | null;
  /** 막대 0~1 */
  fill: number;
  /** 이룬 날 YYYY-MM-DD */
  achievedOn: string | null;
  /** 베스트 라운드 */
  bestRound?: RankRound;
  /** 목표를 처음 이룬 라운드 (베스트·라운드 수) */
  achievedRound?: RankRound;
  /** 라운드 수: 이 속도면 올해 몇 라운드 */
  pace?: number;
  /** 올해 18홀 라운드 수 */
  played: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const strokeFill = (current: number | null, target: number) =>
  current == null ? 0 : clamp01((target + SPAN - current) / SPAN);

/** 올해 내 18홀 라운드 (날짜 순) */
export function seasonRounds(rounds: RankRound[], uid: string, year: number): RankRound[] {
  return rounds
    .filter((r) => r.uid === uid && r.holes === 18 && r.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 목표마다 진행 (고른 목표만, 평균 · 베스트 · 라운드 수 순서) */
export function goalProgress(goal: SeasonGoal, mine: RankRound[], today = todaySeoul()): GoalProgress[] {
  const played = mine.length;
  const out: GoalProgress[] = [];

  if (goal.avg != null) {
    const target = goal.avg;
    // 평균이 목표 아래로 내려와 지금까지 그대로인 첫날
    let sum = 0;
    let since: string | null = null;
    mine.forEach((r, i) => {
      sum += r.gross;
      const ok = i + 1 >= AVG_MIN_ROUNDS && sum / (i + 1) <= target;
      since = ok ? since ?? r.date : null;
    });
    const current = played >= AVG_MIN_ROUNDS ? r1(sum / played) : null;
    const done = current != null && current <= target;
    out.push({
      kind: "avg",
      target,
      current,
      done,
      remain: current != null && !done ? r1(current - target) : null,
      fill: done ? 1 : strokeFill(current, target),
      achievedOn: done ? since : null,
      played,
    });
  }

  if (goal.best != null) {
    const target = goal.best;
    const bestRound = mine.reduce<RankRound | undefined>(
      (a, r) => (!a || r.gross < a.gross || (r.gross === a.gross && r.date < a.date) ? r : a),
      undefined
    );
    const current = bestRound?.gross ?? null;
    const done = current != null && current <= target;
    out.push({
      kind: "best",
      target,
      current,
      done,
      remain: current != null && !done ? current - target : null,
      fill: done ? 1 : strokeFill(current, target),
      achievedOn: mine.find((r) => r.gross <= target)?.date ?? null,
      bestRound,
      achievedRound: mine.find((r) => r.gross <= target),
      played,
    });
  }

  if (goal.rounds != null) {
    const target = goal.rounds;
    const done = played >= target;
    // 올해 지난 날 비율로 연말 라운드 수 어림
    const y = Number(today.slice(0, 4));
    const start = Date.UTC(y, 0, 1);
    const day = (Date.parse(`${today}T00:00:00Z`) - start) / 86_400_000 + 1;
    const days = (Date.UTC(y + 1, 0, 1) - start) / 86_400_000;
    out.push({
      kind: "rounds",
      target,
      current: played,
      done,
      remain: done ? null : target - played,
      fill: clamp01(played / target),
      achievedOn: done ? mine[target - 1]?.date ?? null : null,
      achievedRound: done ? mine[target - 1] : undefined,
      pace: played > 0 ? Math.round((played / day) * days) : undefined,
      played,
    });
  }
  return out;
}

/** "평균 85타 이하" "베스트 79타 이하" "30라운드" */
export const goalTargetText = (p: { kind: GoalKind; target: number }) =>
  p.kind === "rounds" ? `${p.target}라운드` : `${p.kind === "avg" ? "평균" : "베스트"} ${p.target}타 이하`;

export const dayLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

/** 목표를 이룬 것을 기억하는 키 (알림·축하) */
export const goalAchieveId = (goal: SeasonGoal, p: GoalProgress) => `goal:${goal.year}:${p.kind}:${p.target}`;

/** 다짐한 뒤에 이룬 목표인지 (다짐하기 전에 이미 이룬 목표는 알리지 않는다) */
export const achievedAfterPledge = (goal: SeasonGoal, p: GoalProgress) =>
  p.done && !!p.achievedOn && (!goal.setOn || p.achievedOn >= goal.setOn);

/** 이룬 지 NOTICE_DAYS 안 된 목표 → 종 알림 */
export function goalNotices(goal: SeasonGoal, progress: GoalProgress[], today = todaySeoul()): NoticeItem[] {
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) - NOTICE_DAYS * 86_400_000).toISOString().slice(0, 10);
  return progress
    .filter((p) => achievedAfterPledge(goal, p) && p.achievedOn! >= limit)
    .map((p) => ({
      id: goalAchieveId(goal, p),
      kind: "goal" as const,
      title: "시즌 목표를 이뤘어요",
      sub: `${goalTargetText(p)} · ${dayLabel(p.achievedOn!)}`,
      hint: "눌러서 시즌 목표 보기",
      page: "goals" as const,
    }));
}

let lastCheck: { key: string; at: number } | null = null;
/** 이보다 자주 랭킹 자료를 다시 받지 않는다 */
const CHECK_MS = 5 * 60_000;

/** 진행을 계산해 종 알림을 고친다 (목표 화면이 이미 계산했으면 그 값을 넘긴다) */
export function publishGoalNotices(goal: SeasonGoal | null | undefined, progress: GoalProgress[] | null) {
  setNoticeSource("goals", goal && progress ? goalNotices(goal, progress) : []);
}

/** 올해 목표가 있으면 랭킹 자료를 받아(가끔) 이룬 목표를 종 알림에 올린다 */
export async function checkGoalNotices(uid: string, goal: SeasonGoal | null | undefined): Promise<void> {
  if (!uid || !hasGoal(goal)) {
    publishGoalNotices(null, null);
    return;
  }
  const key = `${uid}:${JSON.stringify(goal)}`;
  const fresh = lastCheck?.key === key && Date.now() - lastCheck.at < CHECK_MS;
  const data = fresh ? cachedRanking() : null;
  try {
    const d = data ?? (await loadRanking());
    lastCheck = { key, at: Date.now() };
    publishGoalNotices(goal, goalProgress(goal, seasonRounds(d.rounds, uid, goal.year)));
  } catch (e) {
    console.warn("시즌 목표를 확인하지 못함", e);
  }
}

/* ---------- 목표 세우기 · 응원 ---------- */

/** 시즌(올해) 마감까지 남은 날 */
export function seasonDaysLeft(today = todaySeoul()): number {
  const y = Number(today.slice(0, 4));
  return Math.round((Date.UTC(y, 11, 31) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export interface GoalPreset {
  label: string;
  value: number;
}

/** 이 타수보다 낮은 가장 가까운 이정표 (100·90·80타 깨기, 이븐파) */
function milestone(score: number): GoalPreset {
  if (score >= 100) return { label: "100타 깨기", value: 99 };
  if (score >= 90) return { label: "90타 깨기", value: 89 };
  if (score >= 80) return { label: "80타 깨기", value: 79 };
  if (score > 72) return { label: "이븐파", value: 72 };
  return { label: `${73 - score}언더`, value: score - 1 };
}

/** 같은 값은 하나만, 큰 값(쉬운 목표)부터 */
function uniq(list: GoalPreset[], asc = false): GoalPreset[] {
  const seen = new Set<number>();
  return list
    .filter((p) => !seen.has(p.value) && seen.add(p.value))
    .sort((a, b) => (asc ? a.value - b.value : b.value - a.value));
}

/** 목표 고르기 추천 세 개: 한 걸음 · 도전 · 꿈 (지금 기록에서) */
export function goalPresets(
  kind: GoalKind,
  now: { avg: number | null; best: number | null; played: number }
): GoalPreset[] {
  const [lo] = GOAL_RANGE[kind];
  if (kind === "avg") {
    if (now.avg == null)
      return [
        { label: "100타 깨기", value: 99 },
        { label: "90대 초반", value: 93 },
        { label: "80대", value: 89 },
      ];
    const a = Math.floor(now.avg);
    return uniq([
      { label: "한 걸음", value: Math.max(lo, a - 1) },
      { label: "도전", value: Math.max(lo, a - 3) },
      { label: "꿈", value: Math.max(lo, a - 6) },
    ]);
  }
  if (kind === "best") {
    if (now.best == null)
      return [
        { label: "100타 깨기", value: 99 },
        { label: "90타 깨기", value: 89 },
        { label: "80타 깨기", value: 79 },
      ];
    const b = now.best;
    const m = milestone(b);
    // 이정표가 코앞(3타 안)이면 그게 첫걸음, 꿈은 그다음 이정표. 멀면 한 걸음 · 도전 · 이정표(꿈)
    return uniq(
      b - m.value <= 3
        ? [m, { label: "도전", value: Math.max(lo, b - 4) }, milestone(m.value)]
        : [{ label: "한 걸음", value: Math.max(lo, b - 2) }, { label: "도전", value: Math.max(lo, b - 4) }, m]
    ).slice(0, 3);
  }
  const list = [
    { label: "한 달에 한 번", value: 12 },
    { label: "한 달에 두 번", value: 24 },
    { label: "주말마다", value: 40 },
  ].filter((p) => p.value > now.played);
  const more = [
    { label: "조금 더", value: now.played + 5 },
    { label: "더 많이", value: now.played + 10 },
    { label: "필드가 집", value: now.played + 20 },
  ];
  // 달력 기준(한 달에 한 번…)을 먼저 채우고 모자라면 지금보다 조금 더
  const picked = [...list, ...more].filter((p, i, a) => a.findIndex((x) => x.value === p.value) === i).slice(0, 3);
  return picked.sort((a, b) => a.value - b.value);
}

/** 목표 카드 응원 한 줄 */
export function goalMessage(p: GoalProgress): string {
  const at = (r?: RankRound) => (r ? `${dayLabel(r.date)} ${r.course}에서` : "");
  if (p.kind === "avg") {
    if (p.current == null) return `18홀을 ${AVG_MIN_ROUNDS}라운드 치면 평균이 나와요 · 지금 ${p.played}라운드`;
    if (p.done) return "목표 안쪽이에요. 이 감각 그대로 시즌을 마무리해요.";
    if (p.remain! <= 1) return `${p.remain}타, 손에 잡히는 거리예요.`;
    return `라운드마다 ${p.remain}타, 홀당 ${Math.max(0.1, Math.round((p.remain! / 18) * 10) / 10)}타씩이면 돼요.`;
  }
  if (p.kind === "best") {
    if (p.current == null) return "올해 첫 18홀을 기다리고 있어요.";
    if (p.done) return `${at(p.achievedRound)} 해냈어요.`.trim();
    if (p.remain! <= 2) return `${p.remain}타 차이. 다음 라운드가 그날일지도 몰라요.`;
    return `지금 베스트는 ${at(p.bestRound)} 친 ${p.current}타예요.`;
  }
  if (p.done) return `${p.target}번째 라운드를 ${p.achievedOn ? dayLabel(p.achievedOn) : ""}에 채웠어요.`;
  return p.pace != null
    ? `${p.remain}라운드 남았어요 · 이 속도면 올해 약 ${p.pace}라운드`
    : `${p.remain}라운드 남았어요. 첫 라운드를 기다리고 있어요.`;
}
