import type { Gender } from "./types";

export const genderEmoji = (g: Gender) => (g === "male" ? "🙎🏻‍♂️" : "🙍🏻‍♀️");

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export const wonSigned = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(Math.round(n)).toLocaleString(
    "ko-KR"
  )}원`;

export const uid = () => Math.random().toString(36).slice(2, 9);

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
