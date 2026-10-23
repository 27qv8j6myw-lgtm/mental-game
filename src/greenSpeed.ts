import { supabase } from "./supabase";

/*
 * 그린스피드 (스팀프미터, m). 라운드에 한 값 rules.greenSpeed — 그 라운드를 친 사람이면 누구나 기록 화면에서 넣고 고친다
 * (supabase/record.sql set_round_green_speed). 넣지 않아도 된다.
 * 빠르기 구분: 느림 ≤2.4 · 보통 2.5~2.7 · 약간 빠름 2.8~2.9 · 빠름 3.0~3.2 · 매우 빠름 ≥3.3
 */

/** 입력 창 처음 값 */
export const GREEN_SPEED_DEFAULT = 2.6;
export const GREEN_SPEED_MIN = 1.5;
export const GREEN_SPEED_MAX = 4.5;

export const GREEN_SPEED_LABEL = ["느림", "보통", "약간 빠름", "빠름", "매우 빠름"] as const;
/** 단계별 범위 (입력 창 아래 눈금) */
export const GREEN_SPEED_RANGE = ["~2.4", "2.5~2.7", "2.8~2.9", "3.0~3.2", "3.3~"] as const;
/** 단계가 바뀌는 값 (이 값부터 다음 단계) */
const CUTS = [2.5, 2.8, 3.0, 3.3];

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 0 느림 … 4 매우 빠름 */
export function greenSpeedClass(m: number): number {
  const v = round1(m);
  return CUTS.filter((c) => v >= c).length;
}

/** "2,8" "2.8m" → 2.8. 비었거나 숫자가 아니면 null, 범위 밖이면 범위 끝으로 */
export function parseGreenSpeed(text: string): number | null {
  const t = text.replace(",", ".").replace(/m$/i, "").trim();
  if (!t) return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return round1(Math.min(GREEN_SPEED_MAX, Math.max(GREEN_SPEED_MIN, v)));
}

/** 2.8 → "2.8m" */
export const greenSpeedText = (m: number) => `${m.toFixed(1)}m`;

/** rules 에서 꺼낸 값 (숫자가 아니면 null) */
export const greenSpeedOf = (rules: { greenSpeed?: unknown } | null | undefined): number | null =>
  typeof rules?.greenSpeed === "number" ? rules.greenSpeed : null;

/** rules 에 그린스피드를 넣거나(null 이면) 지운 사본 */
export function withGreenSpeed<T extends { greenSpeed?: number }>(rules: T, v: number | null): T {
  const next = { ...rules };
  if (v == null) delete next.greenSpeed;
  else next.greenSpeed = v;
  return next;
}

/** SQL 함수를 아직 만들지 않은 DB */
export class GreenSpeedSetupError extends Error {}

/**
 * 라운드 그린스피드 저장 (null 이면 지움). record.sql 을 아직 실행하지 않았으면
 * fallback(방장이 rules 를 직접 고치는 기존 방법)을 쓰고, 그것도 없으면 GreenSpeedSetupError
 */
export async function saveGreenSpeed(
  roundId: string,
  value: number | null,
  fallback?: () => Promise<void>
): Promise<void> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { error } = await supabase.rpc("set_round_green_speed", { p_round_id: roundId, p_speed: value });
  if (!error) return;
  const missing = error.code === "PGRST202" || error.code === "42883";
  if (!missing) throw error;
  if (!fallback) throw new GreenSpeedSetupError(error.message);
  await fallback();
}
