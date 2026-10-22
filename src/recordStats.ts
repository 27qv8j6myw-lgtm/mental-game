import { differential, ratingFor } from "./kga";
import { playerRating, teeLie } from "./model";
import { listMyRounds } from "./rounds";
import { fetchRows } from "./stats";
import type { CourseRating, Fairway, GameMode, HoleStat, RoundListItem, TeeBox, TeeLie } from "./types";

/*
 * 기록 모드 라운드 분석.
 * 지표 정의는 Stroke Saver(~/Projects/stroke-saver/src/metrics.ts)와 같다.
 * - 비율의 분모는 판정이 있는 홀뿐이다 (페어웨이를 안 적은 홀은 페어웨이 비율에서 빠진다)
 * - 부분합은 내지 않는다: 한 홀이라도 비면 합계는 null (화면에서 "—")
 */

/** 분석에 쓰는 한 사람의 한 홀 기록 */
export interface HoleRecord {
  /** 0부터 시작하는 홀 번호 */
  hole: number;
  par: number;
  /** 파 대비 타수. 입력 전이면 null */
  rel: number | null;
  putts: number | null;
  fairway: Fairway | null;
  /** 티샷 벙커·OB·해저드 (방향과 함께 고를 수 있다) */
  lie: TeeLie | null;
  ob: number;
  hazard: number;
  sand: number;
}

/** 비율과 그 근거(분자·분모)를 함께 */
export type Frac = { n: number; d: number; rate: number | null };
const frac = (n: number, d: number): Frac => ({ n, d, rate: d === 0 ? null : n / d });
const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

export const EMPTY_STAT: HoleStat = {
  putts: null,
  fairway: null,
  lie: null,
  ob: 0,
  hazard: 0,
  sand: 0,
};

/** GIR 자동 판정: (타수 − 퍼트) ≤ 파 − 2. 스코어나 퍼트가 없으면 판정하지 않는다(null) */
export function girOf(par: number, rel: number | null, putts: number | null): boolean | null {
  if (rel == null || putts == null) return null;
  return par + rel - putts <= par - 2;
}

const played = (h: HoleRecord) => h.rel != null;
const gir = (h: HoleRecord) => girOf(h.par, h.rel, h.putts);
const parFourFive = (h: HoleRecord) => h.par === 4 || h.par === 5;
/** 전체 티샷: 친 파4·파5 홀 (스코어나 티샷 기록이 있는 홀) */
const teeShots = (holes: HoleRecord[]) =>
  holes.filter((h) => parFourFive(h) && (h.rel != null || h.fairway != null || h.lie != null));
/** 티샷 방향을 적은 파4·파5 홀 */
const directed = (holes: HoleRecord[]) =>
  holes.filter((h) => parFourFive(h) && h.fairway != null);

/** 페어웨이 적중률 = 방향이 적중인 홀 / 방향을 적은 파4·5 홀 (벙커·OB·해저드와 상관없이 방향으로만) */
export const fairwayFrac = (holes: HoleRecord[]) => {
  const d = directed(holes);
  return frac(d.filter((h) => h.fairway === "hit").length, d.length);
};

/** 티샷 방향별 홀 수 (훅·적중·짧음·슬라이스) */
export function fairwayMix(holes: HoleRecord[]): Record<Fairway, number> {
  const mix: Record<Fairway, number> = { left: 0, hit: 0, short: 0, right: 0 };
  for (const h of directed(holes)) mix[h.fairway!] += 1;
  return mix;
}

/** 티샷 벙커·OB·해저드 홀 수 */
export function lieCount(holes: HoleRecord[]): Record<TeeLie, number> {
  const out: Record<TeeLie, number> = { bunker: 0, ob: 0, hazard: 0 };
  for (const h of teeShots(holes)) if (h.lie) out[h.lie] += 1;
  return out;
}

/** GIR = GIR 홀 / 판정이 있는 홀 */
export const girFrac = (holes: HoleRecord[]) => {
  const known = holes.filter((h) => gir(h) != null);
  return frac(known.filter((h) => gir(h)).length, known.length);
};

/** GIR 후 3퍼트 = GIR 홀 중 퍼트 ≥ 3 */
export const girThreePuttFrac = (holes: HoleRecord[]) => {
  const g = holes.filter((h) => gir(h) === true);
  return frac(g.filter((h) => h.putts! >= 3).length, g.length);
};

/** 스크램블 = 그린 놓친 홀 중 파 이하 */
export const scramblingFrac = (holes: HoleRecord[]) => {
  const miss = holes.filter((h) => gir(h) === false);
  return frac(miss.filter((h) => h.rel! <= 0).length, miss.length);
};

/** 그린 놓친 홀에서 그린까지 정규 타수(파 − 2)보다 더 친 샷 수의 평균 */
export function extraShotsToGreen(holes: HoleRecord[]): number | null {
  return mean(
    holes
      .filter((h) => gir(h) === false)
      .map((h) => h.par + h.rel! - h.putts! - (h.par - 2))
  );
}

/** 샌드 세이브 = 샌드샷이 있었던 홀 중 파 이하 */
export const sandSaveFrac = (holes: HoleRecord[]) => {
  const s = holes.filter((h) => h.sand >= 1 && played(h));
  return frac(s.filter((h) => h.rel! <= 0).length, s.length);
};

/** 스코어 분포 (친 홀) */
export interface ScoreDist {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double: number;
  triple: number;
}
export function scoreDist(holes: HoleRecord[]): ScoreDist {
  const d: ScoreDist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 };
  for (const h of holes) {
    if (h.rel == null) continue;
    if (h.rel <= -2) d.eagle += 1;
    else if (h.rel === -1) d.birdie += 1;
    else if (h.rel === 0) d.par += 1;
    else if (h.rel === 1) d.bogey += 1;
    else if (h.rel === 2) d.double += 1;
    else d.triple += 1;
  }
  return d;
}

/** 값이 하나라도 비면 null (부분합을 내지 않는다) */
function sumComplete(xs: (number | null)[]): number | null {
  return xs.length === 0 || xs.some((v) => v == null)
    ? null
    : xs.reduce<number>((a, v) => a + v!, 0);
}

export interface RecordSummary {
  /** 스코어를 입력한 홀 수 */
  holesPlayed: number;
  /** 친 홀의 타수 합 / 파 대비 합 */
  strokes: number;
  toPar: number;
  /** 전반·후반 타수 (그 9홀을 다 쳤을 때만) */
  out: number | null;
  in: number | null;
  /** 친 홀의 퍼트 합 (퍼트를 안 적은 홀이 있으면 null) */
  putts: number | null;
  avgPutts: number | null;
  onePutts: number;
  threePutts: number;
  fairway: Frac;
  /** 티샷 방향별 홀 수 */
  mix: Record<Fairway, number>;
  /** 티샷 벙커·OB·해저드 홀 수 */
  lies: Record<TeeLie, number>;
  /** 전체 티샷 수 (친 파4·5 홀). 벙커·OB·해저드 비중의 분모 */
  teeShots: number;
  /** 방향을 안 적은 티샷 수 */
  noDirection: number;
  gir: Frac;
  girThreePutt: Frac;
  scrambling: Frac;
  extraShots: number | null;
  dist: ScoreDist;
  ob: number;
  hazard: number;
  sandShots: number;
  sandSave: Frac;
}

export function summarize(holes: HoleRecord[]): RecordSummary {
  const p = holes.filter(played);
  const nine = (from: number) => {
    const part = holes.filter((h) => h.hole >= from && h.hole < from + 9);
    return part.length === 9 ? sumComplete(part.map((h) => (h.rel == null ? null : h.par + h.rel))) : null;
  };
  return {
    holesPlayed: p.length,
    strokes: p.reduce((s, h) => s + h.par + h.rel!, 0),
    toPar: p.reduce((s, h) => s + h.rel!, 0),
    out: nine(0),
    in: nine(9),
    putts: p.length === 0 ? null : sumComplete(p.map((h) => h.putts)),
    avgPutts: mean(p.filter((h) => h.putts != null).map((h) => h.putts!)),
    onePutts: p.filter((h) => h.putts === 1).length,
    threePutts: p.filter((h) => h.putts != null && h.putts >= 3).length,
    fairway: fairwayFrac(holes),
    mix: fairwayMix(holes),
    lies: lieCount(holes),
    teeShots: teeShots(holes).length,
    noDirection: teeShots(holes).length - directed(holes).length,
    gir: girFrac(holes),
    girThreePutt: girThreePuttFrac(holes),
    scrambling: scramblingFrac(holes),
    extraShots: extraShotsToGreen(holes),
    dist: scoreDist(holes),
    ob: holes.reduce((s, h) => s + h.ob, 0),
    hazard: holes.reduce((s, h) => s + h.hazard, 0),
    sandShots: holes.reduce((s, h) => s + h.sand, 0),
    sandSave: sandSaveFrac(holes),
  };
}

/* ---------- 라운드 기록 불러오기 (홈 '라운드 기록') ---------- */

export interface RecordRound {
  roundId: string;
  date: string;
  courseName: string;
  courseTee: string;
  holeCount: number;
  /** 기록 모드 또는 내 기록을 남긴 내기(타당·스킨스) 라운드 */
  gameMode: GameMode;
  holes: HoleRecord[];
  summary: RecordSummary;
  /** 보정타수: KGA 레이팅이 있고 18홀을 다 친 라운드만 */
  differential: number | null;
  /** KGA 레이팅 (골프장을 목록에서 고른 라운드만) */
  rating: CourseRating | null;
  /** 내 성별 레이팅 "KGA 71/130" (스코어카드 이미지용) */
  ratingLabel: string | null;
}

type StatRow = HoleStat & { round_id: string; hole_index: number; player_uid: string };

/** 홀별 상세 기록 테이블(record.sql)을 아직 만들지 않았으면 상세 기록 없이 계산한다 */
async function fetchStatRows(ids: string[]): Promise<StatRow[]> {
  try {
    return await fetchRows<StatRow>(
      "round_hole_stats",
      "round_id,hole_index,player_uid,putts,fairway,lie,ob,hazard,sand",
      ids
    );
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "PGRST205" || code === "42P01") return [];
    throw e;
  }
}

/**
 * 라운드 기록에 넣을 완료 라운드를 최근 순으로: 기록 모드 라운드 + 내 상세 기록(퍼트·티샷 등)을
 * 한 홀이라도 남긴 내기 라운드. 라운드 목록을 이미 갖고 있으면 넘겨서 다시 받지 않는다
 */
export async function loadRecordRounds(
  myUid: string,
  rounds?: RoundListItem[]
): Promise<RecordRound[]> {
  const done = (rounds ?? (await listMyRounds())).filter((r) => r.status === "done");
  if (done.length === 0) return [];
  // 상세 기록은 완료 라운드 전체에서 받아, 내 기록이 있는 내기 라운드를 고른다
  const stats = await fetchStatRows(done.map((r) => r.id));
  const recorded = new Set(stats.filter((s) => s.player_uid === myUid).map((s) => s.round_id));
  const list = done.filter((r) => r.rules.gameMode === "record" || recorded.has(r.id));
  const ids = list.map((r) => r.id);
  if (ids.length === 0) return [];
  const [pars, scores, players] = await Promise.all([
    fetchRows<{ round_id: string; hole_index: number; par: number }>(
      "round_holes",
      "round_id,hole_index,par",
      ids
    ),
    fetchRows<{ round_id: string; hole_index: number; player_uid: string; rel: number }>(
      "round_scores",
      "round_id,hole_index,player_uid,rel",
      ids
    ),
    // 보정타수에 쓸 레이팅을 고르려고 라운드마다 내 성별·티를 받는다 (티 칸이 없는 DB 면 성별만)
    fetchRows<{ round_id: string; user_uid: string; gender: string; tee?: TeeBox | null }>(
      "round_players",
      "round_id,user_uid,gender,tee",
      ids
    ).catch((e) => {
      if (e?.code !== "42703") throw e;
      return fetchRows<{ round_id: string; user_uid: string; gender: string; tee?: TeeBox | null }>(
        "round_players",
        "round_id,user_uid,gender",
        ids
      );
    }),
  ]);
  return list
    .map((r) => {
      const me = players.find((p) => p.round_id === r.id && p.user_uid === myUid);
      return recordRound(
        {
          id: r.id,
          date: r.date,
          courseName: r.course_name,
          // 내가 라운드 티와 다른 티를 쳤으면 그 티와 그 티의 레이팅
          courseTee: me?.tee || r.course_tee || "",
          holeCount: r.hole_count,
          gameMode: r.rules.gameMode ?? "stroke",
          rating: playerRating(r.rules.rating, r.rules.teeRatings, me?.tee),
        },
        pars.filter((h) => h.round_id === r.id),
        scores.filter((s) => s.round_id === r.id && s.player_uid === myUid),
        stats.filter((s) => s.round_id === r.id && s.player_uid === myUid),
        me?.gender === "female"
      );
    })
    .filter((r) => r.summary.holesPlayed > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** 한 사람의 한 라운드 기록 → 분석·보정타수 (홈 '라운드 기록'과 랭킹의 이용자 기록이 같이 쓴다) */
export function recordRound(
  r: {
    id: string;
    date: string;
    courseName: string;
    courseTee: string;
    holeCount: number;
    gameMode: GameMode;
    rating: CourseRating | null;
  },
  pars: { hole_index: number; par: number }[],
  scores: { hole_index: number; rel: number }[],
  stats: (HoleStat & { hole_index: number })[],
  female: boolean
): RecordRound {
  const holes = roundHoles(r.holeCount, pars, scores, stats);
  const summary = summarize(holes);
  // 보정타수에 쓸 레이팅은 그 사람 성별로
  const rating = ratingFor(r.rating, female ? "F" : "M");
  return {
    roundId: r.id,
    date: r.date,
    courseName: r.courseName,
    courseTee: r.courseTee,
    holeCount: r.holeCount,
    gameMode: r.gameMode,
    holes,
    summary,
    differential:
      rating && r.holeCount === 18 && summary.holesPlayed === 18
        ? differential(summary.strokes, rating.cr, rating.slope)
        : null,
    rating: r.rating,
    ratingLabel: rating ? `KGA ${rating.cr}/${rating.slope}` : null,
  };
}

const meanOf = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** 라운드 묶음 요약: 평균·베스트·라운드당 퍼트는 18홀을 다 친 라운드만 (부분합을 섞지 않는다) */
export function digestRecords(rs: RecordRound[]) {
  const full = rs.filter((r) => r.holeCount === 18 && r.summary.holesPlayed === 18);
  // 보정타수: KGA 레이팅이 있는 18홀 라운드만
  const diffs = rs.map((r) => r.differential).filter((v): v is number => v != null);
  return {
    count: rs.length,
    avg: meanOf(full.map((r) => r.summary.strokes)),
    best: full.length ? Math.min(...full.map((r) => r.summary.strokes)) : null,
    putts: meanOf(full.map((r) => r.summary.putts).filter((v): v is number => v != null)),
    avgDiff: meanOf(diffs),
    all: summarize(rs.flatMap((r) => r.holes)),
  };
}

/** 한 사람의 홀별 기록 (파는 입력이 없으면 4, 타수는 더블파까지) */
export function roundHoles(
  holeCount: number,
  pars: { hole_index: number; par: number }[],
  scores: { hole_index: number; rel: number }[],
  stats: (HoleStat & { hole_index: number })[]
): HoleRecord[] {
  return Array.from({ length: holeCount }, (_, i) => {
    const par = pars.find((h) => h.hole_index === i)?.par ?? 4;
    const rel = scores.find((s) => s.hole_index === i)?.rel ?? null;
    const st = stats.find((s) => s.hole_index === i) ?? EMPTY_STAT;
    return {
      hole: i,
      par,
      rel: rel == null ? null : Math.min(rel, par),
      putts: st.putts,
      fairway: st.fairway,
      lie: teeLie(st.lie, st.ob, st.hazard),
      ob: st.ob,
      hazard: st.hazard,
      sand: st.sand,
    };
  });
}
