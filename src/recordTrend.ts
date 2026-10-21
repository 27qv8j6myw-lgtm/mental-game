import { summarize, type RecordRound } from "./recordStats";

/*
 * 라운드 기록 추이: 지표 하나를 라운드마다(또는 달마다) 뽑아 날짜순으로 늘어놓는다 (라운드 기록 화면의 추이 그래프)
 * 전체·연도별은 한 달 평균, 월별은 라운드 하나가 점 하나다.
 * 그 지표를 판단할 기록이 없는 라운드는 건너뛴다 (예: 퍼트를 안 적은 라운드는 퍼트 추이에서 빠진다)
 */

export type TrendKey =
  | "strokes"
  | "diff"
  | "fairway"
  | "gir"
  | "putts"
  | "girThreePutt"
  | "scrambling"
  | "extraShots"
  | "penalty"
  | "sand";

export interface TrendMeta {
  label: string;
  /** 값 뒤에 붙일 단위 */
  unit: "%" | "타" | "개" | "";
  /** 소수 자리 */
  decimals: number;
  /** 0~100 고정 축 (비율) */
  percent?: boolean;
  /** 값이 낮을수록 좋은지 (타수·퍼트·벌타) */
  lowerBetter: boolean;
}

export const TREND_META: Record<TrendKey, TrendMeta> = {
  strokes: { label: "타수", unit: "타", decimals: 0, lowerBetter: true },
  diff: { label: "보정타수 (파 72 기준)", unit: "타", decimals: 1, lowerBetter: true },
  fairway: { label: "페어웨이 적중률", unit: "%", decimals: 0, percent: true, lowerBetter: false },
  gir: { label: "GIR", unit: "%", decimals: 0, percent: true, lowerBetter: false },
  putts: { label: "홀당 퍼트", unit: "", decimals: 1, lowerBetter: true },
  girThreePutt: { label: "GIR 후 3퍼트", unit: "%", decimals: 0, percent: true, lowerBetter: true },
  scrambling: { label: "스크램블 (파 세이브)", unit: "%", decimals: 0, percent: true, lowerBetter: false },
  extraShots: { label: "그린 놓친 홀 추가 샷", unit: "", decimals: 1, lowerBetter: true },
  penalty: { label: "OB · 해저드", unit: "개", decimals: 0, lowerBetter: true },
  sand: { label: "샌드샷", unit: "개", decimals: 0, lowerBetter: true },
};

export interface TrendPoint {
  /** 라운드 id 또는 달(YYYY-MM) */
  id: string;
  /** 가로축 글자: 라운드 "10/19", 달 "10월" (해가 섞이면 "25.11") */
  label: string;
  /** 점을 눌렀을 때 설명: "10/19 · 글렌로스", "2026년 10월 · 4라운드 평균" */
  info: string;
  value: number;
  /** 월별에서 함께 보여주는 지난달 라운드 (흐리게) */
  before?: boolean;
}

/** 점 하나의 단위: 라운드 하나 / 한 달 평균 */
export type TrendUnit = "round" | "month";

/** 퍼트·티샷·벌타 같은 상세 기록을 하나라도 남긴 라운드 (아니면 벌타 0 이 '기록 없음'인지 알 수 없다) */
const hasDetail = (r: RecordRound) =>
  r.holes.some((h) => h.putts != null || h.fairway != null || h.lie != null || h.ob > 0 || h.hazard > 0 || h.sand > 0);

const pct = (rate: number | null) => (rate == null ? null : rate * 100);

/** 라운드 하나의 지표 값. 판단할 기록이 없으면 null */
export function roundValue(r: RecordRound, key: TrendKey): number | null {
  const s = r.summary;
  switch (key) {
    case "strokes":
      // 18홀을 다 친 라운드만 (9홀·중간에 끝낸 라운드는 타수를 비교할 수 없다)
      return r.holeCount === 18 && s.holesPlayed === 18 ? s.strokes : null;
    case "diff":
      return r.differential == null ? null : 72 + r.differential;
    case "fairway":
      return pct(s.fairway.rate);
    case "gir":
      return pct(s.gir.rate);
    case "putts":
      return s.avgPutts;
    case "girThreePutt":
      return pct(s.girThreePutt.rate);
    case "scrambling":
      return pct(s.scrambling.rate);
    case "extraShots":
      return s.extraShots;
    case "penalty":
      return hasDetail(r) ? s.ob + s.hazard : null;
    case "sand":
      return hasDetail(r) ? s.sandShots : null;
  }
}

const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * 여러 라운드를 합친 값 (분석 칸과 같은 규칙).
 * 비율·홀당 퍼트·추가 샷은 그 라운드들의 홀을 모두 합쳐서, 타수·보정타수·벌타·샌드샷은 라운드 평균으로.
 * 판단할 라운드가 없으면 null
 */
export function aggregate(rounds: RecordRound[], key: TrendKey): number | null {
  switch (key) {
    case "strokes":
    case "diff":
    case "penalty":
    case "sand":
      return mean(rounds.map((r) => roundValue(r, key)).filter((v): v is number => v != null));
    default: {
      if (rounds.length === 0) return null;
      const s = summarize(rounds.flatMap((r) => r.holes));
      switch (key) {
        case "fairway":
          return pct(s.fairway.rate);
        case "gir":
          return pct(s.gir.rate);
        case "putts":
          return s.avgPutts;
        case "girThreePutt":
          return pct(s.girThreePutt.rate);
        case "scrambling":
          return pct(s.scrambling.rate);
        case "extraShots":
          return s.extraShots;
      }
    }
  }
}

/** 2026-10-20 → 10/20 */
const md = (d: string) => {
  const [, m, day] = d.split("-");
  return m && day ? `${Number(m)}/${Number(day)}` : d;
};

/** 지표의 라운드별 값 (오래된 라운드부터) */
function roundSeries(rounds: RecordRound[], key: TrendKey, before = false): TrendPoint[] {
  return rounds
    .map((r) => ({ r, v: roundValue(r, key) }))
    .filter((x): x is { r: RecordRound; v: number } => x.v != null)
    .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.r.roundId.localeCompare(b.r.roundId))
    .map(({ r, v }) => ({
      id: r.roundId,
      label: md(r.date),
      // 앞 기록 달 라운드는 그 달을 함께 적는다 (바로 전 달이 아닐 수도 있어서)
      info: `${md(r.date)} · ${r.courseName || "이름 없는 라운드"}${before ? ` (${Number(r.date.slice(5, 7))}월)` : ""}`,
      value: v,
      ...(before && { before }),
    }));
}

/** 지표의 달별 평균 (오래된 달부터). 그 달에 판단할 라운드가 없으면 그 달은 빠진다 */
function monthSeries(rounds: RecordRound[], key: TrendKey): TrendPoint[] {
  const byMonth = new Map<string, RecordRound[]>();
  for (const r of rounds) {
    const k = r.date.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
  }
  const months = [...byMonth.keys()].sort();
  const oneYear = new Set(months.map((m) => m.slice(0, 4))).size <= 1;
  return months.flatMap((m) => {
    const rs = byMonth.get(m)!;
    const v = aggregate(rs, key);
    if (v == null) return [];
    // 그 달에서 이 지표를 판단한 라운드 수
    const counted = rs.filter((r) => roundValue(r, key) != null).length;
    const [y, mo] = m.split("-");
    return [
      {
        id: m,
        label: oneYear ? `${Number(mo)}월` : `${y.slice(2)}.${Number(mo)}`,
        info: `${y}년 ${Number(mo)}월 · ${counted}라운드 평균`,
        value: v,
      },
    ];
  });
}

/**
 * 추이 그래프의 점: 달 단위면 한 달 평균, 라운드 단위면 라운드 하나.
 * 달 단위인데 점이 2개가 안 되면(한 달치뿐) 라운드 단위로 보여준다.
 * before: 월별에서 앞에 흐리게 붙일 지난달 라운드 (한 달 라운드는 몇 개 안 되므로)
 */
export function trendSeries(
  rounds: RecordRound[],
  key: TrendKey,
  unit: TrendUnit,
  before: RecordRound[] = []
): { unit: TrendUnit; points: TrendPoint[] } {
  if (unit === "month") {
    const points = monthSeries(rounds, key);
    if (points.length >= 2) return { unit, points };
  }
  return { unit: "round", points: [...roundSeries(before, key, true), ...roundSeries(rounds, key)] };
}

/** 화면에 보일 값: 52%, 1.94, 83타, 2개 */
export const formatTrend = (key: TrendKey, v: number) => {
  const m = TREND_META[key];
  const n = m.decimals === 0 ? String(Math.round(v)) : v.toFixed(m.decimals);
  // 추가 샷은 분석 칸처럼 +1.4 로
  return `${key === "extraShots" && v > 0 ? "+" : ""}${n}${m.unit}`;
};
