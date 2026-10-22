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
import PlayBar, { DockButton } from "./PlayBar";
import type { HoleScore, HoleStat, ParValue, Session, Transfer } from "../types";
import { SkinPot, SkinStrip } from "./SkinsPanel";
import { CaddieCard, CaddiePayRow, RankBoard } from "./SideGamePanels";
import { caddieResult } from "../caddie";
import { pointsConfig, rankResult, rankRules, rankScoreText } from "../rankGame";
import { useRound } from "../round";
import { useUnfolded } from "../rail";
import { firstUnsaved, settledHoles } from "../model";
import { EMPTY_STAT, girOf } from "../recordStats";
import HoleStatFields from "./HoleStatFields";
import { clearDraft, loadDraft, saveDraft, type StoredDraft } from "../drafts";

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
  /** 수정을 시작할 때 이 홀의 version. 저장할 때 이 값으로 보내 그 사이 다른 사람이 고쳤으면 거절된다 */
  version: number;
  par: ParValue;
  scores: Record<string, number | null>;
}

/**
 * 홀 진행 (타당·스킨스).
 * 저장 전 홀은 모두가 함께 입력하고(바로 공유), [N번 홀 저장]을 눌러야 확정돼 정산에 들어간다.
 * 저장된 홀은 잠기고 [수정] → 취소/저장으로만 고친다(수정 내역이 남음). 마지막 홀까지 저장하면 방장이 최종 확정.
 * 아래 바에 이 홀의 상태(저장 전·저장됨·수정 중)와 버튼(저장·수정·취소/저장·최종 확정)을 함께 둔다.
 * onBusyChange: 홀 수정·내 기록 초안이 열려 있는 동안 true (상단 버튼을 잠가 다른 화면으로 못 가게)
 */
export default function GameScreen({
  session,
  onFinish,
  onShowResult,
  onBusyChange,
}: {
  session: Session;
  /** 방장: 최종 확정 */
  onFinish: () => void;
  /** 정산 결과 보기 */
  onShowResult: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { config, holes, currentHole: idx, goHole, setPar, setScore, status, holeSave } = session;
  const { myUid, activeRoundId } = useRound();
  /** 펼친 iPhone Duo (왼쪽 정산 · 오른쪽 홀 진행) */
  const split = useUnfolded();
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
  // 수정: 라운드 중엔 저장된 홀을 누구나, 종료 후엔 방장이 어느 홀이든 (홀 저장 전에 끝난 예전 라운드도)
  const canEdit = playing ? holeSave && saved : status === "done" && session.isHost;
  const view: HoleScore = editing ? { ...hole, par: draft.par, scores: draft.scores } : hole;
  const inputOn = live || editing;
  const filled = config.players.filter((p) => view.scores[p.id] != null).length;
  const allIn = filled === config.players.length;
  const missing = config.players.filter((p) => view.scores[p.id] == null);
  /** 저장 버튼: 누가 남았는지 (두 명까지는 이름, 그 이상은 인원) */
  const missingLabel =
    missing.length <= 2
      ? `${missing.map((p) => p.name || "?").join("·")} 입력하면 저장`
      : `${missing.length}명 더 입력하면 저장`;
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

  // ---- 초안 보관: 폰이 잠기거나 앱이 다시 띄워져도 저장 안 한 수정·내 기록이 남게 ----
  /** 다시 열었을 때 되살릴 초안 (그 홀로 옮긴 뒤 채운다) */
  const restore = useRef<StoredDraft | null>(
    (() => {
      const d = loadDraft(activeRoundId);
      return d && (d.kind === "edit" || d.kind === "rec") ? d : null;
    })()
  );
  const restoreTries = useRef(0);
  useEffect(() => {
    const d = restore.current;
    if (!d) return;
    if (d.hole !== idx) {
      // 처음 열 때 정해지는 홀(저장 안 된 첫 홀)보다 늦게 옮겨야 해서 몇 번 다시 시도한다
      if (restoreTries.current++ < 3 && d.hole < holes.length) goHole(d.hole);
      else restore.current = null;
      return;
    }
    restore.current = null;
    if (d.kind === "edit") {
      if ((hole.version ?? 0) !== d.version) {
        clearDraft(activeRoundId);
        session.setNotice(`그 사이 다른 사람이 ${idx + 1}번 홀을 고쳐서, 저장하지 않은 수정은 버렸어요`);
        return;
      }
      const v = d.data as { par: ParValue; scores: Record<string, number | null> };
      setDraft({ hole: idx, version: d.version ?? 0, par: v.par, scores: v.scores });
    } else {
      setRec(d.data as HoleStat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);
  useEffect(() => {
    if (restore.current) return;
    if (draft) {
      saveDraft({
        roundId: activeRoundId ?? "",
        kind: "edit",
        hole: draft.hole,
        version: draft.version,
        data: { par: draft.par, scores: draft.scores },
      });
    } else if (rec && recDirty) {
      saveDraft({ roundId: activeRoundId ?? "", kind: "rec", hole: idx, data: rec });
    } else {
      clearDraft(activeRoundId);
    }
  }, [draft, rec, recDirty, idx, activeRoundId]);

  const busy = editing || recDirty;
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  // ---- 이동: 진행 중엔 저장 안 된 첫 홀까지만, 초안이 있으면 못 옮긴다 ----
  const maxIdx = holeSave && playing && !allSaved ? frontier : lastIdx;
  const go = (i: number) => {
    if (!busy && i >= 0 && i <= maxIdx) goHole(i);
  };

  /** 홀이 저장돼 넘어왔을 때 상태 줄에 잠깐 띄우는 한 줄 (팝업 아님) */
  const [moved, setMoved] = useState<{ hole: number; text: string } | null>(null);
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(null), 3000);
    return () => clearTimeout(t);
  }, [moved]);
  /** 다른 사람 저장으로 홀이 바뀐 직후엔 잠깐 점수 터치를 받지 않는다 (누르던 손가락이 다음 홀을 찍지 않게) */
  const lockUntil = useRef(0);
  // 홀이 바뀌면 맨 위로 (홀 번호와 상태 줄이 보이게). 펼친 화면은 홀 진행 칸만
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector(".split-pane.game")?.scrollTo(0, 0);
  }, [idx]);

  // 보고 있던 홀이 (다른 사람에 의해) 저장되면 저장 안 된 첫 홀로 따라간다. 앞 홀을 다시 보는 중이면 그대로
  const seen = useRef<{ idx: number; saved: boolean } | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const prev = seen.current;
    seen.current = { idx, saved };
    if (!holeSave || !playing || !prev || prev.idx !== idx || prev.saved || !saved) return;
    if (busyRef.current) return;
    const f = firstUnsaved(holes);
    const to = f < 0 ? lastIdx : f;
    if (hole.savedBy && hole.savedBy !== myUid) {
      lockUntil.current = Date.now() + 600;
      const by = nameOf(hole.savedBy)?.name || "?";
      setMoved({ hole: to, text: `${by}님이 ${idx + 1}번 홀 저장${to !== idx ? ` → ${to + 1}번 홀` : ""}` });
    }
    goHole(to);
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
  const isCaddie = config.gameMode === "caddie";
  const isRank = config.gameMode === "rank";
  const rank = isRank ? rankRules(config) : null;
  /** 타당 계산(배판·이월·이번 홀 정산)을 쓰는 방식: 타당, 등수 내기 포인트(1타 = 1점) */
  const strokeLike = config.gameMode === "stroke" || rank?.method === "points";
  const betCfg = useMemo(() => (isRank ? pointsConfig(config) : config), [isRank, config]);
  const settled = useMemo(() => settledHoles(holes), [holes]);
  const preview = useMemo(
    () => settled.map((h, j) => (j === idx ? view : h)),
    [settled, idx, view]
  );
  const carries = useMemo(
    () => carryMultipliers(preview, betCfg.players, betCfg.rules),
    [preview, betCfg.players, betCfg.rules]
  );
  const carry = carries[idx] ?? 1;
  const nextCarry = idx < lastIdx ? carries[idx + 1] : null;
  const game = useMemo(
    () => holeNet(view, betCfg.players, betCfg.unit, betCfg.rules, carry),
    [view, betCfg, carry]
  );
  const birdie = useMemo(
    () => birdieHoleNet(view, betCfg.players, betCfg.unit, betCfg.rules, carry),
    [view, betCfg, carry]
  );

  // 스킨스 라운드는 배판·버디 추가 정산 없이 스킨으로만 정산한다 (등수 내기 스킨스는 개수만)
  const isSkins = config.gameMode === "skins" || rank?.method === "skins";
  const skinsCfg = useMemo(() => (isRank ? { ...config, unit: 1 } : config), [isRank, config]);
  const skins = useMemo(() => (isSkins ? skinsResult(skinsCfg, preview) : null), [isSkins, skinsCfg, preview]);
  const skinsSettled = useMemo(
    () => (isSkins ? skinsResult(skinsCfg, settled) : null),
    [isSkins, skinsCfg, settled]
  );
  // 캐디피: 이번 홀은 입력 중인 값으로, 낸 돈 누적은 저장된 홀로
  const caddie = useMemo(() => (isCaddie ? caddieResult(config, preview) : null), [isCaddie, config, preview]);
  const caddieSettled = useMemo(() => (isCaddie ? caddieResult(config, settled) : null), [isCaddie, config, settled]);
  const cHole = caddie?.holes[idx] ?? null;
  // 등수: 저장된 홀로 매긴 지금 순위
  const rankNow = useMemo(() => (isRank ? rankResult(config, settled) : null), [isRank, config, settled]);
  const skin = skins?.holes[idx] ?? null;
  const skinTransfers = useMemo(() => (skin ? settleNet(skin.net) : []), [skin]);

  const running = useMemo(() => {
    if (skinsSettled) return skinsSettled.net;
    const net: Record<string, number> = {};
    for (const p of config.players) net[p.id] = 0;
    // 캐디피·등수 내기는 누적 금액 대신 낸 캐디피·순위를 보여 준다
    if (isCaddie || isRank) return net;
    const settledCarries = carryMultipliers(settled, config.players, config.rules);
    settled.forEach((h, j) => {
      const c = settledCarries[j] ?? 1;
      const g = holeNet(h, config.players, config.unit, config.rules, c).net;
      const b = birdieHoleNet(h, config.players, config.unit, config.rules, c).net;
      for (const id of Object.keys(net)) net[id] += g[id] + b[id];
    });
    return net;
  }, [skinsSettled, settled, config, isCaddie, isRank]);

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
    if (Date.now() < lockUntil.current) return;
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
    if (Date.now() < lockUntil.current) return;
    // 저장 전 홀은 모두가 함께 입력하므로, 같은 값을 다시 눌러도(확인하려고·두 번 눌림) 지우지 않는다.
    // 지우기는 수정 초안에서만 같은 값을 다시 눌러서
    if (live && view.scores[pid] === s) return;
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
    if (idx < lastIdx) {
      setMoved({ hole: idx + 1, text: `✓ ${idx + 1}번 홀 저장 → ${idx + 2}번 홀` });
      goHole(idx + 1);
    }
  };
  const startEdit = () => {
    setRec(null);
    setDraft({ hole: idx, version: hole.version ?? 0, par: hole.par, scores: { ...hole.scores } });
  };
  const editItems = editing
    ? holeEditItems(idx, hole, view, (id) => nameOf(id)?.name || "?")
    : [];
  const saveEdit = () => {
    if (!editing || !allIn || editItems.length === 0) return;
    // 수정을 시작할 때의 version 으로 보낸다: 그 사이 다른 사람이 고쳤으면 서버가 거절하고 알려 준다
    session.saveHole(idx, view.par, fullScores(), editItems, draft.version);
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
  // 이 홀 상태 한 줄 (PAR 위 고정 자리)
  // 다 저장했으면 마지막 홀에서 확정. 펼친 화면은 정산 칸 아래 확정이 없으니 어느 홀에서든
  const lastAllSaved = playing && allSaved && (idx === lastIdx || split);
  /** 저장된 홀을 볼 때 아래 가운데 안내 */
  const savedHint = lastAllSaved
    ? session.isHost
      ? "최종 확정"
      : "방장이 확정하면 끝나요"
    : status === "done"
    ? "정산 결과 보기"
    : playing && !allSaved && idx < frontier
    ? `${frontier + 1}번 홀로`
    : "";
  const barStatus: [kind: string, text: string] = moved && moved.hole === idx && !editing && !recDirty
    ? ["saved", moved.text]
    : editing
    ? ["editing", "수정 중 · 저장하면 수정 내역에 남아요"]
    : recDirty
    ? ["draft", "내 기록 입력 중"]
    : status === "done"
    ? saved
      ? ["done", session.isHost ? "최종 확정 · 고칠 홀은 수정을 눌러요" : "최종 확정 · 방장만 고칠 수 있어요"]
      : ["empty", "저장 안 된 홀 · 정산에서 빠졌어요"]
    : !saved
    ? ["draft", `저장 전 · ${filled}/${config.players.length}명 입력`]
    : pending
    ? ["wait", session.pendingSaves ? "저장 대기 · 연결되면 올라가요" : "저장 중…"]
    : lastAllSaved
    ? ["saved", session.isHost ? "✓ 모든 홀 저장됨 · 최종 확정을 눌러 주세요" : "✓ 모든 홀 저장됨 · 방장이 최종 확정하면 끝나요"]
    : ["saved", `✓ ${(hole.version ?? 0) > 1 ? "수정됨" : "저장됨"}${hole.savedAt ? ` · ${savedLine()}` : ""}`];

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
              <span className="pending"> · 저장 대기 {session.pendingSaves}개 홀</span>
            )}
          </div>
        </div>
        <button
          className="navbtn"
          disabled={idx >= maxIdx || busy}
          onClick={() => go(idx + 1)}
        >
          <Icon name="chevronRight" size={22} />
        </button>
      </div>

      {/* 아래 버튼 줄 자리를 늘 비워 둔다 (버튼이 바뀌어도 화면이 밀리지 않게) */}
      <div className="sheet bar-space">
        {/* 이 홀 상태: PAR 위 늘 같은 자리. 알림(다른 사람이 저장함 등)은 잠시 그 위에 겹쳐 뜬다 */}
        <div className="status-slot">
          <div className={`hole-status ${barStatus[0]}`} role="status">
            {barStatus[1]}
          </div>
          {session.notice && (
            <div className="notice-bar" role="alert">
              <span>{session.notice}</span>
              <button aria-label="알림 닫기" onClick={() => session.setNotice(null)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
        </div>
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

        {rankNow && <RankBoard result={rankNow} players={config.players} myUid={myUid ?? ""} />}

        {caddie && cHole ? (
          <CaddieCard hole={cHole} result={caddie} players={config.players} isLast={idx === lastIdx} />
        ) : skins && skin ? (
          <>
            {/* key: 홀을 옮기거나 승부가 나면 카드 애니메이션을 다시 재생 */}
            <SkinPot
              key={`${idx}-${skin.status}`}
              hole={skin}
              next={skins.holes[idx + 1] ?? null}
              unit={config.unit}
              players={config.players}
              isLast={idx === lastIdx}
              countOnly={isRank}
            />
            <SkinStrip holes={skins.holes} current={idx} players={config.players} onPick={go} />
          </>
        ) : !strokeLike || (rank && !rank.multipliers) ? null : game.allTie ? (
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
            // 캐디피: 이 홀 꼴찌 표시 / 등수: 지금 순위
            const cdLast = cHole?.status === "paid" && cHole.payerId === p.id;
            const myRank = rankNow?.order.find((r) => r.id === p.id);
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
                  {(live || editing) && rel == null && <span className="miss-chip">미입력</span>}
                  {skinWin && skin && (
                    <span className="win-badge">
                      <Icon name="trophy" size={12} />
                      {skin.status === "split" ? "나눔" : `스킨 ${skin.skins}`}
                    </span>
                  )}
                  {cdLast && <span className="win-badge loss">꼴찌</span>}
                  {caddieSettled ? (
                    <span className={`pnet ${caddieSettled.paid[p.id] > 0 ? "neg" : ""}`}>
                      <small>캐디피</small> {won(caddieSettled.paid[p.id])}
                    </span>
                  ) : rankNow && rank && myRank ? (
                    <span className="pnet">
                      <small>{myRank.rank}위</small> {rankScoreText(rank.method, myRank.score)}
                    </span>
                  ) : (
                    <span className={`pnet ${net > 0 ? "pos" : net < 0 ? "neg" : ""}`}>
                      <small>누적</small> {net === 0 ? "±0" : wonSigned(net)}
                    </span>
                  )}
                </div>
                <div
                  className={`score-grid main-score ${inputOn ? "" : "locked"}`}
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

        {isCaddie && cHole ? (
          <>
            <div className="section-title">이번 홀 캐디피{previewNote}</div>
            {cHole.status === "paid" ? (
              <CaddiePayRow
                player={config.players.find((p) => p.id === cHole.payerId)}
                amount={cHole.stake}
                note={cHole.carryCount > 0 ? `(${cHole.carryCount}홀 넘어옴)` : undefined}
              />
            ) : (
              <div className="card">
                <div className="empty-note">
                  {cHole.practice
                    ? "연습 홀이라 내는 돈이 없어요."
                    : cHole.status === "carried"
                    ? idx === lastIdx
                      ? "마지막 홀이 공동 꼴찌라, 끝나면 남은 돈을 모두 나눠 내요."
                      : "공동 꼴찌라 이 홀 돈은 다음 홀로 넘어가요."
                    : holeSave
                    ? "스코어를 모두 입력하면 꼴찌를 보여줘요. 저장해야 캐디피에 들어가요."
                    : "스코어를 모두 입력하면 꼴찌를 보여줘요."}
                </div>
              </div>
            )}
          </>
        ) : isRank ? (
          // 등수 내기: 포인트 방식만 이번 홀 포인트를 보여 준다 (스킨스는 위 카드, 핸디 타수는 순위로)
          rank?.method === "points" && (
            <>
              <div className="section-title">이번 홀 포인트{previewNote}</div>
              <div className="card">
                {config.players.map((p) => {
                  const pt = (game.net[p.id] ?? 0) + (rank.multipliers ? birdie.net[p.id] ?? 0 : 0);
                  return (
                    <div className="gplayer" key={p.id} style={{ justifyContent: "space-between" }}>
                      <span className="gp-name">
                        <Avatar photoUrl={p.photoUrl} gender={p.gender} size={22} />
                        <b>{p.name || "?"}</b>
                      </span>
                      <span className={`pnet ${pt > 0 ? "pos" : pt < 0 ? "neg" : ""}`}>
                        {view.scores[p.id] == null ? "–" : rankScoreText("points", pt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )
        ) : (
        <>
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

      {/* ---- 아래 줄: 가운데 안내 글자·글자 버튼, 오른쪽 동그라미 주 버튼. 늘 같은 자리 ---- */}
      {editing ? (
        <PlayBar
          unsaved
          action={<DockButton label="저장" disabled={!allIn || editItems.length === 0} onClick={saveEdit} />}
        >
          <button className="pb-link" onClick={() => setDraft(null)}>
            취소
          </button>
          <span className="pb-hint">
            {!allIn ? "모두 입력해 주세요" : editItems.length === 0 ? "바뀐 게 없어요" : `${idx + 1}번 홀 수정 저장`}
          </span>
        </PlayBar>
      ) : recDirty ? (
        <PlayBar unsaved action={<DockButton label="저장" disabled />}>
          <span className="pb-hint">내 기록을 저장하거나 취소해 주세요</span>
        </PlayBar>
      ) : live ? (
        <PlayBar action={<DockButton label="저장" disabled={!allIn} onClick={saveHole} />}>
          <span className="pb-hint">{allIn ? `${idx + 1}번 홀 저장` : missingLabel}</span>
        </PlayBar>
      ) : (
        // 저장된 홀: 오른쪽은 최종 확정(방장) · 정산 결과(끝난 라운드) · 다음 입력할 홀로
        <PlayBar
          action={
            lastAllSaved && session.isHost ? (
              <DockButton label="확정" onClick={onFinish} />
            ) : status === "done" ? (
              <DockButton label="정산" onClick={onShowResult} />
            ) : playing && !allSaved && idx < frontier ? (
              <DockButton label="다음" onClick={() => go(frontier)} />
            ) : undefined
          }
        >
          {canEdit && (
            <button className="pb-link" onClick={startEdit}>
              수정
            </button>
          )}
          {savedHint ? <span className="pb-hint">{savedHint}</span> : null}
        </PlayBar>
      )}
    </>
  );
}
