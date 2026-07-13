import { useMemo } from "react";
import { useApp } from "../store";
import { birdieHoleNet, holeNet } from "../betting";
import { genderEmoji, relLabel, scoreLabel, won, wonSigned } from "../util";
import type { ParValue, Transfer } from "../types";

const SCORE_OPTS = [-2, -1, 0, 1, 2, 3, 4, 5];

export default function GameScreen() {
  const { state, setPar, setScore, goHole } = useApp();
  const config = state.config!;
  const idx = state.currentHole;
  const hole = state.holes[idx];

  const game = useMemo(
    () => holeNet(hole, config.players, config.unit, config.rules),
    [hole, config]
  );
  const birdie = useMemo(
    () => birdieHoleNet(hole, config.players, config.unit, config.rules),
    [hole, config]
  );

  // 현재까지 누적(게임+버디, 핸디 제외)
  const running = useMemo(() => {
    const net: Record<string, number> = {};
    for (const p of config.players) net[p.id] = 0;
    for (const h of state.holes) {
      const g = holeNet(h, config.players, config.unit, config.rules).net;
      const b = birdieHoleNet(h, config.players, config.unit, config.rules).net;
      for (const id of Object.keys(net)) net[id] += g[id] + b[id];
    }
    return net;
  }, [state.holes, config]);

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
            {genderEmoji(from.gender)} {from.name || "?"}
          </span>
          <span className="arrow">→</span>
          <span className="to">
            {genderEmoji(to.gender)} {to.name || "?"}
          </span>
          <span className="amt">{won(t.amount)}</span>
        </div>
      );
    });

  return (
    <>
      <div className="hole-nav">
        <button
          className="navbtn"
          disabled={idx === 0}
          onClick={() => goHole(idx - 1)}
        >
          ‹
        </button>
        <div className="center">
          <div className="num">{idx + 1}번 홀</div>
          <div className="lbl">
            PAR {hole.par} · {idx + 1} / {state.holes.length}
          </div>
        </div>
        <button
          className="navbtn"
          disabled={idx === state.holes.length - 1}
          onClick={() => goHole(idx + 1)}
        >
          ›
        </button>
      </div>

      <div className="sheet">
        <div className="par-seg">
          {([3, 4, 5] as ParValue[]).map((p) => (
            <button
              key={p}
              className={hole.par === p ? "active" : ""}
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
            <span className="fire">🔥</span>
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
                  <span className="emoji">{genderEmoji(p.gender)}</span>
                  <span className="pname">{p.name || "?"}</span>
                  <span
                    className={`pnet ${net > 0 ? "pos" : net < 0 ? "neg" : ""}`}
                  >
                    {net === 0 ? "±0" : wonSigned(net)}
                  </span>
                </div>
                <div className="score-grid">
                  {SCORE_OPTS.map((s) => (
                    <button
                      key={s}
                      className={`sbtn ${
                        rel === s ? `active ${scoreClass(s)}` : ""
                      }`}
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
              스코어를 입력하면 자동으로 정산돼요.
            </div>
          </div>
        ) : (
          <div>{renderTransfers(game.transfers)}</div>
        )}

        {birdie.transfers.length > 0 && (
          <>
            <div className="section-title">🐦 버디 추가 정산</div>
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
                <span>
                  {genderEmoji(p.gender)}{" "}
                  <b style={{ marginLeft: 4 }}>{p.name || "?"}</b>
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
