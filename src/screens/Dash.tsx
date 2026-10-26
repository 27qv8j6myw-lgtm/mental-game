import type { ReactNode } from "react";

/**
 * 펼친 iPhone Duo 대시보드: 맨 위 작은 제목 줄(두꺼운 머리 없이), 아래 왼쪽 좁은 줄(요약) · 오른쪽 넓은 줄(목록·상세).
 * 접히는 곳 기준으로 반을 나누지 않고 한 화면으로 스크롤한다. 오른쪽 막대(시계·탭)는 따로
 */
export default function Dash({
  title,
  sub,
  actions,
  side,
  children,
  className = "",
}: {
  title: ReactNode;
  sub?: ReactNode;
  /** 제목 줄 오른쪽 버튼 (랭킹 관리 등) */
  actions?: ReactNode;
  /** 왼쪽 좁은 줄 */
  side: ReactNode;
  /** 오른쪽 넓은 줄 */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`sheet dash ${className}`}>
      <div className="dash-head">
        <h2 className="dash-title">{title}</h2>
        {sub && <span className="dash-sub">{sub}</span>}
        {actions && <div className="dash-actions">{actions}</div>}
      </div>
      <div className="dash-grid">
        <div className="dash-col dash-side">{side}</div>
        <div className="dash-col dash-main">{children}</div>
      </div>
    </div>
  );
}
