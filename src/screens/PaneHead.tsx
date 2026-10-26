import type { ReactNode } from "react";
import { Icon } from "../icons";

/**
 * 펼친 iPhone Duo 두 칸 화면의 칸 머리: 라운드 진행의 홀 번호 머리와 같은 높이로 칸 맨 위에 고정 (index.css .split-view).
 * 가운데 제목·한 줄 설명(또는 토글), 왼쪽 뒤로 · 오른쪽 버튼
 */
export default function PaneHead({
  title,
  sub,
  onBack,
  right,
  className = "",
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  /** 칸 안에서 한 단계 들어갔을 때 (사람 상세 → 목록 등) */
  onBack?: () => void;
  right?: ReactNode;
  className?: string;
  /** 설명 대신 넣을 것 (관리자 본인/사용자 토글 등) */
  children?: ReactNode;
}) {
  return (
    <div className={`pane-head ${className}`}>
      <div className="ph-left">
        {onBack && (
          <button className="navbtn" aria-label="뒤로" onClick={onBack}>
            <Icon name="chevronLeft" size={22} />
          </button>
        )}
      </div>
      <div className="ph-center">
        <div className="ph-title">{title}</div>
        {sub && <div className="ph-sub">{sub}</div>}
        {children}
      </div>
      <div className="ph-right">{right}</div>
    </div>
  );
}

/**
 * 펼친 화면 칸·넓은 줄 맨 위: 두꺼운 로고 머리 대신, 뒤로 갈 곳이 있을 때만 작은 뒤로 버튼 (로고는 접힌 화면 위 줄에만)
 */
export function LogoHead({ onBack, label = "뒤로" }: { onBack?: () => void; label?: string }) {
  if (!onBack) return null;
  return (
    <button className="dash-back" onClick={onBack}>
      <Icon name="chevronLeft" size={20} />
      {label}
    </button>
  );
}
