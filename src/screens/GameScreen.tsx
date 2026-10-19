import { useMemo } from "react";
import { birdieHoleNet, carryMultipliers, holeNet } from "../betting";
import { relLabel, scoreLabel, won, wonSigned } from "../util";
import { Avatar, Icon } from "../icons";
import type { ParValue, Session, Transfer } from "../types";

const SCORE_OPTS = [-2, -1, 0, 1, 2, 3, 4, 5];

export default function GameScreen({ session }: { session: Session }) {
  const { config, holes, currentHole: idx, goHole, setPar, setScore } = session;
  const hole = holes[idx];
  const readOnly = session.status === "done" && !session.isHost;

  const carries = useMemo(
    () => carryMultipliers(holes, config.players),
    [holes, config.players]
  );
  const carry = carries[idx] ?? 1;

  const game = useMemo(
    () => holeNet(hole, config.players, config.unit, config.rules, carry),
    [hole, config, carry]
  );
  const birdie = useMemo(
    () => birdieHoleNet(hole, config.players, config.unit, config.rules, carry),
    [hole, config, carry]
  );

  const running = useMemo(() => {
    const net: Record<string, number> = {};
    for (const p of config.players) net[p.id] = 0;
    holes.forEach((h, j) => {
      const c = carries[j] ?? 1;
      const g = holeNet(h, config.players, config.unit, config.rules, c).net;
      const b = birdieHoleNet(h, config.players, config.unit, config.rules, c).net;
      for (const id of Object.keys(net)) net[id] += g[id] + b[id];
    });
    return net;
  }, [holes, config, carries]);

  const scoreClass = (rel: number) =>
    rel < 0 ? "under" : rel > 0 ? "over" : "even";

  const nameOf = (id: string) => config.players.find((p) => p.id === id)!;

  const renderTransfers = (transfers: Transfer[], birdieStyle = false) =>
    transfers.map((t, i) => {
      const from = nameOf(t.fromId);
      const to = nameOf(t.toId);
      return (
        <div className={`transfer ${birdieStyle ? "birdie" : ""}`} key={i}>
          <span className="from">
            <Avatar photoUrl={from.photoUrl} gender={from.gender} size={22} />
            {from.name || "?"}
          </span>
          <span className="arrow">
            <Icon name="chevronRight" size={16} />
          </span>
          <span className="to">
            <Avatar photoUrl={to.photoUrl} gender={to.gender} size={22} />
            {to.name || "?"}
          </span>
          <span className="amt">{won(t.amount)}</span>
        </div>
      );
    });

  return (
    <>
      <div className="hole-nav">
        <button className="navbtn" disabled={idx === 0} onClick={() => goHole(idx - 1)}>
          <Icon name="chevronLeft" size={22} />
        </button>
        <div className="center">
          <div className="num">{idx + 1}번 홀</div>
          <div className="lbl">
            PAR {hole.par} · {idx + 1} / {holes.length}
          </div>
        </div>
        <button
          className="navbtn"
          disabled={idx === holes.length - 1}
          onClick={() => goHole(idx + 1)}
        >
          <Icon name="chevronRight" size={22} />
        </button>
      </div>

      <div className="sheet">
        {readOnly && (
          <div className="ro-banner">
            정산이 확정된 라운드입니다. 방장만 수정할 수 있어요.
          </div>
        )}
        <div className="par-seg">
          {([3, 4, 5] as ParValue[]).map((p) => (
            <button
              key={p}
              className={hole.par === p ? "active" : ""}
              disabled={readOnly}
              onClick={() => setPar(idx, p)}
            >
              PAR {p}
            </button>
          ))}
        </div>

        {game.multiplier > 1 && (
          <div className="bet-banner">
            <div className="mult">×{game.multiplier}</div>
            <div className="bb-txt">
              <span className="bt">배판 적용!</span>
              <span className="bs">{game.reasons.join(" · ")}</span>
            </div>
            <Icon name="spark" size={22} className="fire" />
          </div>
        )}

        <div className="section-title">이번 홀 스코어</div>
        <div className="card">
          {config.players.map((p) => {
            const rel = hole.scores[p.id];
            const net = running[p.id];
            return (
              <div className="pscore-block" key={p.id}>
                <div className="player-head">
                  <Avatar photoUrl={p.photoUrl} gender={p.gender} size={26} />
                  <span className="pname">{p.name || "?"}</span>
                  <span className={`pnet ${net > 0 ? "pos" : net < 0 ? "neg" : ""}`}>
                    {net === 0 ? "±0" : wonSigned(net)}
                  </span>
                </div>
                <div className="score-grid">
                  {SCORE_OPTS.map((s) => (
                    <button
                      key={s}
                      className={`sbtn ${rel === s ? `active ${scoreClass(s)}` : ""}`}
                      disabled={readOnly}
                      onClick={() => setScore(idx, p.id, rel === s ? null : s)}
                    >
                      {relLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="section-title">이번 홀 정산</div>
        {game.transfers.length === 0 ? (
          <div className="card">
            <div className="empty-note">
              {carry > 1
                ? "전원 동타로 정산이 이월되어 다음 홀이 배판이 됩니다."
                : "스코어를 입력하면 자동으로 정산돼요."}
            </div>
          </div>
        ) : (
          <div>{renderTransfers(game.transfers)}</div>
        )}

        {birdie.transfers.length > 0 && (
          <>
            <div className="section-title">
              <Icon name="birdie" size={15} className="inline-ic" /> 버디 추가 정산
            </div>
            {renderTransfers(birdie.transfers, true)}
          </>
        )}

        <div className="section-title" style={{ marginTop: 16 }}>
          스코어 요약
        </div>
        <div className="card">
          {config.players.map((p) => {
            const rel = hole.scores[p.id];
            return (
              <div className="gplayer" key={p.id} style={{ justifyContent: "space-between" }}>
                <span className="gp-name">
                  <Avatar photoUrl={p.photoUrl} gender={p.gender} size={22} />
                  <b>{p.name || "?"}</b>
                </span>
                <span
                  style={{
                    fontWeight: 900,
                    color:
                      rel == null
                        ? "var(--ink-faint)"
                        : rel < 0
                        ? "var(--terra)"
                        : rel > 0
                        ? "var(--teal)"
                        : "var(--ink)",
                  }}
                >
                  {rel == null ? "미입력" : scoreLabel(hole.par, rel)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
