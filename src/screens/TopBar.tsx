import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../back";
import { Icon, Wordmark } from "../icons";

/**
 * 모든 화면의 상단 바: 가운데 mental game 글자 로고 (인스타그램처럼).
 * 왼쪽은 홈에서 + (새 라운드), 다른 화면에서는 뒤로가기. 오른쪽은 화면마다 (알림·랭킹 관리 등).
 * 화면 제목은 상단 바가 아니라 본문 맨 위(.page-title)에 둔다
 */
export default function TopBar({
  left,
  right,
  locked = false,
  className = "",
}: {
  left?: ReactNode;
  right?: ReactNode;
  /** 홀 수정·내 기록 초안 중: 버튼을 그 자리에 두고 잠근다 */
  locked?: boolean;
  className?: string;
}) {
  return (
    <div className={`topbar app-top ${className}`}>
      <div className={`tb-side tb-left ${locked ? "locked" : ""}`}>{left}</div>
      <h1 className="tb-logo">
        <Wordmark height={25} />
      </h1>
      <div className={`tb-side tb-right ${locked ? "locked" : ""}`}>{right}</div>
    </div>
  );
}

/** 상단 바 오른쪽 알림 (라운드 진행 화면만 빼고 모든 탭에). 누르면 오른쪽 위로 열린다 */
export function NoticeButton() {
  const [open, setOpen] = useState(false);
  useBack(open, () => setOpen(false));
  return (
    <>
      <button
        className="icon-btn"
        aria-label="알림"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={25} />
      </button>
      {/* 상단 바의 흐림 효과 안에서는 화면 전체를 덮지 못해서 body 에 띄운다 */}
      {open &&
        createPortal(
          <>
            <div className="menu-scrim" onClick={() => setOpen(false)} />
            <div className="menu notice-menu" role="dialog" aria-label="알림">
              <div className="menu-head">
                <div className="mn">알림</div>
              </div>
              <div className="empty-note">새 알림이 없어요.</div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

/** 상단 바 왼쪽 뒤로가기 (예전 X 닫기 자리) */
export function BackButton({ onClick, label = "뒤로", disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button className="icon-btn tb-back" aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon name="chevronLeft" size={28} />
    </button>
  );
}
