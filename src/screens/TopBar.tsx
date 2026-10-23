import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth";
import { useBack } from "../back";
import { Icon, Wordmark } from "../icons";
import { NOTICE_STALE_MS, markNoticesSeen, openNoticePage, refreshMyRounds, useNotices } from "../notices";
import { checkGoalNotices } from "../goals";
import { useRound } from "../round";
import { useUnfolded } from "../rail";
import { LogoHead } from "./PaneHead";

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
  // 펼친 iPhone Duo: 위 바 대신 맨 위 로고 머리(두 칸 화면은 왼쪽 칸이 따로 그려서 숨긴다),
  // 양옆 버튼은 오른쪽 막대의 와이파이 아래에 세로로
  const unfolded = useUnfolded();
  if (unfolded)
    return (
      <>
        <LogoHead className="page-logo" />
        <div className={`rail-actions ${locked ? "locked" : ""}`}>
          {left}
          {right}
        </div>
      </>
    );
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
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const { openRound } = useRound();
  const { items, seen, unseen } = useNotices(uid);
  const [open, setOpen] = useState(false);
  /** 창을 열 때 처음 본 알림 (열어 둔 동안 강조) */
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useBack(open, () => setOpen(false));

  // 처음 그릴 때·앱으로 돌아올 때 목록이 오래됐으면 다시 받는다 (시즌 목표는 가끔 확인)
  const goalKey = JSON.stringify(user?.goal ?? null);
  useEffect(() => {
    if (!uid) return;
    const pull = () => {
      void refreshMyRounds(uid, NOTICE_STALE_MS).catch((e) => console.warn("알림 목록을 받지 못함", e));
      void checkGoalNotices(uid, user?.goal);
    };
    pull();
    const onVisible = () => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [uid, goalKey]);

  const toggle = () => {
    if (!open) {
      setFresh(new Set(items.filter((i) => !seen.has(i.id)).map((i) => i.id)));
      markNoticesSeen(uid, items);
      void refreshMyRounds(uid, NOTICE_STALE_MS).catch(() => {});
    }
    setOpen((v) => !v);
  };
  // 열어 둔 동안 새로 생긴 알림도 본 것으로
  const key = items.map((i) => i.id).join(",");
  useEffect(() => {
    if (open) markNoticesSeen(uid, items);
  }, [open, key]);

  return (
    <>
      <button
        className="icon-btn notice-btn"
        aria-label={unseen ? "알림, 새 알림 있음" : "알림"}
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="bell" size={25} />
        {unseen && <span className="notice-dot" />}
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
              {items.length === 0 ? (
                <div className="empty-note">새 알림이 없어요.</div>
              ) : (
                <div className="notice-list">
                  {items.map((i) => (
                    <button
                      key={i.id}
                      className={`notice-item ${fresh.has(i.id) ? "new" : ""}`}
                      onClick={() => {
                        setOpen(false);
                        if (i.roundId) openRound(i.roundId);
                        else if (i.page) openNoticePage(i.page);
                      }}
                    >
                      <span className={`ni-ic ${i.kind}`}>
                        <Icon name={i.kind === "goal" ? "target" : "flag"} size={18} />
                      </span>
                      <span className="ni-tx">
                        <b>{i.title}</b>
                        <span>{i.sub}</span>
                        {i.hint && <em>{i.hint}</em>}
                      </span>
                      <Icon name="chevronRight" size={16} className="ni-go" />
                    </button>
                  ))}
                </div>
              )}
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
