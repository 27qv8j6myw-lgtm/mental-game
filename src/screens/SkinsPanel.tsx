import { useEffect, useRef, type CSSProperties } from "react";
import type { SkinHole } from "../betting";
import type { Player } from "../types";
import { won } from "../util";
import { Avatar } from "../icons";

/** 걸린 스킨이 많을수록 판돈 카드가 뜨거워진다 (1 · 2~3 · 4~7 · 8+) */
const heat = (stake: number) => (stake >= 8 ? 4 : stake >= 4 ? 3 : stake >= 2 ? 2 : 1);

const SPARKS = Array.from({ length: 10 }, (_, i) => i * 36);

/**
 * 진행 화면(스킨스): 이번 홀 판돈.
 * 판정 전·이월·소멸은 배판 표시처럼 한 줄 띠로 작게, 승부가 나면 승자와 획득 금액을 크게 보여준다.
 */
export function SkinPot({
  hole,
  next,
  unit,
  players,
  isLast,
  countOnly = false,
}: {
  hole: SkinHole;
  /** 다음 홀 (이월 시 다음 홀에 걸리는 스킨을 보여준다) */
  next: SkinHole | null;
  unit: number;
  players: Player[];
  isLast: boolean;
  /** 등수 내기(스킨스 방식): 금액 없이 스킨 개수만 */
  countOnly?: boolean;
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
  /** 판돈 띠: 왼쪽 큰 동그라미 안 스킨 수, 오른쪽은 칸(작은 이름 + 큰 값)을 나란히 띠 폭 가득. 아래 줄은 배수 사유 */
  const banner = (cls: string, count: number, cells: [string, string][], sub?: string) => (
    <div className={`skin-banner ${cls}`}>
      <div className="sb-count">
        <b>{count}</b>
        <small>스킨</small>
      </div>
      <div className="sb-body">
        <div className="sb-cells">
          {cells.map(([label, value]) => (
            <div className="sb-cell" key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </div>
          ))}
        </div>
        {sub && <div className="sb-sub">{sub}</div>}
      </div>
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
        {!countOnly && (
          <div className="sp-money big">
            {split ? "각 " : ""}+{won(hole.amount)}
          </div>
        )}
        {chips}
      </div>
    );
  }

  if (hole.status === "carried") {
    // 마지막 홀의 carried 는 전원 동타 → 남은 스킨 소멸
    if (isLast || !next)
      return banner("void", hole.stake, [["전원 동타", "남은 스킨 소멸"]], "마지막 홀이라 주인 없이 사라져요");
    return banner(
      "carry",
      next.stake,
      countOnly
        ? [["최저 동타", "다음 홀로 이월"]]
        : [
            ["최저 동타", "다음 홀로 이월"],
            ["다음 홀 1명당", won(next.stake * unit)],
          ]
    );
  }

  // 판정 전: 이번 홀에 걸린 판돈 (걸린 스킨이 많을수록 띠가 뜨거워진다).
  // 아래 줄은 이미 붙은 배수만 (이월·후반·상한). 버디·이글 배수는 실제로 나오면 획득 카드에 사유로 뜬다
  const extra = [...(hole.carryCount >= 2 ? [`${hole.carryCount}홀 연속 이월`] : []), ...hole.reasons].join(" · ");
  return banner(
    `heat-${heat(hole.stake)}`,
    hole.stake,
    countOnly
      ? [["단독 최저 타수가", "스킨을 가져가요"]]
      : [
          ["1명당", won(hole.stake * unit)],
          ["총", won(hole.stake * unit * (n - 1))],
        ],
    extra || undefined
  );
}

/** 홀별 스킨 흐름: 누가 가져갔는지(이름 3글자), 이월(→), 나눔(÷)을 한 줄로 보여주고 누르면 그 홀로 이동 */
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

  /** 칸 안에 들어갈 만큼: 이름 앞 3글자 */
  const short = (id: string) => (players.find((p) => p.id === id)?.name || "?").trim().slice(0, 3);

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
              ? short(h.winnerIds[0])
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
