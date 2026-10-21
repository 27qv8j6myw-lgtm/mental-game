import { useEffect, useState } from "react";
import { useRound } from "../round";
import { EMPTY_STAT, girOf } from "../recordStats";
import { relLabel, scoreLabel, teeLabel } from "../util";
import { Avatar, Icon } from "../icons";
import type { HoleStat, ParValue, Session } from "../types";
import { SCORE_OPTS } from "./GameScreen";
import HoleStatFields from "./HoleStatFields";

const scoreClass = (rel: number) => (rel < 0 ? "under" : rel > 0 ? "over" : "even");

const sameStat = (a: HoleStat, b: HoleStat) =>
  a.putts === b.putts &&
  a.fairway === b.fairway &&
  a.lie === b.lie &&
  a.ob === b.ob &&
  a.hazard === b.hazard &&
  a.sand === b.sand;

/** 이 홀에서 입력 중인 내 기록 (저장 전) */
interface Draft {
  hole: number;
  par: ParValue;
  rel: number | null;
  stat: HoleStat;
}

/**
 * 기록 모드 홀 진행: 내 스코어·퍼트·티샷·벌타를 입력하고, 함께 친 사람은 스코어만 본다.
 * 입력은 초안이고 아래 바의 [저장]을 눌러야 올라간다 ([취소]면 원래대로). 초안이 있는 동안은 홀을 옮길 수 없다
 */
export default function RecordGameScreen({
  session,
  onFinish,
  onBusyChange,
}: {
  session: Session;
  /** 방장: 라운드 종료 (마지막 홀 아래 바) */
  onFinish: () => void;
  /** 저장 안 한 초안이 있는 동안 true (상단 버튼을 잠근다) */
  onBusyChange?: (busy: boolean) => void;
}) {
  const { myUid } = useRound();
  const { config, holes, holeStats, currentHole: idx, goHole, setPar, setScore, setStat } = session;
  const hole = holes[idx];
  const me = config.players.find((p) => p.id === myUid) ?? null;
  const others = config.players.filter((p) => p.id !== myUid);
  // 종료된 라운드의 파는 방장만 고친다 (내 기록은 언제든 고칠 수 있다)
  const parLocked = session.status === "done" && !session.isHost;

  const savedRel = me ? hole.scores[me.id] ?? null : null;
  const savedStat = (me && holeStats[idx]?.[me.id]) || EMPTY_STAT;
  const [draft, setDraft] = useState<Draft | null>(null);
  // 저장 직후 1초는 같은 자리의 '라운드 종료'를 보이지 않는다 (저장을 두 번 눌러 종료되지 않게)
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 1000);
    return () => clearTimeout(t);
  }, [justSaved]);
  const d: Draft =
    draft && draft.hole === idx ? draft : { hole: idx, par: hole.par, rel: savedRel, stat: savedStat };
  const dirty = d.par !== hole.par || d.rel !== savedRel || !sameStat(d.stat, savedStat);
  // 홀을 옮기면 (초안이 있으면 옮길 수 없다) 비운다
  useEffect(() => setDraft(null), [idx]);
  useEffect(() => onBusyChange?.(dirty), [dirty, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const { par, rel, stat } = d;
  const strokes = rel == null ? null : par + rel;
  const gir = girOf(par, rel, stat.putts);
  const scoreOpts = SCORE_OPTS.filter((s) => s >= 1 - par && s <= par);

  const update = (patch: Partial<HoleStat>) => setDraft({ ...d, stat: { ...d.stat, ...patch } });
  const onScore = (s: number) => {
    const next = rel === s ? null : s;
    // 퍼트는 타수보다 많을 수 없다
    const putts = next != null && stat.putts != null && stat.putts > par + next ? par + next : stat.putts;
    setDraft({ ...d, rel: next, stat: { ...stat, putts } });
  };
  // PAR 를 낮추면 더블파를 넘는 스코어는 더블파로 맞춘다
  const onPar = (p: ParValue) => setDraft({ ...d, par: p, rel: rel == null ? null : Math.min(rel, p) });

  const save = () => {
    if (!me || !dirty) return;
    if (d.par !== hole.par && !parLocked) setPar(idx, d.par);
    if (d.rel !== savedRel) setScore(idx, me.id, d.rel);
    if (!sameStat(d.stat, savedStat)) setStat(idx, me.id, d.stat);
    setDraft(null);
    setJustSaved(true);
    // 이 홀 스코어를 처음 저장하면 다음 홀로
    if (savedRel == null && d.rel != null && idx < holes.length - 1) goHole(idx + 1);
  };

  const tee = teeLabel(config.courseTee);

  return (
    <>
      <div className="hole-nav">
        <button className="navbtn" disabled={idx === 0 || dirty} onClick={() => goHole(idx - 1)}>
          <Icon name="chevronLeft" size={22} />
        </button>
        <div className="center">
          <div className="num">{idx + 1}번 홀</div>
          <div className="lbl">
            PAR {par}
            {tee && ` · ${tee}`} · {idx + 1} / {holes.length}
            {!!session.pendingSaves && (
              <span className="pending"> · 저장 대기 {session.pendingSaves}개</span>
            )}
          </div>
        </div>
        <button
          className="navbtn"
          disabled={idx === holes.length - 1 || dirty}
          onClick={() => goHole(idx + 1)}
        >
          <Icon name="chevronRight" size={22} />
        </button>
      </div>

      {/* 아래 저장/취소 줄 자리를 늘 비워 둔다 (나타나도 화면이 밀리지 않게) */}
      <div className="sheet bar-space">
        {/* 이 홀 내 기록 상태: PAR 위 늘 같은 자리 (끝난 라운드도 내 기록은 고칠 수 있다) */}
        {me && (
          <div className="status-slot">
            <div className={`hole-status ${dirty ? "draft" : savedRel != null ? "saved" : "empty"}`} role="status">
              {session.status === "done" && !dirty && "끝난 라운드 · "}
              {dirty ? "저장 전 · 저장해야 기록돼요" : savedRel != null ? "✓ 저장됨" : "입력 전"}
            </div>
          </div>
        )}
        <div className="par-seg">
          {([3, 4, 5] as ParValue[]).map((p) => (
            <button
              key={p}
              className={par === p ? "active" : ""}
              disabled={parLocked}
              onClick={() => onPar(p)}
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
                  {strokes == null ? "입력 전" : `${strokes}타 · ${scoreLabel(par, rel!)}`}
                </span>
              </div>

              <div className="rec-label">스코어</div>
              <div
                className="score-grid main-score"
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

              <HoleStatFields par={par} strokes={strokes} stat={stat} onChange={update} />
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

      {/* 아래 바: 저장/취소 (마지막 홀은 방장의 라운드 종료) */}
      {me && (
        <div className="play-bar" data-unsaved={dirty || undefined}>
          <div className="pb-actions">
            {dirty ? (
              <>
                <button className="btn-ghost" onClick={() => setDraft(null)}>
                  취소
                </button>
                <button className="btn-primary" onClick={save}>
                  저장
                </button>
              </>
            ) : session.isHost && session.status === "playing" && idx === holes.length - 1 && !justSaved ? (
              <button className="btn-primary" onClick={onFinish}>
                <Icon name="finish" size={18} className="inline-ic" /> 라운드 종료
              </button>
            ) : (
              <button className="btn-primary" disabled>
                저장
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
