import type { ReactNode } from "react";

/**
 * 라운드 화면 아래 줄의 오른쪽 두 동그라미: 보조(취소·수정) · 주 버튼(저장·확정·다음·정산).
 * 왼쪽 두 동그라미(홈 · 방장의 빨간 종료)는 App 이 늘 같은 자리에 둔다. 네 동그라미는 크기가 같고 같은 간격.
 * 버튼이 없는 자리도 비워 둬서, 상태가 바뀌어도 버튼 자리가 움직이지 않는다
 */
export default function PlayBar({
  secondary,
  action,
  unsaved,
}: {
  /** 주 버튼 왼쪽 (취소·수정) */
  secondary?: ReactNode;
  /** 오른쪽 끝 주 버튼 (DockButton) */
  action?: ReactNode;
  /** 저장 안 한 수정·내 기록이 있으면 (앱 자동 새로고침을 미룬다, update.ts) */
  unsaved?: boolean;
}) {
  return (
    <div className="play-bar" data-unsaved={unsaved || undefined}>
      {secondary ?? <span className="dock-slot" aria-hidden="true" />}
      {action ?? <span className="dock-slot" aria-hidden="true" />}
    </div>
  );
}

/**
 * 아래 줄 동그라미 버튼. tone: primary(파랑, 저장·확정·다음·정산) · danger(빨강, 종료) · plain(유리, 취소·수정)
 */
export function DockButton({
  label,
  onClick,
  disabled,
  tone = "primary",
  className = "",
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger" | "plain";
  className?: string;
}) {
  return (
    <button className={`dock-btn ${tone} ${className}`} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}
