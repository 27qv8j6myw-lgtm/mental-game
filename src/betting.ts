import type {
  BetRules,
  GameConfig,
  HoleScore,
  Player,
  Transfer,
} from "./types";

/**
 * 한 홀의 배판 배수를 계산한다.
 * 활성화된 규칙 중 조건을 만족하는 것마다 ×2 씩 중첩된다.
 * (파 페널티 규칙과 동타 규칙이 동시에 만족되면 ×4)
 * ※ 버디는 배판에 영향을 주지 않고 별도 추가 정산으로 처리한다.
 */
export function holeMultiplier(
  hole: HoleScore,
  rules: BetRules,
  playerCount: number
): { multiplier: number; reasons: string[] } {
  const scores = Object.values(hole.scores).filter(
    (s): s is number => s !== null
  );
  let multiplier = 1;
  const reasons: string[] = [];
  if (scores.length === 0) return { multiplier, reasons };

  const worst = Math.max(...scores);

  // 파 페널티(동시 규칙): 파3 더블+ / 파4·5 트리플+
  if (rules.parPenalty) {
    if (hole.par === 3 && worst >= 2) {
      multiplier *= 2;
      reasons.push("파3 더블+");
    } else if (hole.par >= 4 && worst >= 3) {
      multiplier *= 2;
      reasons.push("파4·5 트리플+");
    }
  }

  if (rules.tie) {
    const threshold = playerCount <= 3 ? 2 : 3;
    const counts = new Map<number, number>();
    for (const s of scores) counts.set(s, (counts.get(s) ?? 0) + 1);
    if ([...counts.values()].some((c) => c >= threshold)) {
      multiplier *= 2;
      reasons.push(threshold === 2 ? "2인 동타" : "3인 동타");
    }
  }

  return { multiplier, reasons };
}

/** 순 잔액(net)을 최소 송금 건수로 단순화한다. (그리디 최소 현금흐름) */
export function settleNet(net: Record<string, number>): Transfer[] {
  const EPS = 1e-6;
  const creditors: { id: string; amt: number }[] = [];
  const debtors: { id: string; amt: number }[] = [];
  for (const [id, v] of Object.entries(net)) {
    if (v > EPS) creditors.push({ id, amt: v });
    else if (v < -EPS) debtors.push({ id, amt: -v });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    transfers.push({
      fromId: debtors[i].id,
      toId: creditors[j].id,
      amount: Math.round(pay),
    });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < EPS) i++;
    if (creditors[j].amt < EPS) j++;
  }
  return transfers;
}

const addInto = (target: Record<string, number>, src: Record<string, number>) => {
  for (const id of Object.keys(src)) target[id] = (target[id] ?? 0) + src[id];
};

/**
 * 한 홀 게임 순수 정산(버디 보너스 제외).
 * 두 명씩 비교해 스코어가 나쁜(높은) 사람이 좋은 사람에게 (타수차 × 타당금액×배판)을 준다.
 */
export function holeNet(
  hole: HoleScore,
  players: Player[],
  unit: number,
  rules: BetRules
): {
  net: Record<string, number>;
  transfers: Transfer[];
  multiplier: number;
  reasons: string[];
} {
  const entered = players.filter((p) => hole.scores[p.id] != null);
  const { multiplier, reasons } = holeMultiplier(hole, rules, entered.length);
  const net: Record<string, number> = {};
  for (const p of players) net[p.id] = 0;

  if (entered.length >= 2) {
    const effUnit = unit * multiplier;
    const n = entered.length;
    const total = entered.reduce((s, p) => s + (hole.scores[p.id] as number), 0);
    for (const p of entered) {
      const sc = hole.scores[p.id] as number;
      net[p.id] = effUnit * (total - n * sc);
    }
  }

  return { net, transfers: settleNet(net), multiplier, reasons };
}

/**
 * 버디 추가 정산: 버디(-1) 이상을 잡으면 "한 타를 더 잡아준다".
 * 즉 버디한 사람은 다른 모든 참가자에게서 (타당금액 × 배판)을 추가로 받는다.
 * 배판 홀이면 2배로 적용된다.
 */
export function birdieHoleNet(
  hole: HoleScore,
  players: Player[],
  unit: number,
  rules: BetRules
): { net: Record<string, number>; transfers: Transfer[] } {
  const entered = players.filter((p) => hole.scores[p.id] != null);
  const { multiplier } = holeMultiplier(hole, rules, entered.length);
  const effUnit = unit * multiplier;
  const net: Record<string, number> = {};
  for (const p of players) net[p.id] = 0;

  if (entered.length >= 2) {
    for (const b of entered) {
      const sc = hole.scores[b.id] as number;
      if (sc <= -1) {
        for (const q of entered) {
          if (q.id === b.id) continue;
          net[b.id] += effUnit;
          net[q.id] -= effUnit;
        }
      }
    }
  }
  return { net, transfers: settleNet(net) };
}

/**
 * 핸디캡 정산: 각 쌍의 핸디 차이 × 타당금액.
 * 핸디가 낮은(잘 치는) 사람이 높은 사람에게 준다. (항상 양수 방향)
 */
export function handicapNet(config: GameConfig): {
  net: Record<string, number>;
  transfers: Transfer[];
} {
  const { players, unit, handicapOverrides } = config;
  const net: Record<string, number> = {};
  for (const p of players) net[p.id] = 0;

  for (let a = 0; a < players.length; a++) {
    for (let b = a + 1; b < players.length; b++) {
      const pa = players[a];
      const pb = players[b];
      const key = `${pa.id}->${pb.id}`;
      const diff =
        handicapOverrides[key] != null
          ? handicapOverrides[key]
          : pb.handicap - pa.handicap;
      const amt = diff * unit;
      net[pa.id] -= amt;
      net[pb.id] += amt;
    }
  }
  return { net, transfers: settleNet(net) };
}

/** 게임(홀) 누적 순수 정산 */
export function gameNet(config: GameConfig, holes: HoleScore[]) {
  const net: Record<string, number> = {};
  for (const p of config.players) net[p.id] = 0;
  for (const hole of holes) {
    addInto(net, holeNet(hole, config.players, config.unit, config.rules).net);
  }
  return { net, transfers: settleNet(net) };
}

/** 버디 누적 추가 정산 */
export function birdieNet(config: GameConfig, holes: HoleScore[]) {
  const net: Record<string, number> = {};
  for (const p of config.players) net[p.id] = 0;
  for (const hole of holes) {
    addInto(net, birdieHoleNet(hole, config.players, config.unit, config.rules).net);
  }
  return { net, transfers: settleNet(net) };
}

/** 전체 최종 정산 = 게임 + 버디 + (사후정산 시)핸디캡 */
export function totalNet(
  config: GameConfig,
  holes: HoleScore[],
  includeHandicap: boolean
): { net: Record<string, number>; transfers: Transfer[] } {
  const net: Record<string, number> = {};
  for (const p of config.players) net[p.id] = 0;

  addInto(net, gameNet(config, holes).net);
  addInto(net, birdieNet(config, holes).net);
  if (includeHandicap) addInto(net, handicapNet(config).net);

  return { net, transfers: settleNet(net) };
}
