import { useMemo } from "react";
import { useApp } from "../store";
import {
  birdieNet,
  gameNet,
  handicapNet,
  totalNet,
} from "../betting";
import { genderEmoji, won, wonSigned } from "../util";
import type { Transfer } from "../types";

export default function ResultsScreen() {
  const { state } = useApp();
  const config = state.config!;
  const isPost = config.handicapSettle === "post";

  const game = useMemo(() => gameNet(config, state.holes), [config, state.holes]);
  const bird = useMemo(() => birdieNet(config, state.holes), [config, state.holes]);
  const hc = useMemo(() => handicapNet(config), [config]);
  const final = useMemo(
    () => totalNet(config, state.holes, isPost),
    [config, state.holes, isPost]
  );

  const nameOf = (id: string) => config.players.find((p) => p.id === id)!;

  const playedHoles = state.holes.filter((h) =>
    Object.values(h.scores).some((s) => s !== null)
  ).length;

  const standings = [...config.players]
    .map((p) => ({ p, net: final.net[p.id] ?? 0 }))
    .sort((a, b) => b.net - a.net);

  const NetList = ({ net }: { net: Record<string, number> }) => (
    <div className="card">
      {config.players.map((p) => {
        const v = net[p.id] ?? 0;
        return (
          <div
            className="gplayer"
            key={p.id}
            style={{ justifyContent: "space-between" }}
          >
            <span>
              {genderEmoji(p.gender)} <b style={{ marginLeft: 4 }}>{p.name || "?"}</b>
            </span>
            <span
              className={v > 0 ? "pos" : v < 0 ? "neg" : ""}
              style={{ fontWeight: 900 }}
            >
              {v === 0 ? "±0원" : wonSigned(v)}
            </span>
          </div>
        );
      })}
    </div>
  );

  const Transfers = ({ list, birdie }: { list: Transfer[]; birdie?: boolean }) =>
    list.length === 0 ? (
      <div className="card">
        <div className="empty-note">주고받을 금액이 없습니다.</div>
      </div>
    ) : (
      <div>
        {list.map((t, i) => {
          const from = nameOf(t.fromId);
          const to = nameOf(t.toId);
          return (
            <div className={`transfer ${birdie ? "birdie" : ""}`} key={i}>
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
        })}
      </div>
    );

  return (
    <>
      <div className="result-hero">
        <div className="big">🏆 최종 정산</div>
        <div style={{ opacity: 0.82, marginTop: 5, fontSize: 13 }}>
          {playedHoles}개 홀 진행 · 타당 {won(config.unit)}
        </div>
      </div>

      <div className="sheet">
        <div className="section-title">순위</div>
        {standings.map((s, i) => (
          <div className="standing" key={s.p.id}>
            <div className={`rank ${i === 0 && s.net > 0 ? "top" : ""}`}>
              {i + 1}
            </div>
            <span className="emoji">{genderEmoji(s.p.gender)}</span>
            <span className="nm">{s.p.name || "?"}</span>
            <span className={`val ${s.net > 0 ? "pos" : s.net < 0 ? "neg" : ""}`}>
              {s.net === 0 ? "±0원" : wonSigned(s.net)}
            </span>
          </div>
        ))}

        {/* 1) 게임 순수 정산 */}
        <div className="section-title" style={{ marginTop: 20 }}>
          ① 게임 순수 정산
        </div>
        <NetList net={game.net} />

        {/* 2) 버디 추가 정산 */}
        <div className="section-title">② 버디 추가 정산</div>
        <NetList net={bird.net} />

        {/* 3) 핸디캡 정산 */}
        <div className="section-title">③ 핸디캡 정산 {isPost ? "(사후·합산)" : "(사전·별도)"}</div>
        {hc.transfers.length === 0 ? (
          <div className="card">
            <div className="empty-note">핸디 차이가 없습니다.</div>
          </div>
        ) : (
          <Transfers list={hc.transfers} />
        )}
        <NetList net={hc.net} />
        {!isPost && (
          <p className="hint" style={{ margin: "-6px 2px 12px" }}>
            사전 정산을 선택하여 최종 송금에는 포함되지 않았습니다.
          </p>
        )}

        {/* 4) 최종 송금 */}
        <div className="section-title">④ 최종 송금 (최소 횟수)</div>
        <p className="hint" style={{ margin: "0 2px 10px" }}>
          {isPost
            ? "게임 + 버디 + 핸디캡을 모두 합산했습니다."
            : "게임 + 버디 합산 (핸디캡은 사전 정산)."}
        </p>
        <Transfers list={final.transfers} />
      </div>
    </>
  );
}
