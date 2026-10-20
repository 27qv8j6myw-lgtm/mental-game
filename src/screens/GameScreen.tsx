import { useMemo } from "react";
import {
  adjustedRel,
  birdieHoleNet,
  carryMultipliers,
  holeNet,
  settleNet,
  skinsResult,
} from "../betting";
import { relLabel, scoreLabel, won, wonSigned } from "../util";
import { Avatar, Icon } from "../icons";
import type { ParValue, Session, Transfer } from "../types";
import { SkinPot, SkinStrip } from "./SkinsPanel";

// 아래로는 홀인원(1타)까지, 위로는 더블파(파 대비 +par)까지만 PAR 에 맞춰 보여준다
// → 파3: -2~+3, 파4: -3(알바트로스)~+4, 파5: -3~+5
const SCORE_OPTS = [-3, -2, -1, 0, 1, 2, 3, 4, 5];

export default function GameScreen({ session }: { session: Session }) {
  const { config, holes, currentHole: idx, goHole, setPar, setScore } = session;
  const hole = holes[idx];
  // 정산 확정 후에는 방장의 '스코어 수정' 모드에서만 고칠 수 있다
  const readOnly = session.status === "done" && !session.editing;

  const carries = useMemo(
    () => carryMultipliers(holes, config.players, config.rules),
    [holes, config.players, config.rules]
  );
  const carry = carries[idx] ?? 1;
  const nextCarry = idx < holes.length - 1 ? carries[idx + 1] : null;

  const game = useMemo(
    () => holeNet(hole, config.players, config.unit, config.rules, carry),
    [hole, config, carry]
  );
  const birdie = useMemo(
    () => birdieHoleNet(hole, config.players, config.unit, config.rules, carry),
    [hole, config, carry]
  );

  // 스킨스 라운드는 배판·버디 추가 정산 없이 스킨으로만 정산한다
  const isSkins = config.gameMode === "skins";
  const skins = useMemo(() => (isSkins ? skinsResult(config, holes) : null), [isSkins, config, holes]);
  const skin = skins?.holes[idx] ?? null;
  const skinTransfers = useMemo(() => (skin ? settleNet(skin.net) : []), [skin]);

  const running = useMemo(() => {
    if (skins) return skins.net;
    const net: Record<string, number> = {};
    for (const p of config.players) net[p.id] = 0;
    holes.forEach((h, j) => {
      const c = carries[j] ?? 1;
      const g = holeNet(h, config.players, config.unit, config.rules, c).net;
      const b = birdieHoleNet(h, config.players, config.unit, config.rules, c).net;
      for (const id of Object.keys(net)) net[id] += g[id] + b[id];
    });
    return net;
  }, [skins, holes, config, carries]);

  const scoreOpts = SCORE_OPTS.filter((s) => s >= 1 - hole.par && s <= hole.par);

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
            {!!session.pendingSaves && (
              <span className="pending"> · 저장 대기 {session.pendingSaves}개</span>
            )}
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
        {session.status === "done" && (
          <div className="ro-banner">
            {session.editing
              ? "스코어 수정 중이에요. 수정 완료를 눌러야 저장되고, 취소하면 원래대로 돌아가요."
              : session.isHost
              ? "정산이 확정된 라운드예요. 정산 결과의 '스코어 수정'에서 고칠 수 있어요."
              : "정산이 확정된 라운드입니다. 방장만 수정할 수 있어요."}
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

        {skins && skin ? (
          <>
            {/* key: 홀을 옮기거나 승부가 나면 카드 애니메이션을 다시 재생 */}
            <SkinPot
              key={`${idx}-${skin.status}`}
              hole={skin}
              next={skins.holes[idx + 1] ?? null}
              unit={config.unit}
              players={config.players}
              isLast={idx === holes.length - 1}
              birdieOn={!!config.rules.skins?.birdie}
            />
            <SkinStrip
              holes={skins.holes}
              current={idx}
              players={config.players}
              onPick={goHole}
            />
          </>
        ) : game.allTie ? (
          <div className="bet-banner carry">
            <div className="mult">{nextCarry ? `×${nextCarry}` : "–"}</div>
            <div className="bb-txt">
              <span className="bt">전원 동타 · 이 홀은 정산 없음</span>
              <span className="bs">
                {nextCarry ? `다음 홀로 ×${nextCarry} 이월돼요` : "마지막 홀이라 이월은 사라져요"}
              </span>
            </div>
          </div>
        ) : game.multiplier > 1 && (
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
            const skinWin = !!skin && skin.winnerIds.includes(p.id);
            const adj = p.strokeAdj ?? 0;
            return (
              <div className={`pscore-block ${skinWin ? "skin-win" : ""}`} key={p.id}>
                <div className="player-head">
                  <Avatar photoUrl={p.photoUrl} gender={p.gender} size={26} />
                  <span className="pname">{p.name || "?"}</span>
                  {adj > 0 && (
                    <span className={`adj-chip ${hole.par === 3 ? "off" : ""}`}>
                      {hole.par === 3 ? "파3 보정 없음" : `${adj}타 보정`}
                    </span>
                  )}
                  {skinWin && skin && (
                    <span className="win-badge">
                      <Icon name="trophy" size={12} />
                      {skin.status === "split" ? "나눔" : `스킨 ${skin.skins}`}
                    </span>
                  )}
                  <span className={`pnet ${net > 0 ? "pos" : net < 0 ? "neg" : ""}`}>
                    {net === 0 ? "±0" : wonSigned(net)}
                  </span>
                </div>
                <div
                  className="score-grid"
                  style={{ gridTemplateColumns: `repeat(${scoreOpts.length}, 1fr)` }}
                >
                  {scoreOpts.map((s) => (
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
        {skin ? (
          skinTransfers.length === 0 ? (
            <div className="card">
              <div className="empty-note">
                {skin.status !== "carried"
                  ? "스코어를 입력하면 자동으로 정산돼요."
                  : idx === holes.length - 1
                  ? "마지막 홀이 전원 동타라 남은 스킨은 사라져요."
                  : "최저 타수가 동타라 이 홀은 정산 없이 스킨이 이월돼요."}
              </div>
            </div>
          ) : (
            <div>{renderTransfers(skinTransfers)}</div>
          )
        ) : game.transfers.length === 0 ? (
          <div className="card">
            <div className="empty-note">
              {game.allTie
                ? "전원 동타라 이 홀은 정산이 없어요."
                : "스코어를 입력하면 자동으로 정산돼요."}
            </div>
          </div>
        ) : (
          <div>{renderTransfers(game.transfers)}</div>
        )}

        {!isSkins && birdie.transfers.length > 0 && (
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
                  className="sum-score"
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
                  {rel != null && adjustedRel(hole.par, rel, p.strokeAdj) !== rel && (
                    <small className="adj-to">
                      → {scoreLabel(hole.par, adjustedRel(hole.par, rel, p.strokeAdj))} (보정)
                    </small>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
