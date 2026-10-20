import { supabase } from "./supabase";

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
    /** 정산 확정 후 수정된 라운드 수 / 총 수정 횟수 */
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
  name: string;
  /** 앞 두 글자만 보이는 이메일. 카카오만 쓰는 사람은 없음 */
  email_masked: string | null;
  providers: string[];
  created_at: string;
  last_sign_in_at: string | null;
  round_count: number;
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
