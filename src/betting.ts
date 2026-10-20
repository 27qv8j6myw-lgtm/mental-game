import type {
  BetRules,
  GameConfig,
  HoleScore,
  Player,
  SkinsRules,
  Transfer,
} from "./types";

/*
 * 배판 고정 룰
 * 1. 배판 조건은 홀당 1회씩만 센다 (트리플 2명이어도 ×2 한 번)
 * 2. 조건이 겹치면 곱한다 (트리플 ×2 × 3명 동타 ×2 = ×4) — 총 상한 적용
 * 3. 전원 동타 홀은 조건 없이 정산 없음 → 다음 홀로 ×2 이월
 * 4. 전원 동타가 이어지면 이월이 계속 곱해지되 총 상한까지
 * 5. 돈이 움직인 홀 다음은 이월 종료(×1)
 * 6. 3명 동타 조건은 전원 동타가 아닐 때만 → 3인 플레이에서는 성립하지 않음
 * 7. 마지막 홀 뒤에 남은 이월은 소멸
 * 8. 버디 추가 정산은 버디 1타·이글 2타, 버디 배판에서는 이글도 버디와 같이 ×2
 * 9. 홀 최대 타수는 더블파 (round.tsx 에서 파 대비 +par 로 자른다)
 * 10. 판정은 핸디 없이 실제 타수 (핸디는 별도 정산)
 *     단, 타수 보정 방식은 파4·파5 홀에서 잡아준 타수를 빼고(파까지만) 승패·타수 차를 판정한다.
 *     배판 조건과 버디는 그때도 실제 타수로 본다.
 */

/** 타수 보정: 파4·파5 홀에서 보기 이상이면 잡아준 타수만큼 빼되, 파 아래로는 내려가지 않는다 */
export function adjustedRel(par: number, rel: number, strokes = 0): number {
  if (par === 3 || strokes <= 0 || rel <= 0) return rel;
  return Math.max(0, rel - strokes);
}

/** 승패 판정용 타수 (타수 보정 반영). 미입력이면 null */
export function judgedScore(hole: HoleScore, p: Player): number | null {
  const rel = hole.scores[p.id];
  return rel == null ? null : adjustedRel(hole.par, rel, p.strokeAdj);
}

/** 배수 총 상한. 예전 라운드(값 없음)는 ×2, null 은 무제한 */
export function multiplierCap(rules: BetRules): number {
  if (rules.maxMultiplier === null) return Infinity;
  return rules.maxMultiplier ?? 2;
}

/** 모든 참가자가 스코어를 입력했고, 전원 동타(판정 타수가 같음)인 홀인지 */
export function isAllTie(hole: HoleScore, players: Player[]): boolean {
  if (players.length < 2) return false;
  const vals = players.map((p) => judgedScore(hole, p));
  if (vals.some((v) => v == null)) return false;
  return vals.every((v) => v === vals[0]);
}

/** 스코어가 2명 이상 입력되어 정산이 발생할 수 있는(진행된) 홀인지 */
function isPlayed(hole: HoleScore, players: Player[]): boolean {
  return players.filter((p) => hole.scores[p.id] != null).length >= 2;
}

/** 이 홀에서 성립한 배판 조건들 (홀당 1회씩). 전원 동타 홀은 조건을 보지 않는다. */
export function holeConditions(
  hole: HoleScore,
  rules: BetRules,
  players: Player[]
): string[] {
  const scores = players
    .map((p) => hole.scores[p.id])
    .filter((s): s is number => s != null);
  if (scores.length === 0 || isAllTie(hole, players)) return [];

  const worst = Math.max(...scores);
  const best = Math.min(...scores);
  const reasons: string[] = [];

  if (rules.parPenalty) {
    if (hole.par === 3 && worst >= 2) reasons.push("파3 더블보기+");
    else if (hole.par >= 4 && worst >= 3) reasons.push("트리플보기+");
  }
  if (rules.doublePar && worst >= hole.par) reasons.push("더블파");
  if (rules.tie) {
    const counts = new Map<number, number>();
    for (const s of scores) counts.set(s, (counts.get(s) ?? 0) + 1);
    if ([...counts.values()].some((c) => c >= 3 && c < players.length)) {
      reasons.push("3명 동타");
    }
  }
  if (rules.birdieDouble && best <= -1) reasons.push("버디 배판");
  return reasons;
}

/** 각 홀에 들어오는 이월 배수 */
export function carryMultipliers(
  holes: HoleScore[],
  players: Player[],
  rules: BetRules
): number[] {
  const cap = multiplierCap(rules);
  const res: number[] = [];
  let carry = 1;
  for (let i = 0; i < holes.length; i++) {
    res[i] = carry;
    if (isAllTie(holes[i], players)) {
      carry = Math.min(cap, carry * 2);
    } else if (isPlayed(holes[i], players)) {
      carry = 1;
    }
    // 아직 입력이 부족한 홀은 carry 유지
  }
  return res;
}

export interface HoleMultiplier {
  multiplier: number;
  reasons: string[];
  allTie: boolean;
}

/** 이 홀의 최종 배수 = 이월 × 2^(조건 수), 총 상한 적용 */
export function holeMultiplier(
  hole: HoleScore,
  players: Player[],
  rules: BetRules,
  carry: number
): HoleMultiplier {
  const conditions = holeConditions(hole, rules, players);
  const raw = carry * 2 ** conditions.length;
  const cap = multiplierCap(rules);
  const multiplier = Math.min(cap, raw);
  const reasons = [...conditions];
  if (carry > 1) reasons.push(`이월 ×${carry}`);
  if (raw > multiplier) reasons.push(`상한 ×${cap}`);
  return { multiplier, reasons, allTie: isAllTie(hole, players) };
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
 * 두 명씩 비교해 스코어가 나쁜(높은) 사람이 좋은 사람에게 (타수차 × 타당금액 × 배수)를 준다.
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
  allTie: boolean;
} {
  const entered = players.filter((p) => hole.scores[p.id] != null);
  const { multiplier, reasons, allTie } = holeMultiplier(hole, players, rules, carry);
  const net: Record<string, number> = {};
  for (const p of players) net[p.id] = 0;

  if (entered.length >= 2) {
    const effUnit = unit * multiplier;
    const n = entered.length;
    // 타수 차는 판정 타수(타수 보정 반영)로 계산한다
    const total = entered.reduce((s, p) => s + (judgedScore(hole, p) as number), 0);
    for (const p of entered) {
      const sc = judgedScore(hole, p) as number;
      net[p.id] = effUnit * (total - n * sc);
    }
  }

  return { net, transfers: settleNet(net), multiplier, reasons, allTie };
}

/** 한 명의 버디(-1 이하) 추가 정산 내역 */
export interface BirdieEvent {
  holeIndex: number;
  playerId: string;
  rel: number;
  /** 버디 1타, 이글 2타 */
  strokes: number;
  /** 돈을 내는 상대 인원 */
  payers: string[];
  multiplier: number;
  /** 상대 한 명이 내는 금액 (타당 × 배수 × 타) */
  perPayer: number;
  /** 버디한 사람이 받는 총액 */
  amount: number;
}

function birdieHoleEvents(
  hole: HoleScore,
  holeIndex: number,
  players: Player[],
  unit: number,
  rules: BetRules,
  carry: number
): BirdieEvent[] {
  // 버디 배판이 켜져 있으면 버디는 배판으로 처리되고, 추가(한 타) 정산은 없음
  if (rules.birdieDouble) return [];
  const entered = players.filter((p) => hole.scores[p.id] != null);
  if (entered.length < 2) return [];
  const { multiplier } = holeMultiplier(hole, players, rules, carry);
  return entered
    .filter((b) => (hole.scores[b.id] as number) <= -1)
    .map((b) => {
      const rel = hole.scores[b.id] as number;
      const strokes = -rel;
      const perPayer = unit * multiplier * strokes;
      const payers = entered.filter((q) => q.id !== b.id).map((q) => q.id);
      return {
        holeIndex,
        playerId: b.id,
        rel,
        strokes,
        payers,
        multiplier,
        perPayer,
        amount: perPayer * payers.length,
      };
    });
}

/**
 * 버디 추가 정산: 버디는 1타, 이글은 2타를 더 잡아준다.
 * 버디한 사람은 다른 모든 참가자에게서 (타당금액 × 그 홀 배수 × 타)를 추가로 받는다.
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
  for (const e of birdieHoleEvents(hole, 0, players, unit, rules, carry)) {
    net[e.playerId] += e.amount;
    for (const id of e.payers) net[id] -= e.perPayer;
  }
  return { net, transfers: settleNet(net) };
}

/** 라운드 전체 버디 추가 정산 내역 (홀 순서) */
export function birdieEvents(config: GameConfig, holes: HoleScore[]): BirdieEvent[] {
  const carries = carryMultipliers(holes, config.players, config.rules);
  return holes.flatMap((hole, i) =>
    birdieHoleEvents(hole, i, config.players, config.unit, config.rules, carries[i])
  );
}

/** 홀별 검증용 내역: 배판, 게임·버디 정산, 해당 홀까지의 누적(핸디 제외) */
export interface HoleBreakdown {
  multiplier: number;
  reasons: string[];
  allTie: boolean;
  /** 전원 동타일 때 다음 홀로 넘어가는 이월 배수 (마지막 홀이면 null = 소멸) */
  nextCarry: number | null;
  game: Record<string, number>;
  birdie: Record<string, number>;
  cumulative: Record<string, number>;
}

export function holeBreakdowns(config: GameConfig, holes: HoleScore[]): HoleBreakdown[] {
  const carries = carryMultipliers(holes, config.players, config.rules);
  const cum: Record<string, number> = {};
  for (const p of config.players) cum[p.id] = 0;
  return holes.map((hole, i) => {
    const g = holeNet(hole, config.players, config.unit, config.rules, carries[i]);
    const b = birdieHoleNet(hole, config.players, config.unit, config.rules, carries[i]);
    for (const p of config.players) cum[p.id] += g.net[p.id] + b.net[p.id];
    return {
      multiplier: g.multiplier,
      reasons: g.reasons,
      allTie: g.allTie,
      nextCarry: i < holes.length - 1 ? carries[i + 1] : null,
      game: g.net,
      birdie: b.net,
      cumulative: { ...cum },
    };
  });
}

/**
 * 핸디캡 정산: 각 쌍의 핸디 차이 × 타당금액.
 * 핸디가 낮은(잘 치는) 사람이 높은 사람에게 준다. (항상 양수 방향)
 */
export function handicapNet(config: GameConfig): {
  net: Record<string, number>;
  transfers: Transfer[];
} {
  const { players, unit } = config;
  const net: Record<string, number> = {};
  for (const p of players) net[p.id] = 0;
  // 타수 보정 방식은 홀 판정에 핸디를 반영하므로 금액 정산이 없다
  if (config.handicapMode === "adjust") return { net, transfers: [] };

  for (let a = 0; a < players.length; a++) {
    for (let b = a + 1; b < players.length; b++) {
      const pa = players[a];
      const pb = players[b];
      const amt = (pb.handicap - pa.handicap) * unit;
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
  const carries = carryMultipliers(holes, config.players, config.rules);
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
  const carries = carryMultipliers(holes, config.players, config.rules);
  holes.forEach((hole, i) => {
    addInto(
      net,
      birdieHoleNet(hole, config.players, config.unit, config.rules, carries[i]).net
    );
  });
  return { net, transfers: settleNet(net) };
}

/* ---------- 스킨스 ---------- */

export type SkinStatus = "pending" | "won" | "carried" | "split";

export interface SkinHole {
  /** 이 홀에 걸린 스킨 수 (이월·후반 배수와 상한 반영, 버디 배수 전) */
  stake: number;
  /** 최종 스킨 수 (승부가 나면 버디 배수까지 반영, 아니면 stake 와 같음) */
  skins: number;
  /** 스킨 수의 근거: "이월 ×4", "후반 ×2", "버디 ×2", "상한 ×4" 등 */
  reasons: string[];
  /** 이 홀에 들어오기 전 연속 이월 횟수 */
  carryCount: number;
  /**
   * pending: 아직 전원 입력 전 / won: 단독 최저가 가져감 / carried: 최저 동타로 이월
   * split: 마지막 홀 최저 동타 → 동타인 사람끼리 나눠 가짐
   */
  status: SkinStatus;
  /** won 이면 1명, split 이면 최저 동타인 사람들 */
  winnerIds: string[];
  /** 이긴 사람 한 명이 받은 금액 */
  amount: number;
  /** 이 홀 정산 */
  net: Record<string, number>;
  /** 이 홀까지 누적 */
  cumulative: Record<string, number>;
}

export interface SkinsResult {
  holes: SkinHole[];
  net: Record<string, number>;
  transfers: Transfer[];
  /** 마지막 홀이 전원 동타로 끝나 주인 없이 사라진 스킨 수 */
  leftover: number;
}

/** 배수 조건이 없는 예전 스킨스 라운드: 이월 +1개, 배수 없음 */
export const CLASSIC_SKINS: SkinsRules = {
  carryDouble: false,
  birdie: false,
  late: false,
  maxMultiplier: null,
};

/**
 * 마지막 홀 나눠 갖기: 진 사람 한 명이 동타인 사람 각자에게 주는 금액.
 * 나누어 떨어지면 그대로, 아니면(4,000원 ÷ 3 등) 천 원 단위로 반올림하되 최소 1,000원
 */
export function splitShare(value: number, ways: number): number {
  const exact = value / ways;
  if (Number.isInteger(exact)) return exact;
  return Math.max(1000, Math.round(exact / 1000) * 1000);
}

/** 후반 가중이 붙는 마지막 홀 수 */
export const LATE_HOLES = 3;

/**
 * 스킨스: 홀마다 스킨 1개(타당 금액)가 걸리고, 단독 최저 타수(타수 보정 반영)가 걸린 스킨을 모두
 * 가져간다 — 다른 사람 모두에게서 스킨 수 × 타당 금액씩.
 * - 최저 동타면 다음 홀로 이월: 기본 +1개, '이월 2배'면 2배씩
 * - '버디 배수'면 버디로 이길 때 ×2, 이글 이상 ×3 / '후반 가중'이면 마지막 3개 홀 ×2
 * - 이월 2배·버디·후반 배수를 곱한 값은 총 상한을 넘지 않는다 (+1개씩 쌓인 스킨은 상한과 무관)
 * - 마지막 홀이 최저 동타면 동타인 사람끼리 나눠 가진다. 나누어 떨어지지 않으면(3명 등)
 *   1인당 금액을 천 원 단위로 반올림하되 최소 1,000원. 전원 동타면 남은 스킨은 소멸
 * 배판·버디 추가 정산은 없고 핸디캡은 따로 정산한다.
 */
export function skinsResult(config: GameConfig, holes: HoleScore[]): SkinsResult {
  const { players, unit } = config;
  const opts = config.rules.skins ?? CLASSIC_SKINS;
  const cap = opts.maxMultiplier === null ? Infinity : opts.maxMultiplier;
  const zero = () => Object.fromEntries(players.map((p) => [p.id, 0])) as Record<string, number>;
  const total = zero();
  let carryCount = 0;

  const out: SkinHole[] = holes.map((hole, i) => {
    const isLast = i === holes.length - 1;
    // 이월: 2배 방식은 배수로, 기본 방식은 스킨 개수로 쌓는다
    const base = opts.carryDouble ? 1 : 1 + carryCount;
    const carryF = opts.carryDouble ? 2 ** carryCount : 1;
    const lateF = opts.late && i >= holes.length - LATE_HOLES ? 2 : 1;
    const preReasons: string[] = [];
    if (carryCount > 0) preReasons.push(opts.carryDouble ? `이월 ×${carryF}` : `이월 +${carryCount}개`);
    if (lateF > 1) preReasons.push("후반 ×2");
    const stake = base * Math.min(cap, carryF * lateF);

    const net = zero();
    let status: SkinStatus = "pending";
    let winnerIds: string[] = [];
    let amount = 0;
    let skins = stake;
    let reasons = carryF * lateF > cap ? [...preReasons, `상한 ×${cap}`] : preReasons;
    const holeCarry = carryCount;

    const judged = players.map((p) => judgedScore(hole, p));
    // 전원 입력 전인 홀은 판정하지 않고 걸린 스킨을 그대로 둔다
    if (players.length >= 2 && judged.every((v) => v != null)) {
      const best = Math.min(...(judged as number[]));
      const leaders = players.filter((_, k) => judged[k] === best);
      const birdieF = opts.birdie ? (best <= -2 ? 3 : best === -1 ? 2 : 1) : 1;
      const raw = carryF * lateF * birdieF;
      skins = base * Math.min(cap, raw);
      const value = skins * unit;

      if (leaders.length === 1) {
        status = "won";
        winnerIds = [leaders[0].id];
        for (const p of players) {
          if (p.id === leaders[0].id) continue;
          net[p.id] -= value;
          net[leaders[0].id] += value;
        }
        amount = value * (players.length - 1);
        carryCount = 0;
      } else if (isLast && leaders.length < players.length) {
        // 마지막 홀 최저 동타: 나머지 사람이 낸 스킨을 동타인 사람끼리 나눈다
        status = "split";
        winnerIds = leaders.map((p) => p.id);
        const share = splitShare(value, leaders.length);
        for (const p of players) {
          if (winnerIds.includes(p.id)) continue;
          for (const id of winnerIds) {
            net[p.id] -= share;
            net[id] += share;
          }
        }
        amount = share * (players.length - leaders.length);
        carryCount = 0;
      } else {
        status = "carried";
        skins = stake;
        carryCount += 1;
      }

      if (status !== "carried") {
        reasons = [...preReasons];
        if (birdieF > 1) reasons.push(birdieF === 3 ? "이글 ×3" : "버디 ×2");
        if (raw > cap) reasons.push(`상한 ×${cap}`);
      }
    }

    for (const p of players) total[p.id] += net[p.id];
    return {
      stake,
      skins,
      reasons,
      carryCount: holeCarry,
      status,
      winnerIds,
      amount,
      net,
      cumulative: { ...total },
    };
  });

  const last = out[out.length - 1];
  return {
    holes: out,
    net: total,
    transfers: settleNet(total),
    leftover: last && last.status === "carried" ? last.stake : 0,
  };
}

/** 전체 최종 정산 = (타당: 게임 + 버디 / 스킨스: 스킨) + (사후정산 시)핸디캡 */
export function totalNet(
  config: GameConfig,
  holes: HoleScore[],
  includeHandicap: boolean
): { net: Record<string, number>; transfers: Transfer[] } {
  const net: Record<string, number> = {};
  for (const p of config.players) net[p.id] = 0;

  if (config.gameMode === "skins") {
    addInto(net, skinsResult(config, holes).net);
  } else {
    addInto(net, gameNet(config, holes).net);
    addInto(net, birdieNet(config, holes).net);
  }
  if (includeHandicap) addInto(net, handicapNet(config).net);

  return { net, transfers: settleNet(net) };
}
