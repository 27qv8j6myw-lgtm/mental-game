import { useMemo, useState, type ReactNode } from "react";
import { AWARD_COLOR, computeAwards, type AwardKey } from "../awards";
import { Avatar, Icon } from "../icons";
import type { HoleScore, HoleStat, Player } from "../types";
import { CARD_ICONS, CollectCard, cardSvg } from "./CollectCard";

const AWARD_ICON: Record<AwardKey, ReactNode> = {
  birdie: CARD_ICONS.birdie,
  putt: CARD_ICONS.putts,
  // 방패 (큰 실수 없이)
  steady: cardSvg(
    <>
      <path d="M12 3.5l7 2.8v5.2c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6.3l7-2.8Z" />
      <path d="m8.8 12.2 2.3 2.3 4.3-4.6" />
    </>
  ),
  // 올라가는 화살표 (후반에 좋아짐)
  comeback: cardSvg(
    <>
      <path d="M4 18 10 12l3.5 3.5L20 9" />
      <path d="M15 9h5v5" />
    </>
  ),
  parRun: CARD_ICONS.streak,
  finish: CARD_ICONS.gir,
};

/**
 * 정산 결과의 '시상식': 버튼을 누르면 바로 아래로 상 카드가 펼쳐진다 (하이라이트 카드 모양).
 * 두 명 이상이고 줄 상이 하나라도 있을 때만 보인다
 */
export default function RoundAwards({
  players,
  holes,
  stats,
  midway = false,
}: {
  players: Player[];
  holes: HoleScore[];
  stats: Record<string, HoleStat>[];
  /** 라운드 중(중간 정산) */
  midway?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const awards = useMemo(() => computeAwards(players.map((p) => p.id), holes, stats), [players, holes, stats]);
  if (awards.length === 0) return null;
  const byId = new Map(players.map((p) => [p.id, p]));

  return (
    <>
      <button
        className={`btn-line wide aw-btn ${open ? "open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="trophy" size={17} />
        {midway ? "중간 시상식" : "시상식"}
        <Icon name="chevronRight" size={16} className="aw-chev" />
      </button>
      {open && (
        <div className="cc-grid aw-grid">
          {awards.map((a) => {
            const winners = a.winners.map((id) => byId.get(id)).filter((p): p is Player => !!p);
            return (
              <CollectCard
                key={a.key}
                color={AWARD_COLOR[a.key]}
                icon={AWARD_ICON[a.key]}
                title={a.title}
                value={a.reason}
                meta={a.detail}
              >
                <div className="aw-who">
                  <span className="aw-faces">
                    {winners.slice(0, 3).map((p) => (
                      <Avatar key={p.id} photoUrl={p.photoUrl} size={22} />
                    ))}
                  </span>
                  <span className="aw-names">{winners.map((p) => p.name || "?").join(" · ")}</span>
                </div>
              </CollectCard>
            );
          })}
        </div>
      )}
    </>
  );
}
