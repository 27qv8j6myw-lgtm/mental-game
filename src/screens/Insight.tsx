import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { canUseAi, isAdmin } from "../admin";
import {
  loadInsight,
  readCachedInsight,
  requestInsight,
  saveInsight,
  type InsightSections,
} from "../insight";

/**
 * AI 분석 권한: admin(관리자 — 누구 기록이든) · ai(관리자 또는 관리자가 허용한 사람 — 내 기록).
 * 화면을 열 때마다 묻는다 (관리자가 방금 허용·해제한 것이 바로 반영되게)
 */
export function useAiAccess(uid: string | null | undefined) {
  const [access, setAccess] = useState({ admin: false, ai: false });
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void Promise.all([isAdmin(), canUseAi()]).then(([admin, ai]) => alive && setAccess({ admin, ai: admin || ai }));
    return () => {
      alive = false;
    };
  }, [uid]);
  return access;
}

/**
 * 한 라운드·한 사람의 AI 분석: 저장해 둔 것을 쓰고(이 기기 → 없으면 서버), 없으면 '만들기'로 새로 만든다.
 * 볼 때마다 다시 분석하지 않는다. fingerprint: 지금 기록 요약 (분석한 뒤 기록이 바뀌었는지 알려 준다)
 * build: 서버에 보낼 재료 (평소·같은 코스 기록을 불러와야 할 수 있어 비동기)
 */
export function useRoundInsight({
  roundId,
  playerUid,
  enabled,
  fingerprint,
  build,
}: {
  roundId: string | null;
  playerUid: string;
  enabled: boolean;
  fingerprint: string;
  build: () => Promise<unknown>;
}) {
  const [insight, setInsight] = useState<InsightSections | null>(null);
  const [savedPrint, setSavedPrint] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 서버 저장 실패(insight.sql 을 아직 실행하지 않았을 때 등). 이 기기에는 담겨 있다 */
  const [unsaved, setUnsaved] = useState(false);

  useEffect(() => {
    setInsight(null);
    setSavedPrint("");
    setErr(null);
    setUnsaved(false);
    if (!enabled || !roundId || !playerUid) return;
    const cached = readCachedInsight(roundId, playerUid);
    if (cached) {
      setInsight(cached.sections);
      setSavedPrint(cached.fingerprint);
      return;
    }
    let alive = true;
    void loadInsight(roundId, playerUid).then((saved) => {
      if (!alive || !saved) return;
      setInsight(saved.sections);
      setSavedPrint(saved.fingerprint);
    });
    return () => {
      alive = false;
    };
  }, [enabled, roundId, playerUid]);

  const generate = async () => {
    if (!roundId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { sections, model } = await requestInsight(await build());
      setInsight(sections);
      setSavedPrint(fingerprint);
      setUnsaved(!(await saveInsight(roundId, playerUid, sections, model, fingerprint)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "분석을 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  /** 분석한 뒤 기록(타수·퍼트·티샷 등)이 바뀌었다 */
  const stale = !!insight && !!savedPrint && savedPrint !== fingerprint;
  return { insight, busy, err, unsaved, stale, generate };
}

/** 칸 아래 붙는 AI 분석 문단 */
export function InsightBox({ text, title = "AI 인사이트" }: { text?: string; title?: string }) {
  if (!text) return null;
  return (
    <div className="insight-box">
      <div className="insight-head">
        <Icon name="spark" size={15} strokeWidth={2.2} />
        {title}
      </div>
      <p>{text}</p>
    </div>
  );
}

/** 분석 만들기 버튼 (분석이 있으면 숨기고, 종합 칸의 '다시 만들기'로) */
export function InsightAction({
  state,
}: {
  state: ReturnType<typeof useRoundInsight>;
}) {
  if (state.insight && !state.busy && !state.err) return null;
  return (
    <div className="insight-action">
      <button className="btn-line wide insight-btn" disabled={state.busy} onClick={() => void state.generate()}>
        {state.busy ? (
          <>
            <span className="sc-spin" aria-hidden="true" /> AI가 분석하는 중… (20초 소요 예정)
          </>
        ) : (
          <>
            <Icon name="spark" size={17} /> {state.insight ? "AI 분석 다시 만들기" : "AI 분석 만들기"}
          </>
        )}
      </button>
      {state.err && <div className="sc-err">{state.err}</div>}
    </div>
  );
}

/** 스코어카드 아래: 같은 코스 비교 · 종합 + 다시 만들기 */
export function InsightSummary({ state }: { state: ReturnType<typeof useRoundInsight> }) {
  if (!state.insight) return null;
  return (
    <>
      <InsightBox text={state.insight.course} title="AI 같은 코스 비교" />
      <InsightBox text={state.insight.summary} title="AI 종합" />
      <div className="insight-foot">
        {state.stale ? (
          <span className="stale">분석한 뒤 기록이 바뀌었어요</span>
        ) : (
          state.unsaved && <span>이 기기에만 저장됐어요 (insight.sql 실행 필요)</span>
        )}
        <button disabled={state.busy} onClick={() => void state.generate()}>
          {state.busy ? "다시 만드는 중…" : "다시 만들기"}
        </button>
      </div>
      {state.err && <div className="sc-err">{state.err}</div>}
    </>
  );
}
