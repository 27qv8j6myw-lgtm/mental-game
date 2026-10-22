import type { ReactNode } from "react";
import type { RecordRound } from "../recordStats";

/*
 * 랭킹에서 사람을 누르면 보이는 하이라이트 (명예의 전당): 그 사람의 라운드 가운데 가장 좋았던 기록들 (날짜·골프장과 함께).
 * 연속 파·연속 버디·이글은 늘 보이고, 아직 없으면 회색 카드에 - 로.
 * 기록(퍼트·티샷)은 기록 모드나 내기 중 '내 기록'을 남긴 라운드에서, 베스트 스코어는 18홀을 끝까지 친 모든 라운드에서
 */

interface Highlight {
  key: string;
  title: string;
  /** 기록이 없으면 "" */
  date: string;
  course: string;
  value: ReactNode;
  color: string;
  icon: ReactNode;
}

const dotted = (d: string) => d.replace(/-/g, ".");
const pct = (r: number) => `${Math.round(r * 100)}%`;

/** 같은 값이면 더 최근 라운드 (rounds 는 최근 순) */
function bestBy<T>(items: T[], score: (x: T) => number | null, better: (a: number, b: number) => boolean) {
  let best: T | null = null;
  let bestV = 0;
  for (const x of items) {
    const v = score(x);
    if (v == null) continue;
    if (best === null || better(v, bestV)) {
      best = x;
      bestV = v;
    }
  }
  return best === null ? null : { item: best, value: bestV };
}

/** 한 라운드에서 파 대비 max 이하로 이어 친 가장 긴 홀 수 (파 이하: 0, 버디 이하: -1) */
function longestRun(r: RecordRound, max: number) {
  let best = 0;
  let run = 0;
  for (const h of [...r.holes].sort((a, b) => a.hole - b.hole)) {
    run = h.rel != null && h.rel <= max ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/* 하이라이트 머리 아이콘 (흰 선) */
const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const ICONS = {
  // 달려가는 공
  streak: svg(
    <>
      <circle cx="15.5" cy="8.5" r="4" />
      <path d="M12.5 11.5 5 19M10.5 9.5 4 16M14.5 13.5 8 20" />
    </>
  ),
  // 퍼터
  putts: svg(
    <>
      <path d="M5 7.5 18 5.5l.6 2L6 9.5Z" />
      <path d="M12 8.5V19" />
    </>
  ),
  // 별 + 공
  eagle: svg(
    <>
      <path d="M12 3.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5Z" />
      <path d="M9 17.5h6M12 15v5" />
    </>
  ),
  // 과녁
  fairway: svg(
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </>
  ),
  // 깃발
  gir: svg(
    <>
      <path d="M7 20V4" />
      <path d="M7 4h9l-2.5 3.5L16 11H7" />
    </>
  ),
  // 아래 화살표 (적을수록 좋음)
  down: svg(
    <>
      <path d="M12 4v13" />
      <path d="m6.5 12 5.5 5.5 5.5-5.5" />
    </>
  ),
  // 되돌아 오기 (그린을 놓쳐도 파)
  scramble: svg(
    <>
      <path d="M19 12a7 7 0 1 1-2-4.9" />
      <path d="M19 4v4h-4" />
    </>
  ),
  // 벙커 모래
  sand: svg(
    <>
      <path d="M3 16c3-2 6-2 9 0s6 2 9 0" />
      <path d="M3 12c3-2 6-2 9 0s6 2 9 0" />
      <circle cx="12" cy="6" r="2" />
    </>
  ),
};

/**
 * rounds: 그 사람의 기록 라운드 (최근 순). best: 18홀 베스트 스코어 (랭킹 자료, 기록 없는 라운드 포함)
 */
export function computeHighlights(
  rounds: RecordRound[],
  best: { gross: number; date: string; course: string } | null
): Highlight[] {
  const out: Highlight[] = [];
  const full = rounds.filter((r) => r.holeCount === 18 && r.summary.holesPlayed === 18);
  const at = (r: RecordRound) => ({ date: r.date, course: r.courseName });
  /** 아직 없는 기록: 회색 카드에 - */
  const none = { date: "", course: "", value: "-", color: "#a3aab3" };

  // 연속 파 (파 이하) · 연속 버디 (버디 이하): 2홀 이상
  for (const [key, title, max, color] of [
    ["par", "연속 파", 0, "#f2683f"],
    ["birdie", "연속 버디", -1, "#e0458a"],
  ] as const) {
    const run = bestBy(rounds, (r) => (longestRun(r, max) >= 2 ? longestRun(r, max) : null), (a, b) => a > b);
    out.push({
      key,
      title,
      icon: ICONS.streak,
      ...(run ? { ...at(run.item), value: `${run.value}홀`, color } : none),
    });
  }
  // 이글 (이글 이하): 가장 최근 것. 여러 번이면 횟수
  const eagles = rounds.flatMap((r) => r.holes.filter((h) => h.rel != null && h.rel <= -2).map((h) => ({ r, h })));
  out.push({
    key: "eagle",
    title: "이글",
    icon: ICONS.eagle,
    ...(eagles.length > 0
      ? {
          ...at(eagles[0].r),
          value: eagles.length === 1 ? `${eagles[0].h.hole + 1}번 홀` : `${eagles.length}회`,
          color: "#3b6fe4",
        }
      : none),
  });
  // 최저 퍼트 (18홀을 다 치고 퍼트를 다 적은 라운드)
  const putts = bestBy(full, (r) => r.summary.putts, (a, b) => a < b);
  if (putts) {
    out.push({ key: "putts", title: "최저 퍼트", ...at(putts.item), value: putts.value, color: "#16b364", icon: ICONS.putts });
  }
  // 페어웨이 적중 (티샷 5번 이상) · GIR (9홀 이상)
  const fw = bestBy(rounds, (r) => (r.summary.fairway.d >= 5 ? r.summary.fairway.rate : null), (a, b) => a > b);
  if (fw) out.push({ key: "fw", title: "페어웨이 적중", ...at(fw.item), value: pct(fw.value), color: "#21b8b0", icon: ICONS.fairway });
  const gir = bestBy(rounds, (r) => (r.summary.gir.d >= 9 ? r.summary.gir.rate : null), (a, b) => a > b);
  if (gir) out.push({ key: "gir", title: "베스트 GIR", ...at(gir.item), value: pct(gir.value), color: "#3cc98a", icon: ICONS.gir });
  // 베스트 보정타수
  const diff = bestBy(rounds, (r) => r.differential, (a, b) => a < b);
  if (diff) {
    out.push({
      key: "diff",
      title: "베스트 보정타수",
      ...at(diff.item),
      value: diff.value.toFixed(1),
      color: "#e8663d",
      icon: ICONS.down,
    });
  }
  // 베스트 스코어 (랭킹 자료가 없으면 기록 라운드에서)
  const gross = best ?? (() => {
    const b = bestBy(full, (r) => r.summary.strokes, (a, c) => a < c);
    return b ? { gross: b.value, ...at(b.item) } : null;
  })();
  if (gross) {
    out.push({ key: "gross", title: "베스트 스코어", date: gross.date, course: gross.course, value: gross.gross, color: "#d9534f", icon: ICONS.down });
  }
  // 스크램블 (그린 놓친 홀 3번 이상) · 샌드 세이브 (벙커 2번 이상)
  const scr = bestBy(rounds, (r) => (r.summary.scrambling.d >= 3 ? r.summary.scrambling.rate : null), (a, b) => a > b);
  if (scr) out.push({ key: "scr", title: "스크램블", ...at(scr.item), value: pct(scr.value), color: "#8b7cf6", icon: ICONS.scramble });
  const sand = bestBy(rounds, (r) => (r.summary.sandSave.d >= 2 ? r.summary.sandSave.rate : null), (a, b) => a > b);
  if (sand) out.push({ key: "sand", title: "샌드 세이브", ...at(sand.item), value: pct(sand.value), color: "#c9963a", icon: ICONS.sand });
  return out;
}

/** 하이라이트 카드 격자 (3칸) */
export default function Highlights({ items }: { items: Highlight[] }) {
  return (
    <div className="hl-grid">
      {items.map((h) => (
        <div className="hl-card" key={h.key} style={{ "--hl": h.color } as React.CSSProperties}>
          <div className="hl-badge">{h.icon}</div>
          <div className="hl-date">{h.date ? dotted(h.date) : "\u00a0"}</div>
          <div className="hl-course">{h.date ? h.course || "이름 없는 골프장" : "\u00a0"}</div>
          <div className="hl-title">{h.title}</div>
          <div className="hl-value">{h.value}</div>
        </div>
      ))}
    </div>
  );
}
