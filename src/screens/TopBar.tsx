import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth";
import { useBack } from "../back";
import { Icon, Wordmark } from "../icons";
import { NOTICE_STALE_MS, markNoticesSeen, openNoticePage, refreshMyRounds, useNotices } from "../notices";
import { checkGoalNotices } from "../goals";
import { loadBadges } from "../badges";
import { useRound } from "../round";
import { useSideRail, useUnfolded } from "../rail";

/**
 * 모든 화면의 상단 바: 가운데 mental game 글자 로고 (인스타그램처럼).
 * 왼쪽은 홈에서 + (새 라운드), 다른 화면에서는 뒤로가기. 오른쪽은 화면마다 (알림·랭킹 관리 등).
 * 화면 제목은 상단 바가 아니라 본문 맨 위(.page-title)에 둔다
 *
 * 옆에 상태 막대가 있는 폰(iPhone Duo): 버튼(rail · right)은 오른쪽 막대의 시계·와이파이 아래 유리 캡슐에 세로로.
 * 접힌 화면은 인스타그램 듀오처럼 로고를 왼쪽 줄에 (뒤로가기가 있으면 그 옆).
 * 펼친 화면은 위 줄 없이 화면이 대시보드 제목(Dash)부터 시작하고, 뒤로가기도 캡슐 맨 위에
 */
export default function TopBar({
  left,
  right,
  rail,
  tab = false,
  locked = false,
  className = "",
}: {
  left?: ReactNode;
  right?: ReactNode;
  /** 막대 캡슐에서 right 위에 둘 버튼 (홈의 + 등). 막대가 없는 폰은 left·right 만 쓴다 */
  rail?: ReactNode;
  /** 아래 탭으로 오가는 화면: 막대가 있는 폰은 탭이 막대에 있어 왼쪽 뒤로가기를 그리지 않는다 */
  tab?: boolean;
  /** 홀 수정·내 기록 초안 중: 버튼을 그 자리에 두고 잠근다 */
  locked?: boolean;
  className?: string;
}) {
  const sideRail = useSideRail();
  const unfolded = useUnfolded();
  if (sideRail) {
    const back = !tab && left;
    const inRail = unfolded && back;
    return (
      <>
        {!unfolded && (
          <div className={`rail-title ${className}`}>
            {back && <div className={`tb-side ${locked ? "locked" : ""}`}>{back}</div>}
            <h1 className="tb-logo">
              <Wordmark height={26} />
            </h1>
          </div>
        )}
        {(inRail || rail || right) && (
          <div className={`rail-actions ${locked ? "locked" : ""}`}>
            {inRail}
            {rail}
            {right}
          </div>
        )}
      </>
    );
  }
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
      // 새 배지는 끝낸 라운드가 바뀌었을 때만 다시 센다 (badges.ts)
      void refreshMyRounds(uid, NOTICE_STALE_MS)
        .then((list) => loadBadges(uid, list, user?.goal))
        .catch((e) => console.warn("알림 목록을 받지 못함", e));
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
                        else if (i.href) window.location.assign(i.href);
                      }}
                    >
                      <span className={`ni-ic ${i.kind}`}>
                        <Icon
                          name={i.kind === "goal" ? "target" : i.kind === "badge" ? "medal" : i.kind === "policy" ? "shield" : "flag"}
                          size={18}
                        />
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
