import { judgedScore, splitThousands } from "./betting";
import { CADDIE_PER_HOLE } from "./util";
import type { GameConfig, HoleScore } from "./types";

/*
 * 캐디피 내기: 캐디피를 홀당 1만원으로 나눠, 내는 홀마다 꼴찌(타수 보정 반영)가 1만원을 캐디피로 낸다.
 * - 내는 홀 수 = 캐디피 ÷ 1만원, 나머지 앞 홀은 연습 (16만원 → 1·2번 연습, 3~18번)
 * - 공동 꼴찌(모두 같은 타수 포함)면 아무도 안 내고 다음 홀로 넘긴다 → 다음 홀 꼴찌가 2만원
 * - 끝난 라운드에서 마지막 홀까지 넘어간 돈·못 친 홀의 돈은 모두가 천 원 단위로 나눠 낸다
 *   (나누어 떨어지지 않는 천 원은 그날 총 타수가 많은 사람부터)
 * 사람끼리 주고받는 돈은 없다.
 */

export type CaddieStatus = "practice" | "pending" | "paid" | "carried";

export interface CaddieHole {
  /** 연습 홀 (돈을 내지 않는다) */
  practice: boolean;
  status: CaddieStatus;
  /** 이 홀 꼴찌가 낼 돈 (넘어온 돈 포함). 연습 홀은 0 */
  stake: number;
  /** 앞 홀에서 넘어온 홀 수 */
  carryCount: number;
  /** 낸 사람 (paid) */
  payerId: string | null;
  /** 공동 꼴찌로 넘어간 사람들 (carried) */
  tiedIds: string[];
  /** 이 홀까지 사람별 낸 돈 */
  cumulative: Record<string, number>;
}

export interface CaddieResult {
  /** 홀마다 모을 캐디피 합 (내는 홀 수 × 1만원) */
  target: number;
  perHole: number;
  /** 돈을 내는 홀 수 / 앞 연습 홀 수 */
  counted: number;
  practice: number;
  holes: CaddieHole[];
  /** 사람별 낸 돈 (끝난 라운드면 나눠 낸 몫 포함) */
  paid: Record<string, number>;
  /** 끝난 라운드에서 남은 돈을 나눠 낸 몫 */
  restShare: Record<string, number>;
  /** 홀에서 꼴찌가 낸 돈 합 */
  collected: number;
  /** 아직 모이지 않은 돈 (끝난 라운드는 0) */
  remaining: number;
  /** 지금 다음 홀로 넘어가 쌓인 돈 */
  carried: number;
}

/** 캐디피로 내는 홀 수 (홀 수를 넘지 않는다) */
export const caddieCounted = (fee: number, holeCount: number) =>
  Math.max(0, Math.min(holeCount, Math.floor(fee / CADDIE_PER_HOLE)));

/** "캐디피 16만원 · 16홀 (연습 2홀)" */
export function caddieSummary(fee: number, holeCount: number) {
  const counted = caddieCounted(fee, holeCount);
  const practice = holeCount - counted;
  return `캐디피 ${Math.round(fee / CADDIE_PER_HOLE)}만원 · ${counted}홀${practice > 0 ? ` (연습 ${practice}홀)` : ""}`;
}

export function caddieResult(config: GameConfig, holes: HoleScore[], finished = false): CaddieResult {
  const { players } = config;
  const zero = () => Object.fromEntries(players.map((p) => [p.id, 0])) as Record<string, number>;
  const counted = caddieCounted(config.rules.caddie?.fee ?? 0, holes.length);
  const practice = holes.length - counted;
  const paid = zero();
  const restShare = zero();
  let collected = 0;
  let carry = 0;

  const out: CaddieHole[] = holes.map((hole, i) => {
    const base = { payerId: null, tiedIds: [] as string[] };
    if (i < practice)
      return { ...base, practice: true, status: "practice", stake: 0, carryCount: 0, cumulative: { ...paid } };
    const stake = CADDIE_PER_HOLE * (1 + carry);
    const carryCount = carry;
    const judged = players.map((p) => judgedScore(hole, p));
    // 모두 입력하기 전에는 판정하지 않는다 (넘어온 돈은 그대로 쌓여 있다)
    if (players.length < 2 || judged.some((v) => v == null))
      return { ...base, practice: false, status: "pending", stake, carryCount, cumulative: { ...paid } };
    const worst = Math.max(...(judged as number[]));
    const last = players.filter((_, k) => judged[k] === worst);
    if (last.length === 1) {
      paid[last[0].id] += stake;
      collected += stake;
      carry = 0;
      return { ...base, practice: false, status: "paid", stake, carryCount, payerId: last[0].id, cumulative: { ...paid } };
    }
    carry += 1;
    return {
      ...base,
      practice: false,
      status: "carried",
      stake,
      carryCount,
      tiedIds: last.map((p) => p.id),
      cumulative: { ...paid },
    };
  });

  const target = counted * CADDIE_PER_HOLE;
  let remaining = target - collected;
  if (finished && remaining > 0 && players.length > 0) {
    // 총 타수가 많은 사람부터 천 원을 더 낸다 (같으면 자리 순)
    const strokes = (id: string) => holes.reduce((s, h) => s + (h.scores[id] == null ? 0 : h.par + h.scores[id]!), 0);
    const order = [...players].sort((a, b) => strokes(b.id) - strokes(a.id));
    const parts = splitThousands(remaining, order.length);
    order.forEach((p, k) => {
      restShare[p.id] = parts[k];
      paid[p.id] += parts[k];
    });
    remaining = 0;
  }

  return {
    target,
    perHole: CADDIE_PER_HOLE,
    counted,
    practice,
    holes: out,
    paid,
    restShare,
    collected,
    remaining,
    carried: carry * CADDIE_PER_HOLE,
  };
}

/** 캐디피 내기 등수: 적게 낸 사람이 위 (같으면 같은 등수) */
export function caddieRanks(result: CaddieResult): Record<string, number> {
  const ids = Object.keys(result.paid);
  return Object.fromEntries(
    ids.map((id) => [id, 1 + ids.filter((o) => result.paid[o] < result.paid[id]).length])
  );
}
