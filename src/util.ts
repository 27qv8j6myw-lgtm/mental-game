import type { Gender, PaymentMethod, SettleTiming } from "./types";

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
