export type Gender = "male" | "female";

export interface Player {
  id: string;
  name: string;
  gender: Gender;
  /** 평균 타수 (72 기준). 핸디 = avgScore - 72 로 자동 산출 후 수동 조정 가능 */
  avgScore: number;
  handicap: number;
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
