import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useAuth } from "../auth";
import {
  BADGES,
  BADGE_GROUP_LABEL,
  loadBadges,
  markBadgesSeen,
  unseenBadges,
  type BadgeGroup,
  type BadgeIcon,
  type Earned,
} from "../badges";
import { NOTICE_STALE_MS, refreshMyRounds, useMyRounds } from "../notices";
import { dayLabel } from "../goals";
import { HL_ICONS, hlSvg } from "./Highlights";

const dotted = (d: string) => d.replace(/-/g, ".");
const GROUPS: BadgeGroup[] = ["rounds", "score", "hole", "record"];

/** 배지 머리 아이콘: 하이라이트 아이콘 + 배지에만 쓰는 것 */
function badgeIcon(icon: BadgeIcon, n?: number): ReactNode {
  switch (icon) {
    case "flag":
      return HL_ICONS.gir;
    case "down":
      return HL_ICONS.down;
    case "birdie":
      return HL_ICONS.birdie;
    case "eagle":
      return HL_ICONS.eagle;
    case "streak":
      return HL_ICONS.streak;
    case "putts":
      return HL_ICONS.putts;
    case "count":
      return hlSvg(
        <>
          <circle cx="12" cy="12" r="8.5" />
          <text x="12" y="15.6" textAnchor="middle" fontSize={n && n >= 100 ? 7.5 : 9.5} fontWeight="800" fill="currentColor" stroke="none">
            {n}
          </text>
        </>
      );
    case "calendar":
      return hlSvg(
        <>
          <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
          <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
          <path d="M8 14h2M14 14h2M8 17h2" />
        </>
      );
    case "shield":
      return hlSvg(
        <>
          <path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6.3l7-2.8Z" />
          <path d="m8.8 12.2 2.3 2.3 4.3-4.6" />
        </>
      );
    case "ace":
      return hlSvg(
        <>
          <ellipse cx="12" cy="17" rx="7" ry="2.5" />
          <circle cx="12" cy="9" r="3.2" />
          <path d="M12 12.2v3" />
        </>
      );
    case "green":
      return hlSvg(
        <>
          <ellipse cx="12" cy="17.5" rx="8" ry="2.6" />
          <path d="M12 17.5V4.5l6 2.6-6 2.6" />
        </>
      );
    case "goal":
      return hlSvg(
        <>
          <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
          <path d="M8 6H5a2.5 2.5 0 0 0 3 4M16 6h3a2.5 2.5 0 0 1-3 4" />
          <path d="M12 13v4M8.5 20h7" />
        </>
      );
  }
}

/** 내 정보 → 배지: 모은 배지 수와 묶음별 배지 (얻은 것은 색, 아직은 회색 + 얻는 방법) */
export default function Badges() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const list = useMyRounds(uid);
  const [earned, setEarned] = useState<Map<string, Earned> | null>(null);
  /** 이 화면을 열 때 처음 본 배지 ('새로' 표시) */
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const goalKey = JSON.stringify(user?.goal ?? null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    // 오래된 목록이면 다시 받고 계산한다 (끝낸 라운드가 그대로면 지난 계산을 쓴다)
    refreshMyRounds(uid, NOTICE_STALE_MS)
      .catch(() => list)
      .then((l) => loadBadges(uid, l.length ? l : undefined, user?.goal))
      .then((earned) => {
        if (!alive) return;
        setFresh(new Set(unseenBadges(uid, earned).map((b) => b.id)));
        setEarned(earned);
        markBadgesSeen(uid, earned);
      })
      .catch((e) => {
        console.error(e);
        if (alive) setErr("기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      alive = false;
    };
  }, [uid, goalKey]);

  if (err)
    return (
      <div className="card">
        <div className="empty-note">{err}</div>
      </div>
    );
  if (!earned)
    return (
      <div className="card">
        <div className="empty-note">배지를 세는 중…</div>
      </div>
    );

  // 가장 최근에 얻은 배지
  const latest = BADGES.filter((b) => earned.has(b.id)).sort((a, b) =>
    earned.get(b.id)!.date.localeCompare(earned.get(a.id)!.date)
  )[0];

  return (
    <>
      <div className="card bd-sum">
        <div className="bd-sum-top">
          <span className="bd-sum-label">모은 배지</span>
          <span className="bd-sum-n">
            <b>{earned.size}</b> / {BADGES.length}
          </span>
        </div>
        <div className="bd-bar">
          <span style={{ width: `${(earned.size / BADGES.length) * 100}%` }} />
        </div>
        <div className="bd-sum-sub">
          {latest
            ? `가장 최근: ${latest.title} · ${dayLabel(earned.get(latest.id)!.date)}`
            : "라운드를 끝내면 첫 배지가 생겨요."}
        </div>
      </div>

      {GROUPS.map((g) => {
        const defs = BADGES.filter((b) => b.group === g);
        return (
          <div key={g}>
            <div className="section-title">
              {BADGE_GROUP_LABEL[g]}
              <span className="bd-count">
                {defs.filter((b) => earned.has(b.id)).length}/{defs.length}
              </span>
            </div>
            <div className="hl-grid bd-grid">
              {defs.map((b) => {
                const e = earned.get(b.id);
                return (
                  <div
                    key={b.id}
                    className={`hl-card bd-card ${e ? "" : "off"}`}
                    style={{ "--hl": e ? b.color : "#c3c8cf" } as CSSProperties}
                  >
                    <div className="hl-badge">{badgeIcon(b.icon, b.n)}</div>
                    {fresh.has(b.id) && <span className="bd-new">새로</span>}
                    <div className="hl-date">{e ? dotted(e.date) : "아직"}</div>
                    <div className="hl-course">{e?.course || " "}</div>
                    <div className="hl-title">{b.title}</div>
                    {e ? <div className="hl-value">{e.value}</div> : <div className="bd-how">{b.how}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
