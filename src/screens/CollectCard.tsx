import type { CSSProperties, ReactNode } from "react";

/*
 * 모으는 카드 (랭킹 하이라이트 · 배지 · 시상식이 같이 쓴다).
 * 흰 카드 가운데 단색 동그라미에 흰 선 아이콘, 아래로 이름 · 굵은 값(그 색) · 날짜·골프장.
 * 아직 없는 것(off)은 회색 동그라미(배지는 자물쇠), 점선 테두리
 */

/** 카드 색 (동그라미·값) */
export const cardColor = (hex: string) => ({ "--cc": hex }) as CSSProperties;

const LOCK = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export function CollectCard({
  color,
  icon,
  title,
  value,
  meta,
  off = false,
  lock = off,
  tag,
  children,
}: {
  color: string;
  icon: ReactNode;
  title: ReactNode;
  /** 굵은 값 (없는 것이면 얻는 방법 등) */
  value: ReactNode;
  /** 날짜 · 골프장 같은 작은 줄 */
  meta?: ReactNode;
  off?: boolean;
  /** 자물쇠 (아직 못 얻은 배지). 기본은 off 와 같다 */
  lock?: boolean;
  /** 오른쪽 위 작은 표시 ("NEW") */
  tag?: string;
  /** 이름과 값 사이 (시상식: 받은 사람) */
  children?: ReactNode;
}) {
  return (
    <div className={`cc-card ${off ? "off" : ""}`} style={off ? undefined : cardColor(color)}>
      {tag && <span className="cc-tag">{tag}</span>}
      <div className="cc-emblem">
        {icon}
        {lock && <span className="cc-lock">{LOCK}</span>}
      </div>
      <div className="cc-title">{title}</div>
      {children}
      <div className="cc-value">{value}</div>
      {meta && <div className="cc-meta">{meta}</div>}
    </div>
  );
}

/* 엠블럼 아이콘 (흰 선) */
export const cardSvg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const CARD_ICONS = {
  // 연속 (연속 파·연속 버디·파 행진): ×2
  streak: cardSvg(
    <>
      <path d="M3.8 9.4l5.4 5.4M9.2 9.4l-5.4 5.4" />
      <path d="M12.4 9.3c.5-1.5 1.9-2.5 3.6-2.5 2.1 0 3.7 1.4 3.7 3.3 0 1.3-.7 2.3-1.9 3.4l-5.4 4.8h7.6" />
    </>
  ),
  // 버디: 나뭇가지에 앉은 작은 새 (눈 · 날개 · 부리 · 다리)
  birdie: cardSvg(
    <g transform="translate(12 12) scale(1.2) translate(-12.25 -14.2)" strokeWidth="1.75">
      <path d="M3.5 16.5 7.6 13.4C8.9 10.2 11.4 8 14.4 8c2.1 0 3.6 1.3 3.9 3l2.7.6-2.6 1C18 15.8 15.1 18 11.6 18c-2.3 0-4-.8-5.1-2.2Z" />
      <path d="M9.6 13.6c1.6-.9 3.4-1 5-.2" />
      <circle cx="15.7" cy="10.4" r=".7" fill="currentColor" stroke="none" />
      <path d="M11 18v2.5M13.5 17.8v2.7" />
    </g>
  ),
  // 동그라미 안 9
  nine: cardSvg(
    <>
      <circle cx="12" cy="12" r="8" />
      <text x="12" y="16.3" textAnchor="middle" fontSize="12" fontWeight="800" fill="currentColor" stroke="none">
        9
      </text>
    </>
  ),
  // 퍼터
  putts: cardSvg(
    <>
      <path d="M5 7.5 18 5.5l.6 2L6 9.5Z" />
      <path d="M12 8.5V19" />
    </>
  ),
  // 이글: 날개를 편 독수리 (머리·부리 · 깃털 날개 · 꼬리)
  eagle: cardSvg(
    <>
      <circle cx="12" cy="6.3" r="1.9" />
      <path d="M12 8.2v8" />
      <path d="M11.2 10.2C8.6 8.6 5.4 8 2.5 8.6c1.1 1 1.6 2.1 1.6 3.3 1.3 0 2.4.5 3.2 1.4.9-.5 2-.5 2.9 0l1-1.2" />
      <path d="M12.8 10.2c2.6-1.6 5.8-2.2 8.7-1.6-1.1 1-1.6 2.1-1.6 3.3-1.3 0-2.4.5-3.2 1.4-.9-.5-2-.5-2.9 0l-1-1.2" />
      <path d="M10.6 16.2 9.6 20h4.8l-1-3.8" />
      <path d="M13.4 5.8l1.4.9-1.4.4" />
    </>
  ),
  // 베스트 스코어: 1등 메달 (리본 + 1)
  medal: cardSvg(
    <>
      <path d="M7 2.8h3.4l2.3 5.6M17 2.8h-3.4l-1 2.4" />
      <circle cx="12" cy="15" r="5.8" />
      <path d="M10.8 13.3 12.4 12v6" />
    </>
  ),
  // 과녁
  fairway: cardSvg(
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </>
  ),
  // 깃발
  gir: cardSvg(
    <>
      <path d="M7 20V4" />
      <path d="M7 4h9l-2.5 3.5L16 11H7" />
    </>
  ),
  // 아래 화살표 (적을수록 좋음)
  down: cardSvg(
    <>
      <path d="M12 4v13" />
      <path d="m6.5 12 5.5 5.5 5.5-5.5" />
    </>
  ),
  // 되돌아 오기 (그린을 놓쳐도 파)
  scramble: cardSvg(
    <>
      <path d="M19 12a7 7 0 1 1-2-4.9" />
      <path d="M19 4v4h-4" />
    </>
  ),
  // 벙커 모래
  sand: cardSvg(
    <>
      <path d="M3 16c3-2 6-2 9 0s6 2 9 0" />
      <path d="M3 12c3-2 6-2 9 0s6 2 9 0" />
      <circle cx="12" cy="6" r="2" />
    </>
  ),
};

