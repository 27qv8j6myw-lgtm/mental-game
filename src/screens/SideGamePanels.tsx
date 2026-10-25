import type { CaddieHole, CaddieResult } from "../caddie";
import type { RankResult } from "../rankGame";
import { rankScoreText } from "../rankGame";
import type { Player } from "../types";
import { won } from "../util";
import { Avatar, Icon } from "../icons";

/**
 * 진행 화면(캐디피 내기): 이번 홀 카드.
 * 연습 홀 / 판정 전(꼴찌가 낼 돈) / 꼴찌가 냄 / 공동 꼴찌라 넘김, 아래에 모은 캐디피
 */
export function CaddieCard({
  hole,
  result,
  players,
  isLast,
}: {
  hole: CaddieHole;
  result: CaddieResult;
  players: Player[];
  isLast: boolean;
}) {
  const who = (id: string) => players.find((p) => p.id === id);
  const progress = (
    <div className="cd-progress">
      모은 캐디피 <b>{won(result.collected)}</b> / {won(result.target)}
      {result.carried > 0 && ` · 넘어온 ${won(result.carried)}`}
    </div>
  );

  if (hole.practice)
    return (
      <div className="cd-card practice">
        <div className="cd-label">연습 홀</div>
        <div className="cd-main">돈을 내지 않아요</div>
        <div className="cd-sub">{result.practice + 1}번 홀부터 꼴찌가 1만원씩 내요</div>
      </div>
    );

  if (hole.status === "paid") {
    const p = who(hole.payerId!);
    return (
      <div className="cd-card paid">
        <div className="cd-label">이 홀 꼴찌</div>
        <div className="cd-who">
          <Avatar photoUrl={p?.photoUrl} size={30} />
          <b>{p?.name || "?"}</b>
        </div>
        <div className="cd-money">캐디피 {won(hole.stake)}</div>
        {progress}
      </div>
    );
  }

  if (hole.status === "carried")
    return (
      <div className="cd-card carried">
        <div className="cd-label">공동 꼴찌 · 다음 홀로 넘어가요</div>
        <div className="cd-who">
          {hole.tiedIds.map((id) => {
            const p = who(id);
            return (
              <span className="cd-tied" key={id}>
                <Avatar photoUrl={p?.photoUrl} size={24} />
                {p?.name || "?"}
              </span>
            );
          })}
        </div>
        <div className="cd-sub">
          {isLast
            ? `마지막 홀이라 ${won(hole.stake)}은 끝나면 모두 나눠 내요`
            : `다음 홀 꼴찌가 ${won(hole.stake + result.perHole)}을 내요`}
        </div>
        {progress}
      </div>
    );

  return (
    <div className={`cd-card pending ${hole.carryCount > 0 ? "hot" : ""}`}>
      <div className="cd-label">이번 홀 꼴찌가 내요</div>
      <div className="cd-main big">{won(hole.stake)}</div>
      <div className="cd-sub">
        {hole.carryCount > 0
          ? `앞에서 ${hole.carryCount}홀 넘어왔어요`
          : "공동 꼴찌면 다음 홀로 넘어가요"}
      </div>
      {progress}
    </div>
  );
}

/** 진행 화면(등수 내기): 지금까지 저장된 홀로 매긴 순위. 시상대처럼 1위부터 가로로 한 칸씩 (사람 수만큼 같은 간격) */
export function RankBoard({ result, players, myUid }: { result: RankResult; players: Player[]; myUid: string }) {
  return (
    <div
      className="rank-board"
      style={{ gridTemplateColumns: `repeat(${result.order.length}, minmax(0, 1fr))` }}
      aria-label="현재 순위"
    >
      {result.order.map((row) => {
        const p = players.find((x) => x.id === row.id);
        return (
          <div className={`rb-cell m${row.rank} ${row.id === myUid ? "me" : ""}`} key={row.id}>
            <span className="rb-medal">{row.rank}</span>
            <b className="rb-name">{p?.name || "?"}</b>
            <em className="rb-score">{rankScoreText(result.rules.method, row.score)}</em>
          </div>
        );
      })}
    </div>
  );
}

/** 캐디피로 낸 돈 한 줄: "B → 캐디피 10,000원" */
export function CaddiePayRow({ player, amount, note }: { player?: Player; amount: number; note?: string }) {
  return (
    <div className="transfer caddie-pay">
      <span className="from">
        <Avatar photoUrl={player?.photoUrl} size={22} />
        {player?.name || "?"}
      </span>
      <span className="arrow">
        <Icon name="chevronRight" size={16} />
      </span>
      <span className="to">캐디피{note && <small> {note}</small>}</span>
      <span className="amt">{won(amount)}</span>
    </div>
  );
}
