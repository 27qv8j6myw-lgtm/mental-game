import { useEffect, useRef, type CSSProperties } from "react";
import type { SkinHole } from "../betting";
import type { Player } from "../types";
import { won } from "../util";
import { Avatar, Icon } from "../icons";

/** 걸린 스킨이 많을수록 판돈 카드가 뜨거워진다 (1 · 2~3 · 4~7 · 8+) */
const heat = (stake: number) => (stake >= 8 ? 4 : stake >= 4 ? 3 : stake >= 2 ? 2 : 1);

const SPARKS = Array.from({ length: 10 }, (_, i) => i * 36);

/**
 * 진행 화면(스킨스): 이번 홀 판돈 카드.
 * 판정 전에는 걸린 스킨과 금액, 승부가 나면 승자와 획득 금액을 크게 보여준다.
 */
export function SkinPot({
  hole,
  next,
  unit,
  players,
  isLast,
  birdieOn,
}: {
  hole: SkinHole;
  /** 다음 홀 (이월 시 다음 홀에 걸리는 스킨을 보여준다) */
  next: SkinHole | null;
  unit: number;
  players: Player[];
  isLast: boolean;
  birdieOn: boolean;
}) {
  const n = players.length;
  const winners = hole.winnerIds
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  const chips = hole.reasons.length > 0 && (
    <div className="sp-chips">
      {hole.reasons.map((r) => (
        <span className="sp-chip" key={r}>
          {r}
        </span>
      ))}
    </div>
  );

  if (hole.status === "won" || hole.status === "split") {
    const split = hole.status === "split";
    return (
      <div className={`skin-pot ${split ? "split" : "won"}`}>
        <div className="sp-sparks" aria-hidden>
          {SPARKS.map((a) => (
            <span key={a} style={{ "--a": `${a}deg` } as CSSProperties} />
          ))}
        </div>
        <div className="sp-label">{split ? "마지막 홀 최저 동타 · 나눠 가져요" : "스킨 획득!"}</div>
        <div className="sp-winners">
          {winners.map((w) => (
            <span className="sp-winner" key={w.id}>
              <Avatar photoUrl={w.photoUrl} gender={w.gender} size={30} />
              <b>{w.name || "?"}</b>
            </span>
          ))}
        </div>
        <div className="sp-main">
          <b>{hole.skins}</b>
          <span>스킨</span>
        </div>
        <div className="sp-money big">
          {split ? "각 " : ""}+{won(hole.amount)}
        </div>
        {chips}
      </div>
    );
  }

  if (hole.status === "carried") {
    // 마지막 홀의 carried 는 전원 동타 → 남은 스킨 소멸
    if (isLast || !next)
      return (
        <div className="skin-pot void">
          <div className="sp-label">전원 동타</div>
          <div className="sp-main">
            <b>{hole.stake}</b>
            <span>스킨</span>
          </div>
          <div className="sp-money">남은 스킨은 주인 없이 사라져요</div>
        </div>
      );
    return (
      <div className="skin-pot carried">
        <div className="sp-label">최저 동타 · 다음 홀로 이월</div>
        <div className="sp-carry">
          <span className="sp-from">{hole.stake}</span>
          <Icon name="chevronRight" size={22} />
          <span className="sp-to">
            <b>{next.stake}</b>
            <small>스킨</small>
          </span>
        </div>
        <div className="sp-money">다음 홀 1명당 {won(next.stake * unit)}</div>
      </div>
    );
  }

  // 판정 전: 이번 홀에 걸린 판돈
  const lv = heat(hole.stake);
  return (
    <div className={`skin-pot heat-${lv}`}>
      <div className="sp-label">이번 홀 판돈</div>
      <div className="sp-main">
        <b>{hole.stake}</b>
        <span>스킨</span>
      </div>
      <div className="sp-money">
        1명당 {won(hole.stake * unit)} · 총 {won(hole.stake * unit * (n - 1))}
      </div>
      {chips}
      {hole.carryCount >= 2 && (
        <div className="sp-streak">
          <Icon name="spark" size={14} /> {hole.carryCount}홀 연속 이월!
        </div>
      )}
      {birdieOn && <div className="sp-tip">버디로 이기면 ×2 · 이글 이상 ×3</div>}
    </div>
  );
}

/** 홀별 스킨 흐름: 누가 가져갔는지(이니셜), 이월(→), 나눔(÷)을 한 줄로 보여주고 누르면 그 홀로 이동 */
export function SkinStrip({
  holes,
  current,
  players,
  onPick,
}: {
  holes: SkinHole[];
  current: number;
  players: Player[];
  onPick: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 현재 홀 칩이 가운데 오도록 가로로만 스크롤
  useEffect(() => {
    const box = ref.current;
    const chip = box?.children[current] as HTMLElement | undefined;
    if (!box || !chip) return;
    box.scrollTo({
      left: chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2,
      behavior: "smooth",
    });
  }, [current]);

  const initial = (id: string) => (players.find((p) => p.id === id)?.name || "?").trim().charAt(0);

  return (
    <div className="skin-strip" ref={ref}>
      {holes.map((h, i) => (
        <button
          key={i}
          className={`ss-chip ${h.status} ${i === current ? "cur" : ""}`}
          onClick={() => onPick(i)}
          aria-label={`${i + 1}번 홀`}
        >
          <small>{i + 1}</small>
          <b>
            {h.status === "won"
              ? initial(h.winnerIds[0])
              : h.status === "carried"
              ? "→"
              : h.status === "split"
              ? "÷"
              : ""}
          </b>
        </button>
      ))}
    </div>
  );
}
