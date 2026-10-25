import type { RoundBundle } from "./rounds";
import { greenSpeedOf } from "./greenSpeed";
import { weatherOf } from "./weather";
import type { CourseRating, GameConfig, HoleScore, HoleStat, ParValue, Player, RoundRow, TeeBox, TeeLie } from "./types";

/*
 * DB 라운드 묶음(RoundBundle) → 정산 계산에 쓰는 GameConfig·HoleScore.
 * 진행 화면(round.tsx)과 전적 집계(stats.ts)가 같은 규칙으로 계산하도록 한 곳에 둔다.
 */

export function bundleConfig(bundle: RoundBundle): GameConfig {
  const r = bundle.round;
  const handicapMode = r.rules.handicapMode ?? "avg";
  const baseUid =
    handicapMode === "stroke" &&
    bundle.players.some((p) => p.user_uid === r.rules.baseUid)
      ? r.rules.baseUid!
      : null;
  const players: Player[] = bundle.players.map((p) => ({
    id: p.user_uid,
    name: r.rules.nameOverrides?.[p.user_uid] ?? p.name,
    avgScore:
      (r.rules.avgOverrides && p.user_uid in r.rules.avgOverrides
        ? r.rules.avgOverrides[p.user_uid]
        : p.avg_score) ?? 0,
    handicap:
      r.rules.hcOverrides?.[p.user_uid] ?? (p.user_uid === baseUid ? 0 : p.handicap),
    photoUrl: p.photo_url,
    tee: p.tee ?? null,
    bankName: p.bank_name ?? null,
    bankAccount: p.bank_account ?? null,
    strokeAdj: handicapMode === "adjust" ? r.rules.strokeAdj?.[p.user_uid] ?? 0 : 0,
  }));
  return {
    courseName: r.course_name,
    courseTee: r.course_tee ?? "",
    date: r.date,
    teeTime: r.tee_time,
    unit: r.unit,
    players,
    gameMode: r.rules.gameMode ?? "stroke",
    payment: r.rules.payment ?? (r.handicap_settle === "pre" ? "cash" : "transfer"),
    handicapMode,
    baseUid,
    handicapSettle: r.handicap_settle,
    rules: r.rules,
    editLog: r.rules.editLog ?? [],
    rating: r.rules.rating ?? null,
    teeRatings: r.rules.teeRatings ?? {},
    greenSpeed: greenSpeedOf(r.rules),
    weather: weatherOf(r.rules),
  };
}

/**
 * 홀마다 저장하는 방식인지: 내기 라운드 중 holeSave 표시가 있거나 아직 끝나지 않은 것.
 * (표시 없이 종료된 예전 라운드는 즉시 저장 방식이라 모든 홀을 저장된 것으로 본다)
 */
export const usesHoleSave = (r: Pick<RoundRow, "rules" | "status">) =>
  r.rules.gameMode !== "record" && (r.rules.holeSave === true || r.status !== "done");

export function bundleHoles(bundle: RoundBundle): HoleScore[] {
  const rowMap = new Map(bundle.holes.map((h) => [h.hole_index, h]));
  const scoreMap = new Map<string, number>();
  for (const s of bundle.scores) scoreMap.set(`${s.hole_index}:${s.player_uid}`, s.rel);
  const holeSave = usesHoleSave(bundle.round);
  const done = bundle.round.status === "done";
  return Array.from({ length: bundle.round.hole_count }, (_, i) => {
    const row = rowMap.get(i);
    const par = (row?.par ?? 4) as ParValue;
    const saved = !holeSave || !!row?.saved_at;
    const scores: Record<string, number | null> = {};
    for (const p of bundle.players) {
      const v = scoreMap.get(`${i}:${p.user_uid}`);
      // 홀 최대 타수는 더블파(파 대비 +par)까지만 반영.
      // 저장하지 않고 끝난 홀(라운드를 일찍 마침)은 정산에서 빠지게 비운다
      scores[p.user_uid] = v === undefined || (done && !saved) ? null : Math.min(v, par);
    }
    return {
      par,
      scores,
      saved,
      savedBy: row?.saved_by ?? null,
      savedAt: row?.saved_at ?? null,
      version: row?.version ?? 0,
    };
  });
}

/** 정산에 넣을 홀: 저장 안 된 홀(입력 중)은 스코어를 비운다 */
export const settledHoles = (holes: HoleScore[]): HoleScore[] =>
  holes.map((h) =>
    h.saved === false
      ? { ...h, scores: Object.fromEntries(Object.keys(h.scores).map((k) => [k, null])) }
      : h
  );

/** 저장 안 된 첫 홀 (모두 저장됐으면 -1) */
export const firstUnsaved = (holes: HoleScore[]) => holes.findIndex((h) => h.saved === false);

/**
 * DB 의 티샷 결과 → 앱 값. OB·해저드로 나누기 전 앱이 쓴 'penalty' 는
 * 그 홀 카운트가 더 많은 쪽으로 본다 (같으면 OB, record.sql 의 옮기기와 같은 규칙)
 */
export const teeLie = (lie: string | null | undefined, ob: number, hazard: number): TeeLie | null =>
  lie === "penalty" ? (hazard > ob ? "hazard" : "ob") : ((lie ?? null) as TeeLie | null);

/** 기록 모드 홀별 상세 기록: [홀][playerId] */
export function bundleHoleStats(bundle: RoundBundle): Record<string, HoleStat>[] {
  const out: Record<string, HoleStat>[] = Array.from({ length: bundle.round.hole_count }, () => ({}));
  for (const s of bundle.stats ?? []) {
    if (!out[s.hole_index]) continue;
    out[s.hole_index][s.player_uid] = {
      putts: s.putts,
      fairway: s.fairway,
      lie: teeLie(s.lie, s.ob, s.hazard),
      ob: s.ob,
      hazard: s.hazard,
      sand: s.sand,
    };
  }
  return out;
}

/**
 * 그 사람이 친 티의 레이팅: 사람마다 티를 고른 경우 그 티의 레이팅 (라운드 만들 때 저장해 둔 것),
 * 없으면 라운드 레이팅
 */
export function playerRating(
  rating: CourseRating | null | undefined,
  teeRatings: Partial<Record<TeeBox, CourseRating>> | undefined,
  tee: TeeBox | null | undefined
): CourseRating | null {
  return (tee && teeRatings?.[tee]) || rating || null;
}
