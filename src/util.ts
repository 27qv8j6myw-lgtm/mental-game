import type {
  GameMode,
  Gender,
  HandicapMode,
  HoleScore,
  PaymentMethod,
  RankMethod,
  RankPrize,
  RankRules,
  SettleTiming,
  SkinsRules,
  StoredRules,
  TeeBox,
} from "./types";

export const GAME_MODE_LABEL: Record<GameMode, string> = {
  stroke: "타당",
  skins: "스킨스",
  caddie: "캐디피",
  rank: "등수",
  record: "기록",
};

/** 캐디피 내기: 홀마다 꼴찌가 내는 금액 (고정) */
export const CADDIE_PER_HOLE = 10000;

export const HANDICAP_MODE_LABEL: Record<HandicapMode, string> = {
  avg: "평균 타수",
  stroke: "최저핸디 대비",
  adjust: "타수 보정",
};

export const RANK_METHOD_LABEL: Record<RankMethod, string> = {
  points: "타당 포인트",
  net: "핸디 타수",
  skins: "스킨스",
};

export const RANK_PRIZE_LABEL: Record<RankPrize, string> = {
  none: "금액 없음",
  pay: "등수별로 내는 돈",
  exchange: "등수별로 주고받는 돈",
};

/** 새 등수 내기의 기본값: 타당 포인트(배판 적용), 등수별 금액 없음 */
export const DEFAULT_RANK_RULES: RankRules = {
  method: "points",
  prize: "none",
  amounts: [0, 10000, 20000, 30000],
  multipliers: true,
};

/** 티 박스: 라운드 만들기에서 고르는 순서대로 */
export const TEE_BOXES: [TeeBox, string][] = [
  ["red", "레드"],
  ["senior", "시니어"],
  ["white", "화이트"],
  ["blue", "블루"],
  ["black", "블랙"],
];

/** "white" → "화이트 티". 예전 라운드처럼 값이 없으면 빈 문자열 */
export const teeLabel = (t: string | null | undefined) => {
  const name = TEE_BOXES.find(([k]) => k === t)?.[1];
  return name ? `${name} 티` : "";
};

/** 새 스킨스 라운드의 배수 조건 기본값 */
export const DEFAULT_SKINS_RULES: SkinsRules = {
  carryDouble: true,
  birdie: true,
  late: true,
  maxMultiplier: 4,
};

export const SKINS_RULE_LABELS: ["carryDouble" | "birdie" | "late", string][] = [
  ["carryDouble", "이월하면 2배"],
  ["birdie", "버디·이글 배수"],
  ["late", "후반 가중"],
];

/** 타수 보정 표기: 0 → "보정 없음", 2 → "2타 보정" */
export const adjLabel = (n: number) => (n > 0 ? `${n}타 보정` : "보정 없음");

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "현금 지급",
  transfer: "계좌이체",
};

export const settleNote = (s: SettleTiming) =>
  s === "pre"
    ? "핸디캡 금액은 현금으로 미리 주고받아요."
    : "핸디캡 금액은 계좌이체 금액에 자동으로 반영돼요.";

/** 핸디 표기: 0 → "0", 17 → "+17" */
export const hcLabel = (h: number) => (h > 0 ? `+${h}` : `${h}`);

/** 휴대폰 로컬 기준 YYYY-MM-DD / HH:MM (toISOString 은 UTC 라 아침엔 전날이 된다) */
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const localTime = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const genderEmoji = (g: Gender) => (g === "male" ? "🙎🏻‍♂️" : "🙍🏻‍♀️");

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export const wonSigned = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(Math.round(n)).toLocaleString(
    "ko-KR"
  )}원`;

/** 파 대비 타수 → 정식 명칭 */
export const scoreLabel = (_par: number, rel: number) => {
  if (rel <= -4) return "콘도르";
  if (rel === -3) return "알바트로스";
  if (rel === -2) return "이글";
  if (rel === -1) return "버디";
  if (rel === 0) return "파";
  if (rel === 1) return "보기";
  if (rel === 2) return "더블보기";
  if (rel === 3) return "트리플보기";
  if (rel === 4) return "쿼드러플보기";
  if (rel === 5) return "퀸튜플보기";
  return `+${rel}`;
};

export const relLabel = (rel: number) => {
  if (rel === 0) return "E";
  return rel > 0 ? `+${rel}` : `${rel}`;
};

/* ---------- 스코어 수정 내역 ---------- */

export const SETTLE_LABEL: Record<SettleTiming, string> = {
  pre: "사전 정산",
  post: "사후 정산",
};

export type RuleToggleKey = "parPenalty" | "doublePar" | "birdieDouble" | "tie";

export const RULE_LABELS: [RuleToggleKey, string][] = [
  ["parPenalty", "파 페널티 배판"],
  ["doublePar", "더블파 배판"],
  ["birdieDouble", "버디 배판"],
  ["tie", "동타 배판"],
];

export const onOff = (v: boolean | undefined) => (v ? "켜짐" : "꺼짐");

/** 배수 총 상한 표기: 값 없음(예전 라운드)은 ×2, null 은 무제한 */
export const capLabel = (v: number | null | undefined) =>
  v === null ? "무제한" : `×${v ?? 2}`;

/** 한 홀 스코어 표기: 5타(+1) / 미입력 */
export const scoreText = (par: number, rel: number | null) =>
  rel == null ? "미입력" : `${par + rel}타(${relLabel(rel)})`;

/**
 * 한 홀을 고친 수정 내역 문장: "3번 홀 PAR 4 → 5", "3번 홀 박영수: 5타(+1) → 4타(E)".
 * 바뀐 게 없으면 빈 배열
 */
export function holeEditItems(
  index: number,
  orig: Pick<HoleScore, "par" | "scores">,
  next: Pick<HoleScore, "par" | "scores">,
  nameOf: (id: string) => string
): string[] {
  const items: string[] = [];
  if (next.par !== orig.par) items.push(`${index + 1}번 홀 PAR ${orig.par} → ${next.par}`);
  for (const pid of Object.keys(next.scores)) {
    const a = orig.scores[pid] ?? null;
    const b = next.scores[pid] ?? null;
    if (a !== b)
      items.push(`${index + 1}번 홀 ${nameOf(pid)}: ${scoreText(orig.par, a)} → ${scoreText(next.par, b)}`);
  }
  return items;
}

export const appendEditLog = (
  rules: StoredRules,
  by: string,
  items: string[]
): StoredRules => ({
  ...rules,
  editLog: [...(rules.editLog ?? []), { at: new Date().toISOString(), by, items }],
});

/** 10/19 18:40 */
export const logTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${localTime(d)}`;
};
