import type {
  BetRules,
  GameConfig,
  HoleScore,
  Player,
  Transfer,
} from "./types";

/**
 * 한 홀의 배판 배수를 계산한다.
 * 여러 규칙이 동시에 만족되어도 배판은 중복되지 않고 최대 ×2 까지만 적용된다.
 * ※ 버디 배판이 꺼져 있으면 버디는 배판이 아니라 별도 추가 정산으로 처리한다.
 */
export function holeMultiplier(
  hole: HoleScore,
  rules: BetRules,
  playerCount: number
): { multiplier: number; reasons: string[] } {
  const scores = Object.values(hole.scores).filter(
    (s): s is number => s !== null
  );
  const reasons: string[] = [];
  if (scores.length === 0) return { multiplier: 1, reasons };

  const worst = Math.max(...scores);
  const best = Math.min(...scores);

  // 파 페널티(동시 규칙): 파3 더블+ / 파4·5 트리플+
  if (rules.parPenalty) {
    if (hole.par === 3 && worst >= 2) {
      reasons.push("파3 더블+");
    } else if (hole.par >= 4 && worst >= 3) {
      reasons.push("파4·5 트리플+");
    }
  }

  if (rules.tie) {
    const threshold = playerCount <= 3 ? 2 : 3;
    const counts = new Map<number, number>();
    for (const s of scores) counts.set(s, (counts.get(s) ?? 0) + 1);
    if ([...counts.values()].some((c) => c >= threshold)) {
      reasons.push(threshold === 2 ? "2인 동타" : "3인 동타");
    }
  }

  if (rules.birdieDouble && best <= -1) {
    reasons.push("버디 배판");
  }

  // 배판은 중복 없이 최대 2배
  return { multiplier: reasons.length > 0 ? 2 : 1, reasons };
}

/** 모든 참가자가 스코어를 입력했고, 전원 동타(같은 스코어)인 홀인지 */
export function isAllTie(hole: HoleScore, players: Player[]): boolean {
  if (players.length < 2) return false;
  const vals = players.map((p) => hole.scores[p.id]);
  if (vals.some((v) => v == null)) return false;
  return vals.every((v) => v === vals[0]);
}

/** 스코어가 2명 이상 입력되어 정산이 발생할 수 있는(진행된) 홀인지 */
function isPlayed(hole: HoleScore, players: Player[]): boolean {
  return players.filter((p) => hole.scores[p.id] != null).length >= 2;
}

/**
 * 전원 동타로 정산이 없었던 홀은 그 금액이 다음 홀로 이월되어 배판이 된다.
 * 연속으로 전원 동타면 ×2씩 누적된다. 정산이 발생한 홀 다음부터는 1로 초기화.
 * 각 홀 인덱스에 적용할 이월 배수를 반환한다.
 */
export function carryMultipliers(holes: HoleScore[], players: Player[]): number[] {
  const res: number[] = [];
  let carry = 1;
  for (let i = 0; i < holes.length; i++) {
    res[i] = carry;
    if (isAllTie(holes[i], players)) {
      carry = 2; // 전원 동타 → 다음 홀 이월 배판 (중복 없이 최대 2배)
    } else if (isPlayed(holes[i], players)) {
      carry = 1; // 정산이 난 홀 → 이월 종료
    }
    // 아직 입력이 부족한 홀은 carry 유지
  }
  return res;
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
  rules: BetRules,
  carry = 1
): {
  net: Record<string, number>;
  transfers: Transfer[];
  multiplier: number;
  reasons: string[];
} {
  const entered = players.filter((p) => hole.scores[p.id] != null);
  const base = holeMultiplier(hole, rules, players.length);
  // 배판은 중복되지 않고 최대 2배
  const multiplier = Math.min(2, base.multiplier * carry);
  const reasons =
    carry > 1 ? [...base.reasons, "이월 배판"] : base.reasons;
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
  rules: BetRules,
  carry = 1
): { net: Record<string, number>; transfers: Transfer[] } {
  const net: Record<string, number> = {};
  for (const p of players) net[p.id] = 0;

  // 버디 배판이 켜져 있으면 버디는 배판으로 처리되고, 추가(한 타) 정산은 없음
  if (rules.birdieDouble) return { net, transfers: [] };

  const entered = players.filter((p) => hole.scores[p.id] != null);
  const { multiplier: base } = holeMultiplier(hole, rules, players.length);
  const multiplier = Math.min(2, base * carry);
  const effUnit = unit * multiplier;

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
  const carries = carryMultipliers(holes, config.players);
  holes.forEach((hole, i) => {
    addInto(
      net,
      holeNet(hole, config.players, config.unit, config.rules, carries[i]).net
    );
  });
  return { net, transfers: settleNet(net) };
}

/** 버디 누적 추가 정산 */
export function birdieNet(config: GameConfig, holes: HoleScore[]) {
  const net: Record<string, number> = {};
  for (const p of config.players) net[p.id] = 0;
  const carries = carryMultipliers(holes, config.players);
  holes.forEach((hole, i) => {
    addInto(
      net,
      birdieHoleNet(hole, config.players, config.unit, config.rules, carries[i]).net
    );
  });
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
