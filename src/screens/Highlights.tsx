import type { ReactNode } from "react";
import type { RecordRound } from "../recordStats";
import { CARD_ICONS, CollectCard } from "./CollectCard";

/*
 * 랭킹에서 사람을 누르면 보이는 하이라이트 (명예의 전당): 그 사람의 라운드 가운데 가장 좋았던 기록들 (날짜·골프장과 함께).
 * 연속 파·연속 버디·이글·최다 버디는 늘 보이고, 아직 없으면 회색 카드에 - 로.
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
      icon: CARD_ICONS.streak,
      ...(run ? { ...at(run.item), value: `${run.value}홀`, color } : none),
    });
  }
  // 이글 (이글 이하): 가장 최근 것. 여러 번이면 횟수
  const eagles = rounds.flatMap((r) => r.holes.filter((h) => h.rel != null && h.rel <= -2).map((h) => ({ r, h })));
  out.push({
    key: "eagle",
    title: "이글",
    icon: CARD_ICONS.eagle,
    ...(eagles.length > 0
      ? {
          ...at(eagles[0].r),
          value: eagles.length === 1 ? `${eagles[0].h.hole + 1}번 홀` : `${eagles.length}회`,
          color: "#3b6fe4",
        }
      : none),
  });
  // 최다 버디 (한 라운드의 버디 이하 홀 수)
  const birdies = bestBy(rounds, (r) => r.summary.dist.birdie + r.summary.dist.eagle || null, (a, b) => a > b);
  out.push({
    key: "birdies",
    title: "최다 버디",
    icon: CARD_ICONS.birdie,
    ...(birdies ? { ...at(birdies.item), value: `${birdies.value}개`, color: "#2ba3dc" } : none),
  });
  // 베스트 9홀 (전반·후반 9홀을 다 친 것 가운데 가장 적은 타수)
  const nine = bestBy(
    rounds.flatMap((r) => [r.summary.out, r.summary.in].map((v) => ({ r, v }))),
    (x) => x.v,
    (a, b) => a < b
  );
  if (nine) {
    out.push({ key: "nine", title: "베스트 9홀", ...at(nine.item.r), value: `${nine.value}타`, color: "#5b5bd6", icon: CARD_ICONS.nine });
  }
  // 베스트 스코어 (랭킹 자료가 없으면 기록 라운드에서)
  const gross = best ?? (() => {
    const b = bestBy(full, (r) => r.summary.strokes, (a, c) => a < c);
    return b ? { gross: b.value, ...at(b.item) } : null;
  })();
  if (gross) {
    out.push({ key: "gross", title: "베스트 스코어", date: gross.date, course: gross.course, value: `${gross.gross}타`, color: "#d9534f", icon: CARD_ICONS.medal });
  }
  // 최저 퍼트 (18홀을 다 치고 퍼트를 다 적은 라운드)
  const putts = bestBy(full, (r) => r.summary.putts, (a, b) => a < b);
  if (putts) {
    out.push({ key: "putts", title: "최저 퍼트", ...at(putts.item), value: putts.value, color: "#16b364", icon: CARD_ICONS.putts });
  }
  // 페어웨이 적중 (티샷 5번 이상) · GIR (9홀 이상)
  const fw = bestBy(rounds, (r) => (r.summary.fairway.d >= 5 ? r.summary.fairway.rate : null), (a, b) => a > b);
  if (fw) out.push({ key: "fw", title: "페어웨이 적중", ...at(fw.item), value: pct(fw.value), color: "#21b8b0", icon: CARD_ICONS.fairway });
  const gir = bestBy(rounds, (r) => (r.summary.gir.d >= 9 ? r.summary.gir.rate : null), (a, b) => a > b);
  if (gir) out.push({ key: "gir", title: "베스트 GIR", ...at(gir.item), value: pct(gir.value), color: "#3cc98a", icon: CARD_ICONS.gir });
  // 베스트 보정타수
  const diff = bestBy(rounds, (r) => r.differential, (a, b) => a < b);
  if (diff) {
    out.push({
      key: "diff",
      title: "베스트 보정타수",
      ...at(diff.item),
      value: diff.value.toFixed(1),
      color: "#e8663d",
      icon: CARD_ICONS.down,
    });
  }
  // 스크램블 (그린 놓친 홀 3번 이상) · 샌드 세이브 (벙커 2번 이상)
  const scr = bestBy(rounds, (r) => (r.summary.scrambling.d >= 3 ? r.summary.scrambling.rate : null), (a, b) => a > b);
  if (scr) out.push({ key: "scr", title: "스크램블", ...at(scr.item), value: pct(scr.value), color: "#8b7cf6", icon: CARD_ICONS.scramble });
  const sand = bestBy(rounds, (r) => (r.summary.sandSave.d >= 2 ? r.summary.sandSave.rate : null), (a, b) => a > b);
  if (sand) out.push({ key: "sand", title: "샌드 세이브", ...at(sand.item), value: pct(sand.value), color: "#c9963a", icon: CARD_ICONS.sand });
  return out;
}

/** 하이라이트 카드 격자 (3칸) */
export default function Highlights({ items }: { items: Highlight[] }) {
  return (
    <div className="cc-grid">
      {items.map((h) => (
        <CollectCard
          key={h.key}
          color={h.color}
          icon={h.icon}
          title={h.title}
          value={h.value}
          off={!h.date}
          lock={false}
          meta={
            h.date ? (
              <>
                {dotted(h.date)}
                <br />
                {h.course || "이름 없는 골프장"}
              </>
            ) : (
              "아직 없어요"
            )
          }
        />
      ))}
    </div>
  );
}
