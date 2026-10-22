import { supabase } from "./supabase";
import { scoreLine, type RoundScoreLine } from "./roundScores";
import type { Gender, RoundListItem } from "./types";

/** admin_stats() 결과 (supabase/admin.sql) */
export interface AdminStats {
  generated_at: string;
  users: {
    total: number;
    today: number;
    last7: number;
    /** 최근 7일 안에 로그인한 사람 */
    active7: number;
    /** 구글만 / 카카오만 / 둘 다 연결 */
    providers: { google: number; kakao: number; both: number };
    daily: { day: string; count: number }[];
  };
  rounds: {
    total: number;
    today: number;
    last7: number;
    by_status: Record<string, number>;
    by_game: Record<string, number>;
    by_handicap: Record<string, number>;
    by_payment: Record<string, number>;
    avg_players: number;
    units: { unit: number; count: number }[];
    daily: { day: string; count: number }[];
    weekly: { week: string; count: number }[];
  };
  activity: {
    /** 수정 내역이 있는 라운드 수 / 총 수정 횟수 (저장된 홀 수정·종료 후 방장 수정) */
    edited_rounds: number;
    edits: number;
    /** 최근 7일 라운드에 참여한 사람 수 */
    players7: number;
  };
}

export interface AdminRound {
  id: string;
  course_name: string;
  date: string;
  tee_time: string;
  status: string;
  game_mode: string;
  handicap_mode: string;
  unit: number;
  hole_count: number;
  player_count: number;
  host_name: string;
  edit_count: number;
  created_at: string;
}

export interface AdminUser {
  user_id: string;
  /** 카카오·구글 이름 (닉네임) */
  name: string;
  /** 앱에서 정한 이름(실명). 아직 안 정했으면 null */
  real_name: string | null;
  /** 앱에서 고른 성별. 아직 안 골랐으면 null (admin.sql 을 다시 실행하기 전에는 없다) */
  gender?: Gender | null;
  /** 앞 두 글자만 보이는 이메일. 카카오만 쓰는 사람은 없음 */
  email_masked: string | null;
  providers: string[];
  created_at: string;
  last_sign_in_at: string | null;
  round_count: number;
  /** 끝까지 친 18홀 라운드의 평균 타수. 없으면 null (admin.sql 을 다시 실행하기 전에는 없다) */
  avg_score?: number | null;
}

/** 관리자 여부. admin.sql 을 아직 실행하지 않았거나 오류가 나면 false */
export async function isAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

function requireDb() {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  return supabase;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const { data, error } = await requireDb().rpc("admin_stats");
  if (error) throw error;
  return data as AdminStats;
}

export async function fetchRecentRounds(limit = 30): Promise<AdminRound[]> {
  const { data, error } = await requireDb().rpc("admin_recent_rounds", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as AdminRound[];
}

export async function fetchRecentUsers(limit = 30): Promise<AdminUser[]> {
  const { data, error } = await requireDb().rpc("admin_recent_users", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as AdminUser[];
}

/** AI 분석을 쓸 수 있나 (관리자 또는 관리자가 허용한 사람). insight.sql 을 아직 실행하지 않았으면 관리자만 */
export async function canUseAi(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("can_use_ai");
  if (error) return isAdmin();
  return data === true;
}

export interface AiGrant {
  user_id: string;
  name: string;
  email_masked: string | null;
  created_at: string;
}

/** 관리자: AI 분석을 허용한 사람들 */
export async function fetchAiGrants(): Promise<AiGrant[]> {
  const { data, error } = await requireDb().rpc("admin_ai_grants");
  if (error) throw error;
  return (data ?? []) as AiGrant[];
}

/** 관리자: AI 분석 허용 / 해제 */
export async function setAiGrant(userId: string, on: boolean): Promise<void> {
  const { error } = await requireDb().rpc("admin_set_ai_grant", { p_user_id: userId, p_on: on });
  if (error) throw error;
}

/** 관리자 홈 '사용자' 보기: 라운드 한 줄 + 사람별 타수 */
export interface UserRound {
  round: RoundListItem;
  line: RoundScoreLine;
}

/** 다른 사용자들의 진행 중 라운드·최근 끝난 라운드 (관리자만) */
export async function fetchUserRounds(recent = 10): Promise<{ active: UserRound[]; recent: UserRound[] }> {
  if (!supabase) return { active: [], recent: [] };
  const { data, error } = await supabase.rpc("admin_user_rounds", { p_recent: recent });
  if (error) throw error;
  type Row = RoundListItem & {
    holes: { hole_index: number; par: number; saved_at: string | null }[];
    scores: { hole_index: number; player_uid: string; rel: number }[];
  };
  const v = (data ?? { active: [], recent: [] }) as { active: Row[]; recent: Row[] };
  const toItem = ({ holes, scores, ...round }: Row): UserRound => ({ round, line: scoreLine(round, holes, scores) });
  return { active: v.active.map(toItem), recent: v.recent.map(toItem) };
}

/**
 * 사용자의 앱 이름(실명)과 성별을 고친다 (관리자만). 빈 이름이면 지워서 다음 로그인 때 다시 묻는다.
 * gender 를 안 넘기면 성별은 그대로 둔다
 */
export async function setUserName(userId: string, name: string, gender?: Gender): Promise<void> {
  const { error } = await requireDb().rpc("admin_set_user_name", {
    p_user_id: userId,
    p_name: name.trim(),
    ...(gender && { p_gender: gender }),
  });
  if (error) throw error;
}

/* ---------- 게스트 기록 옮기기 (supabase/guest.sql) ---------- */

export interface GuestRound {
  round_id: string;
  /** YYYY-MM-DD */
  date: string;
  course: string;
  status: string;
  hole_count: number;
  /** 그 라운드에서 쓴 이름 */
  name: string;
}

/** 예전 '로그인 없이 참여하기'(익명 계정)로 라운드에 참여한 사람 */
export interface GuestPlayer {
  guest_uid: string;
  created_at: string;
  names: string[];
  rounds: GuestRound[];
}

export interface MoveResult {
  moved: number;
  skipped: number;
}

/** 게스트로 친 기록 (최근 순). guest.sql 을 아직 실행하지 않았으면 null */
export async function fetchGuestPlayers(): Promise<GuestPlayer[] | null> {
  const { data, error } = await requireDb().rpc("admin_guest_players");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw error;
  }
  return (data ?? []) as GuestPlayer[];
}

/** 게스트의 라운드를 진짜 계정으로 옮긴다. 그 계정이 이미 들어간 라운드는 건너뛴다 */
export async function moveGuest(guestUid: string, userId: string): Promise<MoveResult> {
  const { data, error } = await requireDb().rpc("admin_move_guest", { p_guest: guestUid, p_user: userId });
  if (error) throw error;
  return data as MoveResult;
}
