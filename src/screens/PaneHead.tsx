import type { ReactNode } from "react";
import { Icon, Wordmark } from "../icons";

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

/** 펼친 화면의 왼쪽(한 칸 화면은 맨 위) 머리: 위 바 대신 mental game 글자 로고 */
export function LogoHead({ onBack, className = "" }: { onBack?: () => void; className?: string }) {
  return <PaneHead className={`logo-head ${className}`} title={<Wordmark height={25} />} onBack={onBack} />;
}
