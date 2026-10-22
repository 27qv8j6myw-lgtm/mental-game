import type { ReactNode } from "react";
import type { RecordRound } from "../recordStats";
import { scoreLabel } from "../util";

/*
 * 랭킹에서 사람을 누르면 보이는 하이라이트 (명예의 전당): 그 사람의 라운드 가운데 가장 좋았던 기록들.
 * 기록(퍼트·티샷)은 기록 모드나 내기 중 '내 기록'을 남긴 라운드에서, 베스트 스코어는 18홀을 끝까지 친 모든 라운드에서
 */

interface Highlight {
  key: string;
  title: string;
  date: string;
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

/** 한 라운드에서 가장 긴 파 이하 연속 (같은 길이면 파 대비 합이 적은 쪽) */
function longestStreak(r: RecordRound) {
  let best: number[] = [];
  let run: number[] = [];
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  for (const h of [...r.holes].sort((a, b) => a.hole - b.hole)) {
    if (h.rel != null && h.rel <= 0) run.push(h.rel);
    else run = [];
    if (run.length > best.length || (run.length === best.length && run.length > 0 && sum(run) < sum(best)))
      best = [...run];
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
  hole: svg(
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
  best: { gross: number; date: string } | null
): Highlight[] {
  const out: Highlight[] = [];
  const full = rounds.filter((r) => r.holeCount === 18 && r.summary.holesPlayed === 18);

  // 연속 스코어 (파 이하 2홀 이상)
  const streak = bestBy(
    rounds.map((r) => ({ r, run: longestStreak(r) })),
    (x) => (x.run.length >= 2 ? x.run.length * 100 - x.run.reduce((a, b) => a + b, 0) : null),
    (a, b) => a > b
  );
  if (streak) {
    const run = streak.item.run;
    const labels = run.map((v) => scoreLabel(4, v));
    out.push({
      key: "streak",
      title: "연속 스코어",
      date: streak.item.r.date,
      value: run.length <= 3 ? labels.join(" ") : `${run.length}홀 연속`,
      color: "#f2683f",
      icon: ICONS.streak,
    });
  }
  // 최저 퍼트 (18홀을 다 치고 퍼트를 다 적은 라운드)
  const putts = bestBy(full, (r) => r.summary.putts, (a, b) => a < b);
  if (putts) {
    out.push({ key: "putts", title: "최저 퍼트", date: putts.item.date, value: putts.value, color: "#16b364", icon: ICONS.putts });
  }
  // 베스트 홀
  const hole = bestBy(
    rounds.flatMap((r) => r.holes.filter((h) => h.rel != null).map((h) => ({ r, rel: h.rel as number }))),
    (x) => x.rel,
    (a, b) => a < b
  );
  if (hole) {
    out.push({
      key: "hole",
      title: "베스트 홀",
      date: hole.item.r.date,
      value: scoreLabel(4, hole.value),
      color: "#3b6fe4",
      icon: ICONS.hole,
    });
  }
  // 페어웨이 적중 (티샷 5번 이상) · GIR (9홀 이상)
  const fw = bestBy(rounds, (r) => (r.summary.fairway.d >= 5 ? r.summary.fairway.rate : null), (a, b) => a > b);
  if (fw) out.push({ key: "fw", title: "페어웨이 적중", date: fw.item.date, value: pct(fw.value), color: "#21b8b0", icon: ICONS.fairway });
  const gir = bestBy(rounds, (r) => (r.summary.gir.d >= 9 ? r.summary.gir.rate : null), (a, b) => a > b);
  if (gir) out.push({ key: "gir", title: "베스트 GIR", date: gir.item.date, value: pct(gir.value), color: "#3cc98a", icon: ICONS.gir });
  // 베스트 보정타수
  const diff = bestBy(rounds, (r) => r.differential, (a, b) => a < b);
  if (diff) {
    out.push({
      key: "diff",
      title: "베스트 보정타수",
      date: diff.item.date,
      value: diff.value.toFixed(1),
      color: "#e8663d",
      icon: ICONS.down,
    });
  }
  // 베스트 스코어 (랭킹 자료가 없으면 기록 라운드에서)
  const gross = best ?? (() => {
    const b = bestBy(full, (r) => r.summary.strokes, (a, c) => a < c);
    return b ? { gross: b.value, date: b.item.date } : null;
  })();
  if (gross) {
    out.push({ key: "gross", title: "베스트 스코어", date: gross.date, value: gross.gross, color: "#d9534f", icon: ICONS.down });
  }
  // 스크램블 (그린 놓친 홀 3번 이상) · 샌드 세이브 (벙커 2번 이상)
  const scr = bestBy(rounds, (r) => (r.summary.scrambling.d >= 3 ? r.summary.scrambling.rate : null), (a, b) => a > b);
  if (scr) out.push({ key: "scr", title: "스크램블", date: scr.item.date, value: pct(scr.value), color: "#8b7cf6", icon: ICONS.scramble });
  const sand = bestBy(rounds, (r) => (r.summary.sandSave.d >= 2 ? r.summary.sandSave.rate : null), (a, b) => a > b);
  if (sand) out.push({ key: "sand", title: "샌드 세이브", date: sand.item.date, value: pct(sand.value), color: "#c9963a", icon: ICONS.sand });
  return out;
}

/** 하이라이트 카드 격자 (3칸) */
export default function Highlights({ items }: { items: Highlight[] }) {
  return (
    <div className="hl-grid">
      {items.map((h) => (
        <div className="hl-card" key={h.key} style={{ "--hl": h.color } as React.CSSProperties}>
          <div className="hl-badge">{h.icon}</div>
          <div className="hl-date">{dotted(h.date)}</div>
          <div className="hl-title">{h.title}</div>
          <div className="hl-value">{h.value}</div>
        </div>
      ))}
    </div>
  );
}
