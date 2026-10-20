import { useRound } from "../round";
import { EMPTY_STAT, girOf } from "../recordStats";
import { relLabel, scoreLabel, teeLabel } from "../util";
import { Avatar, Icon } from "../icons";
import type { Fairway, HoleStat, ParValue, Session, TeeLie } from "../types";
import { SCORE_OPTS } from "./GameScreen";

const PUTTS = [0, 1, 2, 3, 4, 5, 6];

/** 티샷 방향: 훅(왼쪽)·적중·짧음(안 뜸)·슬라이스(오른쪽) */
const FAIRWAYS: [Fairway, string, "hook" | "ring" | "short" | "slice"][] = [
  ["left", "훅 (왼쪽)", "hook"],
  ["hit", "적중", "ring"],
  ["short", "짧음 (안 뜸)", "short"],
  ["right", "슬라이스 (오른쪽)", "slice"],
];
/** 티샷 벙커·패널티: 방향과 함께 고를 수 있다 */
const LIES: [TeeLie, string][] = [
  ["bunker", "벙커"],
  ["penalty", "패널티"],
];

const COUNTS: ["ob" | "hazard" | "sand", string][] = [
  ["ob", "OB"],
  ["hazard", "해저드"],
  ["sand", "샌드샷"],
];

const scoreClass = (rel: number) => (rel < 0 ? "under" : rel > 0 ? "over" : "even");

/** 기록 모드 홀 진행: 내 스코어·퍼트·티샷·벌타를 입력하고, 함께 친 사람은 스코어만 본다 */
export default function RecordGameScreen({ session }: { session: Session }) {
  const { myUid } = useRound();
  const { config, holes, holeStats, currentHole: idx, goHole, setPar, setScore, setStat } = session;
  const hole = holes[idx];
  const me = config.players.find((p) => p.id === myUid) ?? null;
  const others = config.players.filter((p) => p.id !== myUid);
  // 종료된 라운드의 파는 방장만 고친다 (내 기록은 언제든 고칠 수 있다)
  const parLocked = session.status === "done" && !session.isHost;

  const rel = me ? hole.scores[me.id] ?? null : null;
  const stat = (me && holeStats[idx]?.[me.id]) || EMPTY_STAT;
  const strokes = rel == null ? null : hole.par + rel;
  const gir = girOf(hole.par, rel, stat.putts);
  const scoreOpts = SCORE_OPTS.filter((s) => s >= 1 - hole.par && s <= hole.par);

  const update = (patch: Partial<HoleStat>) => {
    if (me) setStat(idx, me.id, { ...stat, ...patch });
  };
  const onScore = (s: number) => {
    if (!me) return;
    const next = rel === s ? null : s;
    setScore(idx, me.id, next);
    // 퍼트는 타수보다 많을 수 없다
    if (next != null && stat.putts != null && stat.putts > hole.par + next)
      update({ putts: hole.par + next });
  };

  const tee = teeLabel(config.courseTee);

  return (
    <>
      <div className="hole-nav">
        <button className="navbtn" disabled={idx === 0} onClick={() => goHole(idx - 1)}>
          <Icon name="chevronLeft" size={22} />
        </button>
        <div className="center">
          <div className="num">{idx + 1}번 홀</div>
          <div className="lbl">
            PAR {hole.par}
            {tee && ` · ${tee}`} · {idx + 1} / {holes.length}
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
            <span>기록이 끝난 라운드예요.</span>
            <span>내 기록은 계속 고칠 수 있어요.</span>
          </div>
        )}
        <div className="par-seg">
          {([3, 4, 5] as ParValue[]).map((p) => (
            <button
              key={p}
              className={hole.par === p ? "active" : ""}
              disabled={parLocked}
              onClick={() => setPar(idx, p)}
            >
              PAR {p}
            </button>
          ))}
        </div>

        {me && (
          <>
            <div className="section-title">내 기록</div>
            <div className="card rec-card">
              <div className="player-head">
                <Avatar photoUrl={me.photoUrl} gender={me.gender} size={26} />
                <span className="pname">{me.name || "나"}</span>
                {gir != null && (
                  <span className={`gir-chip ${gir ? "on" : ""}`}>{gir ? "GIR" : "GIR 아님"}</span>
                )}
                <span className="rec-total">
                  {strokes == null ? "입력 전" : `${strokes}타 · ${scoreLabel(hole.par, rel!)}`}
                </span>
              </div>

              <div className="rec-label">스코어</div>
              <div
                className="score-grid"
                style={{ gridTemplateColumns: `repeat(${scoreOpts.length}, 1fr)` }}
              >
                {scoreOpts.map((s) => (
                  <button
                    key={s}
                    className={`sbtn ${rel === s ? `active ${scoreClass(s)}` : ""}`}
                    onClick={() => onScore(s)}
                  >
                    {relLabel(s)}
                  </button>
                ))}
              </div>

              <div className="rec-label">퍼트</div>
              <div className="score-grid" style={{ gridTemplateColumns: `repeat(${PUTTS.length}, 1fr)` }}>
                {PUTTS.map((n) => (
                  <button
                    key={n}
                    className={`sbtn ${stat.putts === n ? "active even" : ""}`}
                    // 타수보다 많은 퍼트는 고를 수 없다
                    disabled={strokes != null && n > strokes}
                    onClick={() => update({ putts: stat.putts === n ? null : n })}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {hole.par !== 3 && (
                <>
                  <div className="rec-label">
                    티샷 페어웨이 <small>(벙커/패널티와 티샷 방향 동시선택 가능)</small>
                  </div>
                  <div className="rec-fw-row">
                    <div className="score-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                      {FAIRWAYS.map(([f, label, icon]) => (
                        <button
                          key={f}
                          className={`sbtn rec-fw ${stat.fairway === f ? `active ${f}` : ""}`}
                          aria-label={label}
                          aria-pressed={stat.fairway === f}
                          onClick={() => update({ fairway: stat.fairway === f ? null : f })}
                        >
                          <Icon name={icon} size={20} strokeWidth={2.2} />
                        </button>
                      ))}
                    </div>
                    <div className="score-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                      {LIES.map(([l, label]) => (
                        <button
                          key={l}
                          className={`sbtn rec-fw ${stat.lie === l ? `active ${l}` : ""}`}
                          aria-pressed={stat.lie === l}
                          onClick={() => update({ lie: stat.lie === l ? null : l })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="rec-label">패널티 · 벙커</div>
              <div className="rec-counts">
                {COUNTS.map(([k, label]) => (
                  <div className="rec-count" key={k}>
                    <span className="rc-label">{label}</span>
                    <div className="rc-ctrl">
                      <button
                        aria-label={`${label} 빼기`}
                        disabled={stat[k] === 0}
                        onClick={() => update({ [k]: Math.max(0, stat[k] - 1) })}
                      >
                        −
                      </button>
                      <b>{stat[k]}</b>
                      <button
                        aria-label={`${label} 더하기`}
                        disabled={stat[k] >= 9}
                        onClick={() => update({ [k]: stat[k] + 1 })}
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {others.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 16 }}>
              함께 친 사람
            </div>
            <div className="card">
              {others.map((p) => {
                const r = hole.scores[p.id];
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
                          r == null
                            ? "var(--ink-faint)"
                            : r < 0
                            ? "var(--terra)"
                            : r > 0
                            ? "var(--teal)"
                            : "var(--ink)",
                      }}
                    >
                      {r == null ? "입력 전" : `${hole.par + r} · ${scoreLabel(hole.par, r)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
