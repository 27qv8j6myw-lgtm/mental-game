import type { ReactNode } from "react";

/**
 * 라운드 진행 화면 아래 줄: 가운데는 떠 있는 유리 바에 글자(안내·글자 버튼), 오른쪽은 홈 동그라미와 같은 크기의 주 버튼.
 * 왼쪽 홈 동그라미(라운드 목록으로)는 App 이 늘 같은 자리에 둔다. 가운데 글자가 없으면 유리 바도 숨긴다
 */
export default function PlayBar({
  children,
  action,
  unsaved,
}: {
  children?: ReactNode;
  /** 오른쪽 동그라미 (DockButton) */
  action?: ReactNode;
  /** 저장 안 한 수정·내 기록이 있으면 (앱 자동 새로고침을 미룬다, update.ts) */
  unsaved?: boolean;
}) {
  return (
    <div className="play-bar" data-unsaved={unsaved || undefined}>
      <div className="pb-text">{children}</div>
      {action}
    </div>
  );
}

/** 아래 줄 오른쪽 동그라미 주 버튼: 저장 · 확정 · 다음 · 정산 · 종료 */
export function DockButton({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button className="dock-btn" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}
