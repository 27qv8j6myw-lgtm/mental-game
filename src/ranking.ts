import { supabase } from "./supabase";
import { recordRound, type RecordRound } from "./recordStats";
import type { CourseRating, Fairway, GameMode, Gender, HoleStat, TeeLie } from "./types";

/*
 * 랭킹: 모든 이용자의 18홀 평균 타수 순위 (월별·연도별) + 순위 변화.
 * 다른 사람 라운드는 볼 수 없어서 supabase/ranking.sql 의 함수로 받는다.
 */

export interface RankPlayer {
  uid: string;
  name: string;
  photoUrl: string | null;
  gender: Gender;
}

/**
 * 내 공개 범위: 함께 친 사람만(기본) / 전체 공개 / 숨기기.
 * 내가 보는 범위도 이것을 따른다 (서버가 함께 친 사람끼리, 전체 공개끼리만 돌려준다)
 */
export type Visibility = "played" | "all" | "hidden";

/** 한 사람이 끝까지 친 라운드 하나 */
export interface RankRound {
  uid: string;
  roundId: string;
  /** YYYY-MM-DD */
  date: string;
  course: string;
  holes: number;
  gross: number;
}

export interface RankingData {
  visibility: Visibility;
  /** 내가 랭킹에서 숨겼다 (그러면 내 기록만 받는다) */
  hidden: boolean;
  /** 내 랭킹에서 뺀 사람 (uid → 뺄 때 이름) */
  excluded: Map<string, string>;
  players: Map<string, RankPlayer>;
  rounds: RankRound[];
}

/** ranking.sql 을 아직 실행하지 않은 DB */
export class RankingSetupError extends Error {}
const isMissingFn = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";
const isMissingTable = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01";

let cache: RankingData | null = null;

export async function loadRanking(): Promise<RankingData> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const [{ data, error }, ex] = await Promise.all([
    supabase.rpc("ranking_rounds"),
    supabase.from("ranking_excludes").select("excluded_uid,name"),
  ]);
  if (error) throw isMissingFn(error) ? new RankingSetupError(error.message) : error;
  if (ex.error) throw isMissingTable(ex.error) ? new RankingSetupError(ex.error.message) : ex.error;
  const v = (data ?? { players: [], rounds: [] }) as {
    visibility?: Visibility;
    players: { uid: string; name: string; photo_url: string | null; gender: Gender }[];
    rounds: { uid: string; round_id: string; date: string; course: string; holes: number; gross: number }[];
  };
  const visibility = v.visibility ?? "played";
  cache = {
    visibility,
    hidden: visibility === "hidden",
    excluded: new Map(
      ((ex.data ?? []) as { excluded_uid: string; name: string }[]).map((x) => [x.excluded_uid, x.name])
    ),
    players: new Map(
      v.players.map((p) => [p.uid, { uid: p.uid, name: p.name, photoUrl: p.photo_url, gender: p.gender }])
    ),
    rounds: v.rounds.map((r) => ({
      uid: r.uid,
      roundId: r.round_id,
      date: r.date,
      course: r.course,
      holes: r.holes,
      gross: r.gross,
    })),
  };
  return cache;
}

/** 마지막으로 받은 랭킹 (탭을 다시 열 때 먼저 보여 준다) */
export const cachedRanking = () => cache;

/* ---------- 공개 범위 · 제외 ---------- */

/** 내 랭킹에서 그 사람을 빼고 순위를 매긴다 (그 사람에게는 영향 없음) */
export async function excludeFromRanking(uid: string, name: string): Promise<void> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data: auth } = await supabase.auth.getSession();
  const { error } = await supabase
    .from("ranking_excludes")
    .upsert({ user_id: auth.session?.user.id, excluded_uid: uid, name });
  if (error) throw isMissingTable(error) ? new RankingSetupError(error.message) : error;
  cache?.excluded.set(uid, name);
}

/** 제외한 사람을 다시 넣는다 */
export async function includeInRanking(uid: string): Promise<void> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.from("ranking_excludes").delete().eq("excluded_uid", uid);
  if (error) throw isMissingTable(error) ? new RankingSetupError(error.message) : error;
  cache?.excluded.delete(uid);
}

/** 제외한 사람을 뺀 랭킹 자료 (순위·기간 계산에 쓴다) */
export const withoutExcluded = (data: RankingData): RankingData =>
  data.excluded.size === 0 ? data : { ...data, rounds: data.rounds.filter((r) => !data.excluded.has(r.uid)) };

export async function setRankingVisibility(visibility: Visibility): Promise<void> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.rpc("set_ranking_visibility", { p_visibility: visibility });
  if (error) throw isMissingFn(error) ? new RankingSetupError(error.message) : error;
  // 다음에 랭킹·전적을 열 때 새로 받게
  cache = null;
}

/* ---------- 순위 계산 (네트워크 없이, 테스트 가능) ---------- */

export type PeriodKind = "month" | "year";

/** 순위 한 줄 */
export interface RankRow {
  uid: string;
  /** 같은 평균이면 같은 순위 */
  rank: number;
  avg: number;
  rounds: number;
  best: number;
  /** 지난 비교 시점 대비 오른 순위(+)·내린 순위(−). 그때 순위에 없었으면 "new", 비교할 순위가 없으면 null */
  change: number | "new" | null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 18홀을 끝까지 친 라운드로 평균이 낮은 순 (같으면 많이 친 사람, 베스트가 좋은 사람 먼저) */
export function rankRounds(rounds: RankRound[]): Omit<RankRow, "change">[] {
  const by = new Map<string, number[]>();
  for (const r of rounds) {
    if (r.holes !== 18) continue;
    by.set(r.uid, [...(by.get(r.uid) ?? []), r.gross]);
  }
  const rows = [...by.entries()].map(([uid, gs]) => ({
    uid,
    raw: gs.reduce((a, b) => a + b, 0) / gs.length,
    rounds: gs.length,
    best: Math.min(...gs),
  }));
  rows.sort((a, b) => a.raw - b.raw || b.rounds - a.rounds || a.best - b.best);
  return rows.map((r) => ({
    uid: r.uid,
    rank: 1 + rows.filter((x) => x.raw < r.raw).length,
    avg: round1(r.raw),
    rounds: r.rounds,
    best: r.best,
  }));
}

/** 기간 키: 월 "2026-10" / 연 "2026" → "2026년 10월" / "2026년" */
export const periodLabel = (key: string) =>
  key.length === 4 ? `${key}년` : `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`;

/** 순위가 있는 기간 (최근 순) */
export function periodsOf(data: RankingData, kind: PeriodKind): string[] {
  const keys = new Set(
    data.rounds.filter((r) => r.holes === 18).map((r) => r.date.slice(0, kind === "year" ? 4 : 7))
  );
  return [...keys].sort((a, b) => b.localeCompare(a));
}

/** "2026-10" → "2026-09" */
function prevMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * 한 기간의 순위와 전월 대비 순위 변화.
 * - 월별: 그 달 순위 ↔ 전달 순위
 * - 연도별: 그해 순위 ↔ 지난달 말까지의 그해 순위 (지난 해는 11월 말까지와 비교)
 * today: 오늘 날짜 YYYY-MM-DD (연도별에서 '지난달 말'을 정한다)
 */
export function ranking(
  data: RankingData,
  kind: PeriodKind,
  key: string,
  today: string
): { rows: RankRow[]; compare: string | null } {
  let cur: RankRound[];
  let prev: RankRound[];
  let compare: string | null;
  if (kind === "month") {
    const before = prevMonth(key);
    cur = data.rounds.filter((r) => r.date.startsWith(key));
    prev = data.rounds.filter((r) => r.date.startsWith(before));
    compare = "전월 대비";
  } else {
    // 이번 해면 이번 달 1일, 지난 해면 12월 1일 전까지가 '지난달 말' 순위
    const cut = key === today.slice(0, 4) ? `${today.slice(0, 7)}-01` : `${key}-12-01`;
    cur = data.rounds.filter((r) => r.date.startsWith(key));
    prev = data.rounds.filter((r) => r.date >= `${key}-01-01` && r.date < cut);
    // 1월이면 그해 지난달이 없어 비교하지 않는다
    compare = cut.slice(5, 7) === "01" ? null : "전월 대비";
  }
  const before = new Map(rankRounds(prev).map((r) => [r.uid, r.rank]));
  // 비교할 순위가 하나도 없으면 변화를 보이지 않는다 (모두 NEW 가 되지 않게)
  if (before.size === 0) compare = null;
  const rows = rankRounds(cur).map((r) => {
    const b = before.get(r.uid);
    return { ...r, change: compare == null ? null : b == null ? ("new" as const) : b - r.rank };
  });
  return { rows, compare };
}

/** 한 사람의 전체 기간 18홀 기록: 평균·라운드 수·베스트(날짜·골프장) */
export function overall(data: RankingData, uid: string) {
  const mine = data.rounds.filter((r) => r.uid === uid && r.holes === 18);
  if (mine.length === 0) return null;
  const best = mine.reduce((a, b) => (b.gross < a.gross || (b.gross === a.gross && b.date > a.date) ? b : a));
  return {
    avg: round1(mine.reduce((s, r) => s + r.gross, 0) / mine.length),
    rounds: mine.length,
    best,
  };
}

/* ---------- 이용자 기록 (기록 모드 라운드의 지표) ---------- */

type ProfileRound = {
  id: string;
  date: string;
  course_name: string;
  course_tee: string;
  hole_count: number;
  game_mode: GameMode;
  rating: CourseRating | null;
  /** 그린스피드 (ranking.sql 을 다시 실행하기 전 DB 에는 없음) */
  green_speed?: number | null;
  gender: Gender;
};
type StatRow = { round_id: string; hole_index: number; putts: number | null; fairway: Fairway | null; lie: TeeLie | null; ob: number; hazard: number; sand: number };

/** 그 사람의 기록 라운드 (라운드 기록 화면과 같은 계산) */
export async function loadProfile(uid: string): Promise<RecordRound[]> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data, error } = await supabase.rpc("ranking_profile", { p_uid: uid });
  if (error) throw isMissingFn(error) ? new RankingSetupError(error.message) : error;
  const v = (data ?? { rounds: [], holes: [], scores: [], stats: [] }) as {
    rounds: ProfileRound[];
    holes: { round_id: string; hole_index: number; par: number }[];
    scores: { round_id: string; hole_index: number; rel: number }[];
    stats: StatRow[];
  };
  return v.rounds
    .map((r) =>
      recordRound(
        {
          id: r.id,
          date: r.date,
          courseName: r.course_name,
          courseTee: r.course_tee ?? "",
          holeCount: r.hole_count,
          gameMode: r.game_mode,
          rating: r.rating,
          greenSpeed: r.green_speed == null ? null : Number(r.green_speed),
        },
        v.holes.filter((h) => h.round_id === r.id),
        v.scores.filter((s) => s.round_id === r.id),
        v.stats.filter((s) => s.round_id === r.id) as (HoleStat & { hole_index: number })[],
        r.gender === "female"
      )
    )
    .filter((r) => r.summary.holesPlayed > 0);
}
