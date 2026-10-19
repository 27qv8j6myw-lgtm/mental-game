import { supabase } from "./supabase";
import type { BetRules, Gender, RoundPlayerRow, RoundRow } from "./types";

export interface PlayerInfo {
  name: string;
  gender: Gender;
  avgScore: number | null;
  handicap: number;
}

export interface RoundBundle {
  round: RoundRow;
  players: RoundPlayerRow[];
  holes: { hole_index: number; par: number }[];
  scores: { hole_index: number; player_uid: string; rel: number }[];
}

function requireDb() {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  return supabase;
}

export interface CreateRoundParams {
  courseName: string;
  courseTee: string;
  date: string;
  teeTime: string;
  unit: number;
  rules: BetRules;
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
    p_rules: p.rules,
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
      throw new Error("해당 코드의 대기중 라운드를 찾을 수 없어요.");
    throw error;
  }
  return data as RoundRow;
}

export async function listMyRounds(): Promise<RoundRow[]> {
  const db = requireDb();
  // RLS: 내가 host 이거나 참여자인 라운드만 반환됨
  const { data, error } = await db
    .from("rounds")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as RoundRow[]) ?? [];
}

export async function getRoundBundle(roundId: string): Promise<RoundBundle> {
  const db = requireDb();
  const [round, players, holes, scores] = await Promise.all([
    db.from("rounds").select("*").eq("id", roundId).single(),
    db
      .from("round_players")
      .select("*")
      .eq("round_id", roundId)
      .order("seat_order", { ascending: true }),
    db.from("round_holes").select("hole_index,par").eq("round_id", roundId),
    db
      .from("round_scores")
      .select("hole_index,player_uid,rel")
      .eq("round_id", roundId),
  ]);
  if (round.error) throw round.error;
  return {
    round: round.data as RoundRow,
    players: (players.data as RoundPlayerRow[]) ?? [],
    holes: (holes.data as { hole_index: number; par: number }[]) ?? [],
    scores:
      (scores.data as { hole_index: number; player_uid: string; rel: number }[]) ??
      [],
  };
}

export async function updateMyPlayer(
  roundId: string,
  userUid: string,
  patch: Partial<
    Pick<
      RoundPlayerRow,
      "name" | "gender" | "avg_score" | "handicap" | "photo_url" | "is_guest"
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

export async function setPar(
  roundId: string,
  holeIndex: number,
  par: number
): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("round_holes")
    .upsert({ round_id: roundId, hole_index: holeIndex, par });
  if (error) throw error;
}

export async function setScore(
  roundId: string,
  holeIndex: number,
  playerUid: string,
  rel: number | null
): Promise<void> {
  const db = requireDb();
  if (rel === null) {
    const { error } = await db
      .from("round_scores")
      .delete()
      .eq("round_id", roundId)
      .eq("hole_index", holeIndex)
      .eq("player_uid", playerUid);
    if (error) throw error;
  } else {
    const { error } = await db
      .from("round_scores")
      .upsert({ round_id: roundId, hole_index: holeIndex, player_uid: playerUid, rel });
    if (error) throw error;
  }
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

/** 라운드 관련 4개 테이블 변경을 구독. 변경 시 onChange() 호출(재조회 트리거). */
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

  return () => {
    db.removeChannel(channel);
  };
}
