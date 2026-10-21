import { useEffect, useMemo, useRef, useState } from "react";
import {
  adjustedRel,
  birdieHoleNet,
  carryMultipliers,
  holeNet,
  settleNet,
  skinsResult,
} from "../betting";
import { holeEditItems, localTime, relLabel, scoreLabel, won, wonSigned } from "../util";
import { Avatar, Icon } from "../icons";
import type { HoleScore, HoleStat, ParValue, Session, Transfer } from "../types";
import { SkinPot, SkinStrip } from "./SkinsPanel";
import { useRound } from "../round";
import { firstUnsaved, settledHoles } from "../model";
import { EMPTY_STAT, girOf } from "../recordStats";
import HoleStatFields from "./HoleStatFields";

// 아래로는 홀인원(1타)까지, 위로는 더블파(파 대비 +par)까지만 PAR 에 맞춰 보여준다
// → 파3: -2~+3, 파4: -3(알바트로스)~+4, 파5: -3~+5
export const SCORE_OPTS = [-3, -2, -1, 0, 1, 2, 3, 4, 5];

const sameStat = (a: HoleStat, b: HoleStat) =>
  a.putts === b.putts &&
  a.fairway === b.fairway &&
  a.lie === b.lie &&
  a.ob === b.ob &&
  a.hazard === b.hazard &&
  a.sand === b.sand;

/** 저장된 홀을 고치는 중인 초안 (이 홀만) */
interface HoleDraft {
  hole: number;
  par: ParValue;
  scores: Record<string, number | null>;
}

/**
 * 홀 진행 (타당·스킨스).
 * 저장 전 홀은 모두가 함께 입력하고(바로 공유), [N번 홀 저장]을 눌러야 확정돼 정산에 들어간다.
 * 저장된 홀은 잠기고 [수정] → 취소/저장으로만 고친다(수정 내역이 남음). 마지막 홀까지 저장하면 방장이 최종 확정.
 * onBusyChange: 홀 수정·내 기록 초안이 열려 있는 동안 true (탭바를 숨겨 다른 화면으로 못 가게)
 */
export default function GameScreen({
  session,
  onFinish,
  onBusyChange,
}: {
  session: Session;
  /** 방장: 최종 확정 */
  onFinish: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { config, holes, currentHole: idx, goHole, setPar, setScore, status, holeSave } = session;
  const { myUid } = useRound();
  const hole = holes[idx];
  const lastIdx = holes.length - 1;
  const playing = status === "playing";
  const nameOf = (id: string) => config.players.find((p) => p.id === id)!;

  // ---- 홀 상태 ----
  const saved = hole.saved !== false;
  const frontier = firstUnsaved(holes); // 저장 안 된 첫 홀 (-1: 모두 저장)
  const allSaved = frontier < 0;
  const [draft, setDraft] = useState<HoleDraft | null>(null);
  const editing = draft !== null && draft.hole === idx;
  // 저장 전 홀은 지금처럼 바로 입력 (진행 중일 때만)
  const live = holeSave && playing && !saved;
  // 수정: 라운드 중엔 저장된 홀을 누구나, 종료 후엔 방장이 어느 홀이든
  const canEdit = holeSave && (playing ? saved : status === "done" && session.isHost);
  const view: HoleScore = editing ? { ...hole, par: draft.par, scores: draft.scores } : hole;
  const inputOn = live || editing;
  const filled = config.players.filter((p) => view.scores[p.id] != null).length;
  const allIn = filled === config.players.length;
  const pending = session.pendingHoles.has(idx);

  // ---- 내 기록 (퍼트·티샷·벌타): 내 이름을 눌러 열고, 저장/취소로 끝낸다 ----
  const isPlayer = !!myUid && config.players.some((p) => p.id === myUid);
  const canStat = isPlayer && !editing;
  const myStat = (myUid && session.holeStats[idx]?.[myUid]) || EMPTY_STAT;
  const hasMyStat = !sameStat(myStat, EMPTY_STAT);
  const [rec, setRec] = useState<HoleStat | null>(null);
  const recDirty = rec !== null && !sameStat(rec, myStat);
  const saveRec = () => {
    if (rec && myUid && recDirty) session.setStat(idx, myUid, rec);
    setRec(null);
  };
  // 홀을 옮기면 (초안이 있으면 옮길 수 없다) 닫는다
  useEffect(() => {
    setRec(null);
    setDraft((d) => (d && d.hole !== idx ? null : d));
  }, [idx]);

  const busy = editing || recDirty;
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  // ---- 이동: 진행 중엔 저장 안 된 첫 홀까지만, 초안이 있으면 못 옮긴다 ----
  const maxIdx = holeSave && playing && !allSaved ? frontier : lastIdx;
  const go = (i: number) => {
    if (!busy && i >= 0 && i <= maxIdx) goHole(i);
  };

  // 보고 있던 홀이 (다른 사람에 의해) 저장되면 저장 안 된 첫 홀로 따라간다. 앞 홀을 다시 보는 중이면 그대로
  const seen = useRef<{ idx: number; saved: boolean } | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const prev = seen.current;
    seen.current = { idx, saved };
    if (!holeSave || !playing || !prev || prev.idx !== idx || prev.saved || !saved) return;
    const by = hole.savedBy && hole.savedBy !== myUid ? nameOf(hole.savedBy)?.name : null;
    if (busyRef.current) {
      if (by) session.setNotice(`${by}님이 ${idx + 1}번 홀을 저장했어요`);
      return;
    }
    const f = firstUnsaved(holes);
    goHole(f < 0 ? lastIdx : f);
    if (by) session.setNotice(`${by}님이 ${idx + 1}번 홀을 저장했어요`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, saved]);

  // 화면이 다시 켜지면 저장 안 된 첫 홀로 (모두 같은 홀을 본다)
  const holesRef = useRef(holes);
  holesRef.current = holes;
  useEffect(() => {
    if (!holeSave || !playing) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible" || busyRef.current) return;
      const f = firstUnsaved(holesRef.current);
      goHole(f < 0 ? holesRef.current.length - 1 : f);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [holeSave, playing, goHole]);

  // ---- 정산: 누적은 저장된 홀만, 이번 홀은 입력 중인 값으로 미리 계산 ----
  const settled = useMemo(() => settledHoles(holes), [holes]);
  const preview = useMemo(
    () => settled.map((h, j) => (j === idx ? view : h)),
    [settled, idx, view]
  );
  const carries = useMemo(
    () => carryMultipliers(preview, config.players, config.rules),
    [preview, config.players, config.rules]
  );
  const carry = carries[idx] ?? 1;
  const nextCarry = idx < lastIdx ? carries[idx + 1] : null;
  const game = useMemo(
    () => holeNet(view, config.players, config.unit, config.rules, carry),
    [view, config, carry]
  );
  const birdie = useMemo(
    () => birdieHoleNet(view, config.players, config.unit, config.rules, carry),
    [view, config, carry]
  );

  // 스킨스 라운드는 배판·버디 추가 정산 없이 스킨으로만 정산한다
  const isSkins = config.gameMode === "skins";
  const skins = useMemo(() => (isSkins ? skinsResult(config, preview) : null), [isSkins, config, preview]);
  const skinsSettled = useMemo(
    () => (isSkins ? skinsResult(config, settled) : null),
    [isSkins, config, settled]
  );
  const skin = skins?.holes[idx] ?? null;
  const skinTransfers = useMemo(() => (skin ? settleNet(skin.net) : []), [skin]);

  const running = useMemo(() => {
    if (skinsSettled) return skinsSettled.net;
    const net: Record<string, number> = {};
    for (const p of config.players) net[p.id] = 0;
    const settledCarries = carryMultipliers(settled, config.players, config.rules);
    settled.forEach((h, j) => {
      const c = settledCarries[j] ?? 1;
      const g = holeNet(h, config.players, config.unit, config.rules, c).net;
      const b = birdieHoleNet(h, config.players, config.unit, config.rules, c).net;
      for (const id of Object.keys(net)) net[id] += g[id] + b[id];
    });
    return net;
  }, [skinsSettled, settled, config]);

  const scoreOpts = SCORE_OPTS.filter((s) => s >= 1 - view.par && s <= view.par);
  const scoreClass = (rel: number) => (rel < 0 ? "under" : rel > 0 ? "over" : "even");

  // ---- 입력 ----
  /** 내 퍼트는 타수보다 많을 수 없다 (기록 모드와 같은 규칙): 열린 초안 또는 저장된 기록에 맞춘다 */
  const clampMyPutts = (strokes: number) => {
    if (rec) {
      if (rec.putts != null && rec.putts > strokes) setRec({ ...rec, putts: strokes });
    } else if (myUid && myStat.putts != null && myStat.putts > strokes) {
      session.setStat(idx, myUid, { ...myStat, putts: strokes });
    }
  };
  const onPar = (p: ParValue) => {
    if (editing) {
      // PAR 를 낮추면 더블파를 넘는 스코어는 더블파로 맞춘다
      setDraft({
        ...draft,
        par: p,
        scores: Object.fromEntries(
          Object.entries(draft.scores).map(([k, v]) => [k, v == null ? v : Math.min(v, p)])
        ),
      });
    } else if (live) setPar(idx, p);
  };
  const onScore = (pid: string, s: number) => {
    const next = view.scores[pid] === s ? null : s;
    if (editing) setDraft({ ...draft, scores: { ...draft.scores, [pid]: next } });
    else if (live) setScore(idx, pid, next);
    else return;
    if (pid === myUid && next != null) clampMyPutts(view.par + next);
  };

  const fullScores = () =>
    Object.fromEntries(config.players.map((p) => [p.id, view.scores[p.id] as number]));

  /** 저장 전 홀 저장 → 모두 다음 홀로 */
  const saveHole = () => {
    // (내 기록 초안이 있으면 이 버튼이 숨겨져 있다: 내 기록을 먼저 저장/취소)
    if (!live || !allIn) return;
    session.saveHole(idx, view.par, fullScores(), []);
    if (idx < lastIdx) goHole(idx + 1);
  };
  const startEdit = () => {
    setRec(null);
    setDraft({ hole: idx, par: hole.par, scores: { ...hole.scores } });
  };
  const editItems = editing
    ? holeEditItems(idx, hole, view, (id) => nameOf(id)?.name || "?")
    : [];
  const saveEdit = () => {
    if (!editing || !allIn || editItems.length === 0) return;
    session.saveHole(idx, view.par, fullScores(), editItems);
    setDraft(null);
  };

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

  // ---- 홀 상태 표시 ----
  const savedLine = () => {
    const who = hole.savedBy ? nameOf(hole.savedBy)?.name || "?" : null;
    const when = hole.savedAt ? localTime(new Date(hole.savedAt)) : null;
    return [who, when].filter(Boolean).join(" ");
  };
  const statusChip = !holeSave ? null : editing ? (
    <span className="hole-state editing">수정 중</span>
  ) : !saved ? (
    <span className="hole-state draft">
      저장 전 · {filled}/{config.players.length}명 입력
    </span>
  ) : pending ? (
    <span className="hole-state wait">
      {session.pendingSaves ? "저장 대기 · 연결되면 올라가요" : "저장 중…"}
    </span>
  ) : hole.savedAt ? (
    <span className="hole-state saved">
      ✓ {(hole.version ?? 0) > 1 ? "수정됨" : "저장됨"} · {savedLine()}
    </span>
  ) : status === "done" ? null : (
    <span className="hole-state saved">
      ✓ 저장됨
    </span>
  );

  const previewNote = editing ? " (수정 미리보기)" : live ? " (저장 전 미리보기)" : "";

  return (
    <>
      <div className="hole-nav">
        <button className="navbtn" disabled={idx === 0 || busy} onClick={() => go(idx - 1)}>
          <Icon name="chevronLeft" size={22} />
        </button>
        <div className="center">
          <div className="num">{idx + 1}번 홀</div>
          <div className="lbl">
            PAR {view.par} · {idx + 1} / {holes.length}
            {!!session.pendingSaves && (
              <span className="pending"> · 저장 대기 {session.pendingSaves}개</span>
            )}
          </div>
          {statusChip}
        </div>
        <button
          className="navbtn"
          disabled={idx >= maxIdx || busy}
          onClick={() => go(idx + 1)}
        >
          <Icon name="chevronRight" size={22} />
        </button>
      </div>

      <div className="sheet">
        {session.notice && (
          <div className="notice-bar" role="status">
            <span>{session.notice}</span>
            <button aria-label="알림 닫기" onClick={() => session.setNotice(null)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        {status === "done" && !editing && (
          // 안내는 두 줄로 (문장마다 한 줄)
          <div className="ro-banner">
            {session.isHost ? (
              <>
                <span>정산이 확정된 라운드예요.</span>
                <span>고칠 홀에서 '수정'을 누르면 돼요.</span>
              </>
            ) : (
              <>
                <span>정산이 확정된 라운드입니다.</span>
                <span>방장만 수정할 수 있어요.</span>
              </>
            )}
          </div>
        )}
        {editing && (
          <div className="ro-banner edit">
            <span>{idx + 1}번 홀 수정 중이에요.</span>
            <span>저장하면 수정 내역에 남고, 취소하면 원래대로 돌아가요.</span>
          </div>
        )}
        <div className="par-seg">
          {([3, 4, 5] as ParValue[]).map((p) => (
            <button
              key={p}
              className={view.par === p ? "active" : ""}
              disabled={!inputOn}
              onClick={() => onPar(p)}
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
              isLast={idx === lastIdx}
              birdieOn={!!config.rules.skins?.birdie}
            />
            <SkinStrip holes={skins.holes} current={idx} players={config.players} onPick={go} />
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
            const rel = view.scores[p.id];
            const net = running[p.id];
            const skinWin = !!skin && skin.winnerIds.includes(p.id);
            const adj = p.strokeAdj ?? 0;
            const mine = canStat && p.id === myUid;
            const recStat = rec ?? myStat;
            return (
              <div className={`pscore-block ${skinWin ? "skin-win" : ""}`} key={p.id}>
                <div className="player-head">
                  <Avatar photoUrl={p.photoUrl} gender={p.gender} size={26} />
                  {mine ? (
                    <button
                      className="pname pname-btn"
                      aria-expanded={rec !== null}
                      // 열려 있을 때 이름을 다시 누르면: 바꾼 게 없으면 닫고, 있으면 저장/취소를 고르게 그대로 둔다
                      onClick={() => (rec === null ? setRec({ ...myStat }) : !recDirty && setRec(null))}
                    >
                      {p.name || "?"}
                      <span className={`my-rec-chip ${rec !== null ? "open" : hasMyStat ? "done" : ""}`}>
                        {rec !== null ? "내 기록 ▴" : hasMyStat ? "내 기록 ✓" : "내 기록 입력"}
                      </span>
                    </button>
                  ) : (
                    <span className="pname">{p.name || "?"}</span>
                  )}
                  {adj > 0 && (
                    <span className={`adj-chip ${view.par === 3 ? "off" : ""}`}>
                      {view.par === 3 ? "파3 보정 없음" : `${adj}타 보정`}
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
                  className={`score-grid ${inputOn ? "" : "locked"}`}
                  style={{ gridTemplateColumns: `repeat(${scoreOpts.length}, 1fr)` }}
                >
                  {scoreOpts.map((s) => (
                    <button
                      key={s}
                      className={`sbtn ${rel === s ? `active ${scoreClass(s)}` : ""}`}
                      disabled={!inputOn}
                      onClick={() => onScore(p.id, s)}
                    >
                      {relLabel(s)}
                    </button>
                  ))}
                </div>
                {mine && rec && (
                  <div className={`my-rec ${recDirty ? "dirty" : ""}`} data-unsaved={recDirty || undefined}>
                    {(() => {
                      const g = girOf(view.par, rel ?? null, recStat.putts);
                      return g == null ? null : (
                        <span className={`gir-chip ${g ? "on" : ""}`}>{g ? "GIR" : "GIR 아님"}</span>
                      );
                    })()}
                    <HoleStatFields
                      par={view.par}
                      strokes={rel == null ? null : view.par + rel}
                      stat={rec}
                      onChange={(patch) => setRec({ ...rec, ...patch })}
                    />
                    <div className="my-rec-actions">
                      <button className="btn-ghost" onClick={() => setRec(null)}>
                        취소
                      </button>
                      <button className="btn-save" disabled={!recDirty} onClick={saveRec}>
                        내 기록 저장
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="section-title">이번 홀 정산{previewNote}</div>
        {skin ? (
          skinTransfers.length === 0 ? (
            <div className="card">
              <div className="empty-note">
                {skin.status !== "carried"
                  ? holeSave
                    ? "스코어를 모두 입력하면 미리 계산해 보여줘요. 저장해야 정산에 들어가요."
                    : "스코어를 입력하면 자동으로 정산돼요."
                  : idx === lastIdx
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
                : holeSave
                ? "스코어를 입력하면 미리 계산해 보여줘요. 저장해야 정산에 들어가요."
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
            const rel = view.scores[p.id];
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
                  {rel == null ? "미입력" : scoreLabel(view.par, rel)}
                  {rel != null && adjustedRel(view.par, rel, p.strokeAdj) !== rel && (
                    <small className="adj-to">
                      → {scoreLabel(view.par, adjustedRel(view.par, rel, p.strokeAdj))} (보정)
                    </small>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- 아래 버튼: 저장 / 수정 / 최종 확정 ---- */}
      {editing ? (
        <div className="edit-bar">
          <button className="btn-ghost" onClick={() => setDraft(null)}>
            취소
          </button>
          <button
            className="btn-primary"
            disabled={!allIn || editItems.length === 0}
            onClick={saveEdit}
          >
            {!allIn ? "모두 입력해 주세요" : editItems.length === 0 ? "바뀐 게 없어요" : "저장"}
          </button>
        </div>
      ) : holeSave && !recDirty && (live || canEdit) ? (
        <div className="hole-bar">
          {live ? (
            <button className="btn-primary" disabled={!allIn} onClick={saveHole}>
              {allIn ? `${idx + 1}번 홀 저장` : `모두 입력하면 저장할 수 있어요 (${filled}/${config.players.length})`}
            </button>
          ) : (
            <>
              <button className="btn-ghost" onClick={startEdit}>
                수정
              </button>
              {playing && !allSaved && idx < frontier && (
                <button className="btn-ghost go" onClick={() => go(frontier)}>
                  {frontier + 1}번 홀로 <Icon name="chevronRight" size={16} className="inline-ic" />
                </button>
              )}
              {playing && allSaved && idx === lastIdx && session.isHost && (
                <button className="btn-primary" onClick={onFinish}>
                  <Icon name="finish" size={18} className="inline-ic" /> 최종 확정
                </button>
              )}
            </>
          )}
          {playing && allSaved && idx === lastIdx && !session.isHost && (
            <div className="hole-bar-note">방장이 최종 확정하면 정산이 끝나요</div>
          )}
        </div>
      ) : null}
    </>
  );
}
