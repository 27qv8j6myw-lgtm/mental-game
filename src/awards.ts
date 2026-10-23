import type { HoleScore, HoleStat } from "./types";

/*
 * 라운드 시상식 (정산 결과의 '시상식'): 이 라운드 스코어로 주는 재미 상. 돈과 엮지 않는다.
 * 동점이면 함께 받고, 조건이 안 되거나 모두 같으면 그 상은 빠진다.
 * holes 는 정산과 같은 홀 (저장 안 된 홀은 스코어가 비어 있다), stats 는 같은 순서의 홀별 상세 기록(퍼트)
 */

export type AwardKey = "birdie" | "putt" | "steady" | "comeback" | "parRun" | "finish";

export interface Award {
  key: AwardKey;
  title: string;
  /** 받은 사람 id (동점이면 여럿) */
  winners: string[];
  /** "버디 3개" 같은 짧은 이유 */
  reason: string;
  /** 카드 아래 작은 줄 ("전반 43 → 후반 40") */
  detail?: string;
}

/** 상마다 머리 색 (하이라이트 카드와 같은 팔레트) */
export const AWARD_COLOR: Record<AwardKey, string> = {
  birdie: "#e0458a",
  putt: "#16b364",
  steady: "#21b8b0",
  comeback: "#8b7cf6",
  parRun: "#f2683f",
  finish: "#3b6fe4",
};

const relText = (v: number) => (v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`);

/**
 * 점수가 가장 좋은 사람들. 후보가 min 명보다 적거나, 비교한 사람(pool, 기본은 후보) 모두가 같으면 상을 주지 않는다
 * (버디 0개인 사람은 후보가 아니어도 비교에는 들어간다)
 */
function best(cands: { id: string; v: number }[], better: "max" | "min", { min = 1, pool = cands.length } = {}) {
  if (cands.length < min || cands.length === 0) return null;
  const top = better === "max" ? Math.max(...cands.map((c) => c.v)) : Math.min(...cands.map((c) => c.v));
  const winners = cands.filter((c) => c.v === top).map((c) => c.id);
  if (pool > 1 && winners.length === pool) return null;
  return { winners, v: top };
}

function longestRun(rels: (number | null)[], max: number) {
  let bestRun = 0;
  let run = 0;
  for (const r of rels) {
    run = r != null && r <= max ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }
  return bestRun;
}

export function computeAwards(
  playerIds: string[],
  holes: HoleScore[],
  stats: Record<string, HoleStat>[] = []
): Award[] {
  if (playerIds.length < 2) return [];
  const rels = (id: string) => holes.map((h) => h.scores[id] ?? null);
  const played = (id: string) => rels(id).filter((r): r is number => r != null);
  const out: Award[] = [];

  // 버디왕: 버디 이하 홀이 가장 많은 사람 (1개 이상)
  const birdie = best(
    playerIds.map((id) => ({ id, v: played(id).filter((r) => r <= -1).length })).filter((c) => c.v > 0),
    "max",
    { pool: playerIds.length }
  );
  if (birdie) out.push({ key: "birdie", title: "버디왕", winners: birdie.winners, reason: `버디 ${birdie.v}개` });

  // 퍼트왕: 친 홀의 퍼트를 다 적은 사람(9홀 이상) 가운데 가장 적게. 적은 사람이 둘 이상일 때만
  const putters = playerIds
    .map((id) => {
      const idx = holes.map((h, i) => (h.scores[id] != null ? i : -1)).filter((i) => i >= 0);
      const putts = idx.map((i) => stats[i]?.[id]?.putts ?? null);
      if (idx.length < 9 || putts.some((p) => p == null)) return null;
      return { id, total: putts.reduce<number>((s, p) => s + p!, 0), holes: idx.length };
    })
    .filter((c): c is { id: string; total: number; holes: number } => c != null);
  const sameHoles = putters.every((c) => c.holes === putters[0]?.holes);
  const putt = best(
    putters.map((c) => ({ id: c.id, v: sameHoles ? c.total : Math.round((c.total / c.holes) * 100) / 100 })),
    "min",
    { min: 2 }
  );
  if (putt)
    out.push({
      key: "putt",
      title: "퍼트왕",
      winners: putt.winners,
      reason: sameHoles ? `${putt.v}퍼트` : `홀당 ${putt.v.toFixed(1)}퍼트`,
    });

  // 꾸준왕: 9홀 이상 친 사람 가운데 더블보기 이상이 가장 적은 사람
  const steady = best(
    playerIds.filter((id) => played(id).length >= 9).map((id) => ({ id, v: played(id).filter((r) => r >= 2).length })),
    "min",
    { min: 2 }
  );
  if (steady)
    out.push({
      key: "steady",
      title: "꾸준왕",
      winners: steady.winners,
      reason: steady.v === 0 ? "더블 없이" : `더블 ${steady.v}번`,
      detail: steady.v === 0 ? "끝까지 보기 이하" : "더블보기 이상이 가장 적게",
    });

  // 뒷심왕 (18홀): 전반보다 후반을 가장 많이 줄인 사람 (전·후반 다 친 사람)
  if (holes.length === 18) {
    const half = (id: string, from: number) => {
      const part = holes.slice(from, from + 9);
      if (part.some((h) => h.scores[id] == null)) return null;
      return part.reduce((s, h) => s + h.par + (h.scores[id] as number), 0);
    };
    const both = playerIds
      .map((id) => ({ id, out: half(id, 0), in: half(id, 9) }))
      .filter((c): c is { id: string; out: number; in: number } => c.out != null && c.in != null);
    const gains = both.map((c) => ({ id: c.id, v: c.out - c.in, out: c.out, in: c.in })).filter((c) => c.v > 0);
    const comeback = best(gains, "max", { pool: both.length });
    if (comeback) {
      const w = gains.find((g) => g.id === comeback.winners[0])!;
      out.push({
        key: "comeback",
        title: "뒷심왕",
        winners: comeback.winners,
        reason: `${comeback.v}타 줄임`,
        // 줄이 바뀌어도 '후반 40' 은 붙여 둔다
        detail: comeback.winners.length === 1 ? `전반\u00a0${w.out} → 후반\u00a0${w.in}` : "전반보다 후반",
      });
    }
  }

  // 파 행진: 파 이하로 가장 길게 이어 친 사람 (3홀 이상)
  const parRun = best(
    playerIds.map((id) => ({ id, v: longestRun(rels(id), 0) })).filter((c) => c.v >= 3),
    "max",
    { pool: playerIds.length }
  );
  if (parRun)
    out.push({ key: "parRun", title: "파 행진", winners: parRun.winners, reason: `${parRun.v}홀 연속`, detail: "파 이하로" });

  // 막판 스퍼트: 모두 친 마지막 3홀을 가장 잘 친 사람
  const allIn = holes
    .map((h, i) => (playerIds.every((id) => h.scores[id] != null) ? i : -1))
    .filter((i) => i >= 0);
  if (allIn.length >= 6) {
    const last3 = allIn.slice(-3);
    const finish = best(
      playerIds.map((id) => ({ id, v: last3.reduce((s, i) => s + (holes[i].scores[id] as number), 0) })),
      "min"
    );
    if (finish)
      out.push({
        key: "finish",
        title: "막판 스퍼트",
        winners: finish.winners,
        reason: `3홀 ${relText(finish.v)}`,
        detail: "마지막 3홀 합계",
      });
  }
  return out;
}
