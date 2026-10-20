import type { RoundBundle } from "./rounds";
import type { GameConfig, HoleScore, HoleStat, ParValue, Player, TeeLie } from "./types";

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
    gender: p.gender,
    avgScore:
      (r.rules.avgOverrides && p.user_uid in r.rules.avgOverrides
        ? r.rules.avgOverrides[p.user_uid]
        : p.avg_score) ?? 0,
    handicap:
      r.rules.hcOverrides?.[p.user_uid] ?? (p.user_uid === baseUid ? 0 : p.handicap),
    photoUrl: p.photo_url,
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
  };
}

export function bundleHoles(bundle: RoundBundle): HoleScore[] {
  const parMap = new Map(bundle.holes.map((h) => [h.hole_index, h.par]));
  const scoreMap = new Map<string, number>();
  for (const s of bundle.scores) scoreMap.set(`${s.hole_index}:${s.player_uid}`, s.rel);
  return Array.from({ length: bundle.round.hole_count }, (_, i) => {
    const par = (parMap.get(i) ?? 4) as ParValue;
    const scores: Record<string, number | null> = {};
    for (const p of bundle.players) {
      const v = scoreMap.get(`${i}:${p.user_uid}`);
      // 홀 최대 타수는 더블파(파 대비 +par)까지만 반영
      scores[p.user_uid] = v === undefined ? null : Math.min(v, par);
    }
    return { par, scores };
  });
}

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
