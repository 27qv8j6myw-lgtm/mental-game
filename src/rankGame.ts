import { birdieNet, gameNet, judgedScore, settleNet, skinsResult, splitThousands } from "./betting";
import { DEFAULT_RANK_RULES, HANDICAP_MODE_LABEL, RANK_METHOD_LABEL } from "./util";
import type { GameConfig, HandicapMode, HoleScore, RankRules, Transfer } from "./types";

/*
 * 등수 내기: 홀마다 돈이 오가지 않고 점수로 등수만 정한다. 같은 점수는 같은 등수.
 * - points: 타당처럼 두 명씩 타수 차를 포인트로 (unit 1). 배판을 끄면 조건·이월·버디 추가 없이 타수 차만
 * - net: 핸디를 반영한 타수 (파 대비). 핸디 방식은 셋 중 하나
 *   · 평균 타수 / 최저핸디 대비: 친 홀 타수 − 핸디 (18홀 기준, 9홀이면 절반, 진행 중에는 친 홀 비율만큼)
 *   · 타수 보정: 파4·파5 홀마다 잡아준 타수를 빼고(파까지만) 더한 타수
 * - skins: 딴 스킨 수 (스킨스 배수 조건 적용, 마지막 홀 나눠 가지면 나눈 만큼)
 * 등수별 금액: 공동 등수는 그 자리들 금액의 합을 천 원 단위로 나눈다. 정하지 않은 등수는 0원.
 * - pay: 각자 내는 돈 (모아서 쓴다, 송금 없음)
 * - exchange: + 받음 / − 냄. 합이 0이면 송금을 계산하고, 아니면 계산하지 않는다
 */

export interface RankRow {
  id: string;
  rank: number;
  score: number;
}

export interface RankResult {
  rules: RankRules;
  /** 사람별 점수 (points·skins 는 높을수록, net 은 낮을수록 위) */
  score: Record<string, number>;
  /** 사람별 친 홀 수 */
  played: Record<string, number>;
  /** 등수 순 */
  order: RankRow[];
  /** 사람별 등수 금액 (pay: 낼 돈 / exchange: ±). 금액 없음이면 0 */
  amounts: Record<string, number>;
  /** exchange 이고 합이 0일 때 송금 */
  transfers: Transfer[];
  /** exchange 인데 합이 0이 아니라 송금을 계산하지 않았다 */
  unbalanced: boolean;
}

export const rankRules = (config: GameConfig): RankRules => config.rules.rank ?? DEFAULT_RANK_RULES;

/** "등수 · 타당 포인트(배판 없음) · 내는 돈" / "등수 · 핸디 타수(최저핸디 대비)". hm: 그 라운드의 핸디 방식 */
export function rankSummary(r: RankRules, hm?: HandicapMode) {
  const method =
    RANK_METHOD_LABEL[r.method] +
    (r.method === "points" && !r.multipliers ? "(배판 없음)" : "") +
    (r.method === "net" && hm ? `(${HANDICAP_MODE_LABEL[hm]})` : "");
  const prize = r.prize === "pay" ? " · 내는 돈" : r.prize === "exchange" ? " · 주고받는 돈" : "";
  return `등수 · ${method}${prize}`;
}

/** 등수 금액(주고받는 돈)이 지금 인원으로 합 0 인지 */
export const rankPrizeBalanced = (r: RankRules, players: number) =>
  r.prize !== "exchange" || Array.from({ length: players }, (_, i) => r.amounts[i] ?? 0).reduce((a, b) => a + b, 0) === 0;

/** 점수 표기: 포인트 "+12점" / 핸디 타수 "순 +3" (핸디 뺀 파 대비) / 스킨스 "스킨 2개" */
export function rankScoreText(method: RankRules["method"], v: number) {
  const signed = `${v > 0 ? "+" : ""}${v}`;
  if (method === "points") return `${signed}점`;
  if (method === "net") return `순 ${v === 0 ? "E" : signed}`;
  return `스킨 ${v}개`;
}

/** 높을수록 위인 방식 */
export const higherIsBetter = (r: RankRules) => r.method !== "net";

/** 포인트 방식 계산용 설정: unit 1, 배판을 끄면 조건을 모두 끄고 상한 ×1 (이월도 없음) */
export function pointsConfig(config: GameConfig): GameConfig {
  const rules = rankRules(config).multipliers
    ? config.rules
    : { ...config.rules, parPenalty: false, doublePar: false, tie: false, birdieDouble: false, maxMultiplier: 1 };
  return { ...config, unit: 1, rules };
}

/** 9홀 라운드는 핸디 절반 */
const effHandicap = (handicap: number, holeCount: number) => (holeCount <= 9 ? handicap / 2 : handicap);
const round1 = (v: number) => Math.round(v * 10) / 10;

export function rankScores(config: GameConfig, holes: HoleScore[]) {
  const r = rankRules(config);
  const score: Record<string, number> = {};
  const played: Record<string, number> = {};
  for (const p of config.players) {
    score[p.id] = 0;
    played[p.id] = holes.filter((h) => h.scores[p.id] != null).length;
  }
  if (r.method === "points") {
    const cfg = pointsConfig(config);
    const g = gameNet(cfg, holes).net;
    // 배판을 끄면 버디 추가 포인트도 없다
    const b = r.multipliers ? birdieNet(cfg, holes).net : {};
    for (const p of config.players) score[p.id] = (g[p.id] ?? 0) + (b[p.id] ?? 0);
  } else if (r.method === "net" && config.handicapMode === "adjust") {
    // 타수 보정: 홀마다 잡아준 타수를 뺀 판정 타수를 더한다
    for (const p of config.players)
      score[p.id] = holes.reduce((s, h) => s + (judgedScore(h, p) ?? 0), 0);
  } else if (r.method === "net") {
    for (const p of config.players) {
      const rel = holes.reduce((s, h) => s + (h.scores[p.id] ?? 0), 0);
      const hc = effHandicap(p.handicap, holes.length);
      score[p.id] = round1(rel - (holes.length ? (hc * played[p.id]) / holes.length : 0));
    }
  } else {
    const res = skinsResult({ ...config, unit: 1 }, holes);
    for (const h of res.holes) {
      if (h.status === "won") score[h.winnerIds[0]] += h.skins;
      else if (h.status === "split")
        for (const id of h.winnerIds) score[id] = round1(score[id] + h.skins / h.winnerIds.length);
    }
  }
  return { score, played };
}

export function rankResult(config: GameConfig, holes: HoleScore[]): RankResult {
  const r = rankRules(config);
  const { score, played } = rankScores(config, holes);
  const better = (a: number, b: number) => (higherIsBetter(r) ? a > b : a < b);
  const ids = config.players.map((p) => p.id);
  const order: RankRow[] = ids
    .map((id) => ({ id, score: score[id], rank: 1 + ids.filter((o) => better(score[o], score[id])).length }))
    .sort((a, b) => a.rank - b.rank || ids.indexOf(a.id) - ids.indexOf(b.id));

  // 등수 금액: 같은 등수끼리 그 자리들 금액의 합을 나눈다
  const amounts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  if (r.prize !== "none") {
    for (let pos = 0; pos < order.length; ) {
      const group = order.filter((x) => x.rank === order[pos].rank);
      const sum = group.reduce((s, _, k) => s + (r.amounts[pos + k] ?? 0), 0);
      const parts = splitThousands(sum, group.length);
      group.forEach((x, k) => (amounts[x.id] = parts[k]));
      pos += group.length;
    }
  }
  const sum = Object.values(amounts).reduce((a, b) => a + b, 0);
  const unbalanced = r.prize === "exchange" && sum !== 0;
  const transfers = r.prize === "exchange" && !unbalanced ? settleNet(amounts) : [];
  return { rules: r, score, played, order, amounts, transfers, unbalanced };
}
