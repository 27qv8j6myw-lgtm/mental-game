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

export interface BetRules {
  /**
   * 파 페널티 배판(동시 규칙): 파3 더블보기(+2)↑ / 파4·5 트리플보기(+3)↑ 이면 배판.
   * 두 조건은 항상 하나로 묶여 동작한다.
   */
  parPenalty: boolean;
  /** 3명 이상 동타(3인 플레이 시 2명)이면 배판 */
  tie: boolean;
  /**
   * 버디 배판: 누군가 버디(-1) 이상이면 그 홀은 배판.
   * 켜지면 "버디 시 한 타 추가" 보너스 정산은 적용되지 않는다.
   */
  birdieDouble: boolean;
}

export interface GameConfig {
  courseName: string;
  courseTee: string;
  date: string;
  teeTime: string;
  /** 타당 금액 (원) */
  unit: number;
  players: Player[];
  /** 핸디캡 정산 시점 */
  handicapSettle: SettleTiming;
  /**
   * 핸디캡 차이(수동 오버라이드) 매트릭스.
   * key = `${fromId}->${toId}` 를 사용하며, 값이 있으면 자동 계산 대신 사용.
   */
  handicapOverrides: Record<string, number>;
  rules: BetRules;
}

export type ParValue = 3 | 4 | 5;

export interface HoleScore {
  par: ParValue;
  /** playerId -> 파 대비 타수 (-2 ~ +5). null 이면 미입력 */
  scores: Record<string, number | null>;
}

export interface GameState {
  config: GameConfig | null;
  started: boolean;
  holes: HoleScore[];
  currentHole: number;
  /** 아카이브(백엔드) 문서 id. 저장되면 채워진다. */
  archiveId?: string;
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
  rules: BetRules;
  handicap_settle: SettleTiming;
  hole_count: number;
  status: RoundStatus;
  created_at: string;
  updated_at: string;
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
 * 게임/결과 화면이 소비하는 공통 세션 인터페이스.
 * 게스트(로컬 store) / 로그인(라운드+realtime) 두 어댑터가 동일 형태를 제공한다.
 */
export interface Session {
  config: GameConfig;
  holes: HoleScore[];
  currentHole: number;
  goHole: (index: number) => void;
  setPar: (holeIndex: number, par: ParValue) => void;
  setScore: (holeIndex: number, playerId: string, value: number | null) => void;
  /** 로그인 라운드일 때만 의미: 진행 상태/방장 여부 */
  status?: RoundStatus;
  isHost?: boolean;
}
