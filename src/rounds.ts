import { supabase } from "./supabase";
import type {
  Gender,
  HoleStat,
  RoundListItem,
  RoundPlayerRow,
  RoundRow,
  StoredRules,
} from "./types";

export interface PlayerInfo {
  name: string;
  gender: Gender;
  avgScore: number | null;
  handicap: number;
}

/** round_hole_stats 행: 기록 모드 홀별 상세 기록 */
export type HoleStatRow = HoleStat & { hole_index: number; player_uid: string };

/**
 * round_holes 행. saved_at·saved_by·version 은 홀 저장(supabase/holesave.sql) 칸:
 * 저장된 홀이면 saved_at 이 있고, 저장·수정할 때마다 version 이 1씩 오른다
 */
export interface HoleRow {
  hole_index: number;
  par: number;
  saved_at?: string | null;
  saved_by?: string | null;
  version?: number;
}

export interface RoundBundle {
  round: RoundRow;
  players: RoundPlayerRow[];
  holes: HoleRow[];
  scores: { hole_index: number; player_uid: string; rel: number }[];
  /** 기록 모드 홀별 상세 기록. 기기에 보관된 예전 데이터에는 없을 수 있다 */
  stats?: HoleStatRow[];
}

/** 홀별 상세 기록 테이블(supabase/record.sql)을 아직 만들지 않은 경우: 기록 없이 동작 */
const isMissingTable = (e: { code?: string } | null) =>
  e?.code === "PGRST205" || e?.code === "42P01";

function requireDb() {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  return supabase;
}

export interface CreateRoundParams {
  courseName: string;
  /** 티 박스 (TeeBox) */
  courseTee: string;
  date: string;
  teeTime: string;
  unit: number;
  rules: StoredRules;
  handicapSettle: "pre" | "post";
  holeCount: number;
  me: PlayerInfo;
}

export async function createRound(p: CreateRoundParams): Promise<RoundRow> {
  const db = requireDb();
  const { data, error } = await db.rpc("create_round", {
    p_course_name: p.courseName,
    p_course_tee: p.courseTee,
    p_date: p.date,
    p_tee_time: p.teeTime,
    p_unit: p.unit,
    // 내기 라운드는 홀마다 저장하는 방식 (holesave.sql)
    p_rules: p.rules.gameMode === "record" ? p.rules : { ...p.rules, holeSave: true },
    p_handicap_settle: p.handicapSettle,
    p_hole_count: p.holeCount,
    p_name: p.me.name,
    p_gender: p.me.gender,
    p_avg_score: p.me.avgScore,
    p_handicap: p.me.handicap,
  });
  if (error) throw error;
  return data as RoundRow;
}

/** 스코어카드 사진으로 만든 기록 라운드의 홀 하나 (hole_index 순서) */
export interface ImportHole {
  par: number;
  /** 타수 (이 홀을 안 쳤으면 null) */
  strokes: number | null;
  stat: HoleStat;
}

/**
 * 끝난 기록 라운드를 한 번에 만든다 (스코어카드 사진으로 기록 추가).
 * 라운드 만들기 → 파·스코어·상세 기록 넣기 → 종료. 중간에 실패하면 만든 라운드를 지운다
 */
export async function importRecordRound(
  p: Omit<CreateRoundParams, "unit" | "handicapSettle">,
  holes: ImportHole[]
): Promise<RoundRow> {
  const db = requireDb();
  const round = await createRound({ ...p, unit: 0, handicapSettle: "post" });
  // 만든 사람(방장)이 곧 기록하는 사람
  const uid = round.host_uid;
  try {
    const holeRows = holes.map((h, i) => ({ round_id: round.id, hole_index: i, par: h.par }));
    const scoreRows = holes.flatMap((h, i) =>
      h.strokes == null
        ? []
        : [{ round_id: round.id, hole_index: i, player_uid: uid, rel: h.strokes - h.par }]
    );
    const s = (st: HoleStat) => st.putts != null || st.fairway != null || st.ob + st.hazard + st.sand > 0;
    const statRows = holes.flatMap((h, i) =>
      s(h.stat) ? [{ round_id: round.id, hole_index: i, player_uid: uid, ...h.stat }] : []
    );
    const r1 = await db.from("round_holes").upsert(holeRows);
    if (r1.error) throw r1.error;
    const r2 = await db.from("round_scores").upsert(scoreRows);
    if (r2.error) throw r2.error;
    if (statRows.length > 0) {
      const r3 = await db.from("round_hole_stats").upsert(statRows);
      if (r3.error) throw r3.error;
    }
    await setRoundStatus(round.id, "done");
    return { ...round, status: "done" };
  } catch (e) {
    await db.from("rounds").delete().eq("id", round.id);
    throw e;
  }
}

export async function joinRoundByCode(
  code: string,
  me: PlayerInfo
): Promise<RoundRow> {
  const db = requireDb();
  const { data, error } = await db.rpc("join_round", {
    p_code: code.trim().toUpperCase(),
    p_name: me.name,
    p_gender: me.gender,
    p_avg_score: me.avgScore,
    p_handicap: me.handicap,
  });
  if (error) {
    if (error.message?.includes("ROUND_NOT_FOUND"))
      throw new Error("이 코드로 들어갈 수 있는 라운드가 없어요. 코드를 다시 확인해 주세요 (이미 시작한 라운드에는 들어갈 수 없어요).");
    throw error;
  }
  return data as RoundRow;
}

export async function listMyRounds(): Promise<RoundListItem[]> {
  const db = requireDb();
  // RLS: 내가 host 이거나 참여자인 라운드만 반환됨
  const { data, error } = await db
    .from("rounds")
    .select("*, round_players(user_uid, name, seat_order)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as RoundListItem[]) ?? [];
}

export async function getRoundBundle(roundId: string): Promise<RoundBundle> {
  const db = requireDb();
  const [round, players, holes, scores, stats] = await Promise.all([
    db.from("rounds").select("*").eq("id", roundId).single(),
    db
      .from("round_players")
      .select("*")
      .eq("round_id", roundId)
      .order("seat_order", { ascending: true }),
    db.from("round_holes").select("hole_index,par,saved_at,saved_by,version").eq("round_id", roundId),
    db
      .from("round_scores")
      .select("hole_index,player_uid,rel")
      .eq("round_id", roundId),
    db
      .from("round_hole_stats")
      .select("hole_index,player_uid,putts,fairway,lie,ob,hazard,sand")
      .eq("round_id", roundId),
  ]);
  // holesave.sql 을 아직 실행하지 않은 DB: 저장 칸 없이 파만 받는다 (라운드는 열리게)
  let holeData = holes.data as HoleRow[] | null;
  let holeError = holes.error;
  if (holes.error?.code === "42703") {
    const old = await db.from("round_holes").select("hole_index,par").eq("round_id", roundId);
    holeData = old.data as HoleRow[] | null;
    holeError = old.error;
  }
  // 통신이 약해 일부만 실패하면 빈 스코어로 덮어 화면에서 사라지므로 하나라도 실패하면 전체를 실패로 본다
  const statsError = isMissingTable(stats.error) ? null : stats.error;
  const error = round.error ?? players.error ?? holeError ?? scores.error ?? statsError;
  if (error) throw error;
  return {
    round: round.data as RoundRow,
    players: (players.data as RoundPlayerRow[]) ?? [],
    holes: holeData ?? [],
    scores:
      (scores.data as { hole_index: number; player_uid: string; rel: number }[]) ??
      [],
    stats: (stats.data as HoleStatRow[] | null) ?? [],
  };
}

export async function updateMyPlayer(
  roundId: string,
  userUid: string,
  patch: Partial<
    Pick<
      RoundPlayerRow,
      | "name"
      | "gender"
      | "avg_score"
      | "handicap"
      | "photo_url"
      | "is_guest"
      | "bank_name"
      | "bank_account"
    >
  >
): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("round_players")
    .update(patch)
    .eq("round_id", roundId)
    .eq("user_uid", userUid);
  if (error) throw error;
}

/** 방장 전용(RLS): 라운드 규칙·핸디 정산 시점 수정 */
export async function updateRound(
  roundId: string,
  patch: Partial<Pick<RoundRow, "rules" | "handicap_settle" | "unit" | "hole_count">>
): Promise<void> {
  const db = requireDb();
  const { error } = await db.from("rounds").update(patch).eq("id", roundId);
  if (error) throw error;
}

/** 저장 대기열(pending.ts)이 다시 보내기 전에 라운드가 종료·삭제됐는지 확인한다. 볼 수 없으면 null */
export async function getRoundMeta(
  roundId: string,
  signal: AbortSignal
): Promise<{ status: RoundRow["status"]; host_uid: string; gameMode: string | null } | null> {
  const db = requireDb();
  const { data, error } = await db
    .from("rounds")
    .select("status,host_uid,gameMode:rules->>gameMode")
    .eq("id", roundId)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw error;
  return data as { status: RoundRow["status"]; host_uid: string; gameMode: string | null } | null;
}

export async function setPar(
  roundId: string,
  holeIndex: number,
  par: number,
  signal: AbortSignal
): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("round_holes")
    .upsert({ round_id: roundId, hole_index: holeIndex, par })
    .abortSignal(signal);
  if (error) throw error;
}

export async function setScore(
  roundId: string,
  holeIndex: number,
  playerUid: string,
  rel: number | null,
  signal: AbortSignal
): Promise<void> {
  const db = requireDb();
  if (rel === null) {
    const { error } = await db
      .from("round_scores")
      .delete()
      .eq("round_id", roundId)
      .eq("hole_index", holeIndex)
      .eq("player_uid", playerUid)
      .abortSignal(signal);
    if (error) throw error;
  } else {
    const { error } = await db
      .from("round_scores")
      .upsert({ round_id: roundId, hole_index: holeIndex, player_uid: playerUid, rel })
      .abortSignal(signal);
    if (error) throw error;
  }
}

/** 기록 모드 홀별 상세 기록 저장 (RLS: 본인 것만) */
export async function setHoleStat(
  roundId: string,
  holeIndex: number,
  playerUid: string,
  stat: HoleStat,
  signal: AbortSignal
): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("round_hole_stats")
    .upsert({ round_id: roundId, hole_index: holeIndex, player_uid: playerUid, ...stat })
    .abortSignal(signal);
  if (error) throw error;
}

/** 방장: 대기실에서 참여자 내보내기 (supabase/lobby.sql) */
export async function kickPlayer(roundId: string, userUid: string): Promise<void> {
  const db = requireDb();
  const { error } = await db.rpc("kick_player", { p_round_id: roundId, p_user_uid: userUid });
  if (error) throw error;
}

/** 방장: 폰 없는 동반자 넣기 (이름만, 스코어는 다른 사람이 대신 입력) */
export async function addOfflinePlayer(roundId: string, name: string): Promise<void> {
  const db = requireDb();
  const { error } = await db.rpc("add_offline_player", {
    p_round_id: roundId,
    p_name: name,
    p_gender: "male",
    p_avg_score: null,
    p_handicap: 0,
  });
  if (error) throw error;
}

/** 방장: 폰 없는 동반자 정보 고치기. avg_score 가 null 이면 평균 타수를 지운다 */
export async function updateOfflinePlayer(
  roundId: string,
  userUid: string,
  patch: Partial<{ name: string; gender: Gender; avg_score: number | null; handicap: number }>
): Promise<void> {
  const db = requireDb();
  const { error } = await db.rpc("update_offline_player", {
    p_round_id: roundId,
    p_user_uid: userUid,
    p_name: patch.name ?? null,
    p_gender: patch.gender ?? null,
    p_avg_score: patch.avg_score ?? null,
    p_handicap: patch.handicap ?? null,
    p_clear_avg: "avg_score" in patch && patch.avg_score === null,
  });
  if (error) throw error;
}

/**
 * 홀 저장 (supabase/holesave.sql save_hole): 파와 모든 참여자 스코어를 한 번에 확정한다.
 * 보던 사이 다른 사람이 먼저 저장했으면 HOLE_CONFLICT 로 거절된다
 */
export async function saveHole(
  roundId: string,
  holeIndex: number,
  par: number,
  scores: Record<string, number>,
  baseVersion: number,
  items: string[],
  signal: AbortSignal
): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .rpc("save_hole", {
      p_round_id: roundId,
      p_hole: holeIndex,
      p_par: par,
      p_scores: scores,
      p_base_version: baseVersion,
      p_items: items,
    })
    .abortSignal(signal);
  if (error) throw error;
}

export async function setRoundStatus(
  roundId: string,
  status: "lobby" | "playing" | "done"
): Promise<void> {
  const db = requireDb();
  const { error } = await db.rpc("set_round_status", {
    p_round_id: roundId,
    p_status: status,
  });
  if (error) throw error;
}

export async function leaveOrDeleteRound(
  roundId: string,
  userUid: string,
  isHost: boolean
): Promise<void> {
  const db = requireDb();
  if (isHost) {
    const { error } = await db.from("rounds").delete().eq("id", roundId);
    if (error) throw error;
  } else {
    const { error } = await db
      .from("round_players")
      .delete()
      .eq("round_id", roundId)
      .eq("user_uid", userUid);
    if (error) throw error;
  }
}

/** 여러 라운드의 홀·스코어 변경을 구독 (홈 목록의 진행 중 라운드 타수). 변경 시 onChange() */
export function subscribeRoundScores(roundIds: string[], onChange: () => void) {
  const db = requireDb();
  const filter = `round_id=in.(${roundIds.join(",")})`;
  const channel = db
    .channel(`round-scores:${roundIds.join(",")}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "round_holes", filter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "round_scores", filter }, onChange)
    .subscribe();
  return () => {
    db.removeChannel(channel);
  };
}

/** 라운드 관련 테이블(+ 기록 모드 상세 기록) 변경을 구독. 변경 시 onChange() 호출(재조회 트리거). */
export function subscribeRound(roundId: string, onChange: () => void) {
  const db = requireDb();
  const channel = db
    .channel(`round:${roundId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rounds", filter: `id=eq.${roundId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "round_players", filter: `round_id=eq.${roundId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "round_holes", filter: `round_id=eq.${roundId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "round_scores", filter: `round_id=eq.${roundId}` },
      onChange
    )
    .subscribe();
  // 기록 모드 상세 기록은 채널을 따로 둔다: 테이블(record.sql)이 아직 없어 구독이 실패해도
  // 위 4개 테이블 구독은 영향을 받지 않게
  const statsChannel = db
    .channel(`round-stats:${roundId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "round_hole_stats", filter: `round_id=eq.${roundId}` },
      onChange
    )
    .subscribe();

  return () => {
    db.removeChannel(channel);
    db.removeChannel(statsChannel);
  };
}
