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
  /** 계좌이체 라운드에서 받을 계좌 */
  bankName?: string | null;
  bankAccount?: string | null;
  /** 타수 보정 방식에서 파4·파5 홀마다 잡아주는 타수 (0·1·2). 다른 방식이면 0 */
  strokeAdj?: number;
  /** 이 사람이 친 티 박스 (남녀 혼성 등). 없으면 라운드 티 */
  tee?: TeeBox | null;
}

export type SettleTiming = "pre" | "post";
export type PaymentMethod = "cash" | "transfer";
/**
 * stroke: 타당(두 명씩 타수 차) / skins: 홀마다 단독 최저 타수가 스킨을 가져감
 * caddie: 캐디피 내기 — 홀마다 꼴찌가 1만원씩 캐디피로 낸다 (앞 홀은 연습)
 * rank: 등수 내기 — 홀마다 돈이 오가지 않고 끝나고 등수만 정한다 (등수별 금액은 선택)
 * record: 기록 모드 — 내기 없이 각자 자기 스코어·퍼트·티샷·벌타를 기록
 */
export type GameMode = "stroke" | "skins" | "caddie" | "rank" | "record";

/** 티 박스 (rounds.course_tee 에 저장. 예전 라운드는 빈 값) */
export type TeeBox = "red" | "senior" | "white" | "blue" | "black";

/** 기록 모드 티샷 방향 (파4·파5만): 훅(왼쪽)·적중·짧음(안 뜸)·슬라이스(오른쪽) */
export type Fairway = "left" | "hit" | "short" | "right";
/** 티샷이 떨어진 곳: 벙커·OB·해저드. 방향과 함께 고를 수 있다 (DB 의 예전 값 'penalty' 는 읽을 때 OB/해저드로 바꾼다) */
export type TeeLie = "bunker" | "ob" | "hazard";

/** 기록 모드 홀별 상세 기록 (round_hole_stats 행). 스코어는 HoleScore 에 있다 */
export interface HoleStat {
  /** 퍼트 수 (0~6). 입력 전이면 null */
  putts: number | null;
  fairway: Fairway | null;
  /** 티샷 벙커·OB·해저드 (방향과 별개) */
  lie: TeeLie | null;
  ob: number;
  hazard: number;
  /** 샌드샷 (벙커에서 친 샷) 수 */
  sand: number;
}
/**
 * avg: 평균 타수로 핸디 산출 / stroke: 최고수 대비 +N타로 직접 설정
 * adjust: 타수 보정 — 핸디 금액 정산 없이, 파4·파5 홀마다 정한 타수를 잡아줘 판정한다
 */
export type HandicapMode = "avg" | "stroke" | "adjust";

/** 스킨스 배수 조건. 값이 없는 예전 스킨스 라운드는 모두 꺼진 것으로 본다 */
export interface SkinsRules {
  /** 최저 동타로 이월되면 다음 홀 스킨이 2배씩 (끄면 1개씩 쌓임) */
  carryDouble: boolean;
  /** 버디로 이기면 ×2, 이글 이상으로 이기면 ×3 */
  birdie: boolean;
  /** 마지막 3개 홀은 ×2 */
  late: boolean;
  /** 위 배수를 곱한 값의 상한. 2·4·8, null 은 무제한 */
  maxMultiplier: number | null;
}

/** 캐디피 내기: 캐디피 금액. 홀당 1만원으로 나눠 내는 홀 수가 정해지고, 나머지 앞 홀은 연습 */
export interface CaddieRules {
  fee: number;
}

/**
 * 등수 정하는 방식
 * points: 타당처럼 타수 차로 포인트 (배판 규칙 적용 가능) / net: 총 타수 − 핸디 / skins: 딴 스킨 수
 */
export type RankMethod = "points" | "net" | "skins";
/** 등수별 금액: 없음 / 등수별로 내는 돈 (모아서 쓴다) / 등수별로 받고 내는 돈 (합 0, 송금) */
export type RankPrize = "none" | "pay" | "exchange";

export interface RankRules {
  method: RankMethod;
  prize: RankPrize;
  /** 1등부터 등수별 금액 (pay: 내는 돈 ≥ 0 / exchange: + 받음 · − 냄). 없는 등수는 0 */
  amounts: number[];
  /** 포인트 방식: 배판·이월·버디 추가를 쓴다 (끄면 타수 차만) */
  multipliers: boolean;
}

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
  /**
   * 배수 총 상한 (배판 조건 × 이월 모두에 적용). 2·4·8, null 은 무제한.
   * 값이 없는 예전 라운드는 ×2 로 본다.
   */
  maxMultiplier?: number | null;
  /** 스킨스 배수 조건 (스킨스 라운드, 등수 내기 스킨스 방식에서 사용) */
  skins?: SkinsRules;
  /** 캐디피 내기 설정 */
  caddie?: CaddieRules;
  /** 등수 내기 설정 */
  rank?: RankRules;
}

/** KGA 코스레이팅: 라운드 만들기에서 고른 골프장·코스·티 (보정타수 계산용) */
export interface CourseRating {
  club: string;
  /** 18홀 코스 조합 (예: "동(아웃+인)") */
  course: string;
  /** KGA 티 이름 (예: "WHITE") */
  tee: string;
  /** 그 티의 남/여 레이팅 */
  ratings: { sex: "M" | "F"; cr: number; slope: number; /** 기준 파 (예전 기록엔 없음 → 72) */ par?: number }[];
  /** KGA 계산기에서 자료를 모은 날짜 (예: "2026-10-20") */
  edition: string;
}

/** rounds.rules(jsonb)에 저장되는 값. 지불 방법·핸디 방식도 스키마 변경 없이 함께 저장한다. */
export interface StoredRules extends BetRules {
  /**
   * 홀마다 저장하는 방식 (supabase/holesave.sql). 저장된 홀만 정산하고, 저장된 홀은 '수정'으로만 고친다.
   * 값이 없는 예전 내기 라운드도 진행 중이면 이 방식으로 보고, 이미 종료된 것은 모든 홀을 저장된 것으로 본다
   */
  holeSave?: boolean;
  /** KGA 코스레이팅 (골프장을 목록에서 골랐을 때만) */
  rating?: CourseRating;
  /** 같은 코스의 티 박스별 레이팅 (사람마다 티가 다를 때 그 사람 보정타수에 쓴다). 예전 라운드엔 없음 */
  teeRatings?: Partial<Record<TeeBox, CourseRating>>;
  /** 값이 없는 예전 라운드는 타당 */
  gameMode?: GameMode;
  /** 몇 인 플레이인지 (2~5, 라운드 만들 때 고른다. 등수별 금액 칸 수). 예전 라운드엔 없음 → 참여 인원 */
  playerCount?: number;
  payment?: PaymentMethod;
  handicapMode?: HandicapMode;
  /** 최저핸디 대비 방식에서 방장이 정한 기준 인원(user_uid). 이 사람의 핸디는 0 */
  baseUid?: string;
  /** 게임 시작 후 방장이 고친 핸디캡 (user_uid → 핸디). 참여자 행의 값보다 우선 */
  hcOverrides?: Record<string, number>;
  /** 게임 시작 후 방장이 고친 평균 타수 (user_uid → 평균, 빈칸이면 null) */
  avgOverrides?: Record<string, number | null>;
  /** 타수 보정 방식에서 방장이 정한 잡아주는 타수 (user_uid → 0·1·2) */
  strokeAdj?: Record<string, number>;
  /** 방장이 고친 참여자 이름 (user_uid → 이름). 참여자 행의 이름보다 우선 */
  nameOverrides?: Record<string, string>;
  /** 스코어 수정 내역: 저장된 홀을 고친 것, 종료 후 방장이 고친 것 (모든 참여자에게 공개) */
  editLog?: EditLogEntry[];
}

/** '수정 완료' 한 번에 바뀐 항목들. items 는 "1번 홀 박영수: 5타(+1) → 4타(E)" 같은 문장 */
export interface EditLogEntry {
  at: string;
  by: string;
  items: string[];
}

export interface GameConfig {
  courseName: string;
  /** 티 박스. 예전 라운드는 빈 값 */
  courseTee: string;
  date: string;
  teeTime: string;
  /** 타당 금액 (원) */
  unit: number;
  players: Player[];
  gameMode: GameMode;
  payment: PaymentMethod;
  handicapMode: HandicapMode;
  /** 최저핸디 대비 방식의 기준 인원 (현재 참여자 중 한 명일 때만) */
  baseUid: string | null;
  /** 핸디캡 정산 시점 */
  handicapSettle: SettleTiming;
  rules: BetRules;
  editLog: EditLogEntry[];
  /** KGA 코스레이팅 (골프장을 목록에서 고른 라운드만) */
  rating: CourseRating | null;
  /** 티 박스별 레이팅 (사람마다 티가 다를 때) */
  teeRatings: Partial<Record<TeeBox, CourseRating>>;
}

export type ParValue = 3 | 4 | 5;

export interface HoleScore {
  par: ParValue;
  /** playerId -> 파 대비 타수 (-2 ~ +5). null 이면 미입력 */
  scores: Record<string, number | null>;
  /**
   * 홀 저장 방식 라운드에서 저장 안 된 홀이면 false (정산에서 빠진다).
   * 값이 없으면 저장된 것으로 본다 (예전 라운드·기록 모드·정산 계산용으로 만든 홀)
   */
  saved?: boolean;
  /** 마지막으로 저장·수정한 사람 (user_uid)·때 */
  savedBy?: string | null;
  savedAt?: string | null;
  /** 저장·수정할 때마다 1씩 오른다. 처음 저장 전이면 0 */
  version?: number;
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
  round_players: { user_uid: string; name: string; seat_order: number }[];
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
  /** 폰 없는 동반자 (방장이 이름만으로 넣음, supabase/lobby.sql). 스코어는 다른 사람이 대신 입력 */
  offline_player?: boolean;
  bank_name: string | null;
  bank_account: string | null;
  /** 이 사람 티 박스 (supabase/lobby.sql). 비어 있으면 라운드 티. 칸이 없는 DB 에서는 없음 */
  tee?: TeeBox | null;
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
  /** 기록 모드 홀별 상세 기록: [홀][playerId]. 기록이 없으면 그 칸이 없다 */
  holeStats: Record<string, HoleStat>[];
  /** 기록 모드: 홀별 상세 기록 저장 (본인 것만) */
  setStat: (holeIndex: number, playerId: string, stat: HoleStat) => void;
  /** 홀마다 저장하는 방식(내기 라운드)인지 */
  holeSave: boolean;
  /**
   * 홀 저장·수정: 파와 모든 참여자 스코어를 확정한다. 저장된 홀을 고칠 때는 수정 내역 문장(items)을 남긴다.
   * 라운드 중엔 누구나, 종료 후엔 방장만
   */
  saveHole: (
    holeIndex: number,
    par: ParValue,
    scores: Record<string, number>,
    items: string[],
    /** 보던 홀의 version (수정은 시작할 때 값). 없으면 지금 값 */
    baseVersion?: number
  ) => void;
  /** 서버에 아직 올라가지 않은 홀 저장이 있는 홀 */
  pendingHoles: ReadonlySet<number>;
  status: RoundStatus;
  isHost: boolean;
  /** 통신이 끊겨 아직 서버에 저장되지 못한 스코어·파 수 (기기에 보관 중) */
  pendingSaves?: number;
  /** 알림 한 줄 (예: 박영수님이 먼저 저장했어요). 닫으면 null */
  notice: string | null;
  setNotice: (text: string | null) => void;
}
