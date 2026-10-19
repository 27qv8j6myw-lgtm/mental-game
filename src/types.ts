export type Gender = "male" | "female";

export interface Player {
  id: string;
  name: string;
  gender: Gender;
  /** 평균 타수 (72 기준). 핸디 = avgScore - 72 로 자동 산출 후 수동 조정 가능 */
  avgScore: number;
  handicap: number;
  /** 로그인(구글) 사용자의 프로필 사진. 있으면 성별 이모지 대신 표시 */
  photoUrl?: string | null;
}

export type SettleTiming = "pre" | "post";
export type PaymentMethod = "cash" | "transfer";
/** avg: 평균 타수로 핸디 산출 / stroke: 최고수 대비 +N타로 직접 설정 */
export type HandicapMode = "avg" | "stroke";

export interface BetRules {
  /**
   * 파 페널티 배판(동시 규칙): 파3 더블보기(+2)↑ / 파4·5 트리플보기(+3)↑ 이면 배판.
   * 두 조건은 항상 하나로 묶여 동작한다. doublePar 와 동시에 켜지지 않는다.
   */
  parPenalty: boolean;
  /** 더블파(파의 2배 타수)↑ 가 나오면 배판. 이전에 만든 라운드에는 값이 없다. */
  doublePar?: boolean;
  /** 3명 이상 동타(3인 플레이 시 2명)이면 배판 */
  tie: boolean;
  /**
   * 버디 배판: 누군가 버디(-1) 이상이면 그 홀은 배판.
   * 켜지면 "버디 시 한 타 추가" 보너스 정산은 적용되지 않는다.
   */
  birdieDouble: boolean;
}

/** rounds.rules(jsonb)에 저장되는 값. 지불 방법·핸디 방식도 스키마 변경 없이 함께 저장한다. */
export interface StoredRules extends BetRules {
  payment?: PaymentMethod;
  handicapMode?: HandicapMode;
  /** 기준인원 대비 방식에서 방장이 정한 기준 인원(user_uid). 이 사람의 핸디는 0 */
  baseUid?: string;
  /** 게임 시작 후 방장이 고친 핸디캡 (user_uid → 핸디). 참여자 행의 값보다 우선 */
  hcOverrides?: Record<string, number>;
  /** 게임 시작 후 방장이 고친 평균 타수 (user_uid → 평균, 빈칸이면 null) */
  avgOverrides?: Record<string, number | null>;
}

export interface GameConfig {
  courseName: string;
  date: string;
  teeTime: string;
  /** 타당 금액 (원) */
  unit: number;
  players: Player[];
  payment: PaymentMethod;
  handicapMode: HandicapMode;
  /** 기준인원 대비 방식의 기준 인원 (현재 참여자 중 한 명일 때만) */
  baseUid: string | null;
  /** 핸디캡 정산 시점 */
  handicapSettle: SettleTiming;
  rules: BetRules;
}

export type ParValue = 3 | 4 | 5;

export interface HoleScore {
  par: ParValue;
  /** playerId -> 파 대비 타수 (-2 ~ +5). null 이면 미입력 */
  scores: Record<string, number | null>;
}

/** 한 명이 다른 한 명에게 보내는 송금 */
export interface Transfer {
  fromId: string;
  toId: string;
  amount: number;
}

/* ===================== 멀티플레이어 라운드 ===================== */

export type RoundStatus = "lobby" | "playing" | "done";

/** rounds 테이블 행 */
export interface RoundRow {
  id: string;
  join_code: string;
  host_uid: string;
  course_name: string;
  course_tee: string;
  date: string;
  tee_time: string;
  unit: number;
  rules: StoredRules;
  handicap_settle: SettleTiming;
  hole_count: number;
  status: RoundStatus;
  created_at: string;
  updated_at: string;
}

/** 내 라운드 목록용: 참여자 이름을 함께 가져온다 */
export interface RoundListItem extends RoundRow {
  round_players: { name: string; seat_order: number }[];
}

/** round_players 테이블 행 */
export interface RoundPlayerRow {
  id: string;
  round_id: string;
  user_uid: string;
  name: string;
  gender: Gender;
  avg_score: number | null;
  handicap: number;
  seat_order: number;
  photo_url: string | null;
  is_guest: boolean;
}

/**
 * 게임/결과 화면이 소비하는 라운드 세션 (round.tsx 가 realtime 데이터로 만든다).
 */
export interface Session {
  config: GameConfig;
  holes: HoleScore[];
  currentHole: number;
  goHole: (index: number) => void;
  setPar: (holeIndex: number, par: ParValue) => void;
  setScore: (holeIndex: number, playerId: string, value: number | null) => void;
  status: RoundStatus;
  isHost: boolean;
}
