import type { GameMode, Gender, PaymentMethod, SettleTiming, StoredRules } from "./types";

export const GAME_MODE_LABEL: Record<GameMode, string> = {
  stroke: "타당",
  skins: "스킨스",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "현금 지급",
  transfer: "계좌이체",
};

export const settleNote = (s: SettleTiming) =>
  s === "pre"
    ? "핸디캡 금액을 현금으로 사전 지급합니다."
    : "핸디캡 금액을 계좌이체 금액에 자동 반영합니다.";

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

/* ---------- 정산 확정 후 수정 내역 ---------- */

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
