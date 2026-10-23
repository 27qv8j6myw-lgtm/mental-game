import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { useRound } from "../round";
import { useBack } from "../back";
import { digestRecords, loadRecordRounds, type RecordRound } from "../recordStats";
import { GAME_MODE_LABEL, relLabel, teeLabel } from "../util";
import { Icon } from "../icons";
import TopBar, { BackButton, NoticeButton } from "./TopBar";
import PaneHead, { LogoHead } from "./PaneHead";
import { useUnfolded } from "../rail";
import RecDate from "./RecDate";
import { RecordAnalysis, RecordScorecard } from "./RecordAnalysis";
import { RatingLines } from "./CourseDifficulty";
import TrendChart from "./TrendChart";
import { aggregate, trendSeries, type TrendKey } from "../recordTrend";
import ShareImageSheet from "./ShareImageSheet";
import { courseTitle, renderScorecard } from "../shareImage";
import { InsightAction, InsightSummary, useAiAccess, useRoundInsight } from "./Insight";
import { buildInsightInput, insightFingerprint, isSameCourse } from "../insight";
import { saveGreenSpeed } from "../greenSpeed";
import { YearReviewEntry } from "./YearReview";
import { GreenSpeedButton } from "./GreenSpeed";

const one = (v: number | null) => (v == null ? "–" : (Math.round(v * 10) / 10).toFixed(1));

/** 묶어 볼 기간: 전체 / 연도별 / 월별 */
type Scope = "all" | "year" | "month";
const SCOPES: [Scope, string][] = [
  ["all", "전체"],
  ["year", "연도별"],
  ["month", "월별"],
];
/** 2026-10-20 → "2026"(연도) / "2026-10"(월) */
const periodKey = (date: string, scope: Scope) => (scope === "year" ? date.slice(0, 4) : date.slice(0, 7));
/** "2026" → "2026년", "2026-10" → "2026년 10월" */
const periodLabel = (key: string) =>
  key.length === 4 ? `${key}년` : `${key.slice(0, 4)}년 ${Number(key.slice(5, 7))}월`;

const digest = digestRecords;

/** 라운드를 열었다 돌아왔을 때 보던 기간을 그대로 보여주려고 기억해 둔다. 화면을 닫으면 지운다 */
let lastView: { scope: Scope; period: string | null } = { scope: "all", period: null };

/** 라운드 기록: 내 기록 모드 라운드를 전체·연도별·월별로 합친 분석 + 라운드 목록 (누르면 그 라운드 기록 분석) */
export default function RecordStatsScreen({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { openRound } = useRound();
  const myUid = user?.uid ?? "";
  const [rounds, setRounds] = useState<RecordRound[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScopeState] = useState<Scope>(lastView.scope);
  const [period, setPeriodState] = useState<string | null>(lastView.period);
  const setScope = (v: Scope) => {
    lastView = { scope: v, period: null };
    setScopeState(v);
    setPeriodState(null);
  };
  const setPeriod = (v: string) => {
    lastView = { scope, period: v };
    setPeriodState(v);
  };
  const close = () => {
    lastView = { scope: "all", period: null };
    onClose();
  };
  /** 상세 화면 그린스피드 저장 → 목록 값도 바로 바꾼다 */
  const setGreenSpeed = async (roundId: string, v: number | null) => {
    await saveGreenSpeed(roundId, v);
    setRounds((rs) => rs?.map((x) => (x.roundId === roundId ? { ...x, greenSpeed: v } : x)) ?? rs);
  };

  useEffect(() => {
    if (!myUid) return;
    loadRecordRounds(myUid)
      .then(setRounds)
      .catch((e) => {
        console.error(e);
        setErr("라운드 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      });
  }, [myUid]);

  // 기간별 묶음 (최근 순). 고른 기간이 없으면 가장 최근 기간
  const periods = useMemo(() => {
    if (!rounds || scope === "all") return [];
    const map = new Map<string, RecordRound[]>();
    for (const r of rounds) {
      const k = periodKey(r.date, scope);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rs]) => ({ key, rounds: rs, d: digest(rs) }));
  }, [rounds, scope]);
  const activeKey =
    scope === "all" ? null : periods.some((p) => p.key === period) ? period : periods[0]?.key ?? null;
  const shown =
    scope === "all" ? rounds ?? [] : periods.find((p) => p.key === activeKey)?.rounds ?? [];
  const d = useMemo(() => digest(shown), [shown]);
  // 추이: 평균 타수·보정타수·분석 칸을 누르면 그 아래에 라운드별 그래프 (같은 칸을 다시 누르면 접힘)
  const [trendKey, setTrendKey] = useState<TrendKey | null>(null);
  const pickTrend = (k: TrendKey) => setTrendKey((cur) => (cur === k ? null : k));
  // 점 하나: 월별은 라운드 하나, 전체·연도별은 한 달 평균 (한 달치뿐이면 라운드별)
  // 월별은 라운드가 적어서 바로 앞 기록 달의 라운드도 흐리게 함께 보여준다
  const prevPeriod =
    scope === "month" ? periods[periods.findIndex((p) => p.key === activeKey) + 1] ?? null : null;
  const series = trendKey
    ? trendSeries(shown, trendKey, scope === "month" ? "round" : "month", prevPeriod?.rounds ?? [])
    : null;
  const chart =
    trendKey && series ? (
      <TrendChart
        key={`${trendKey}-${scope}-${activeKey}`}
        k={trendKey}
        points={series.points}
        unit={series.unit}
        overall={aggregate(shown, trendKey)}
        beforeLabel={
          prevPeriod
            ? prevPeriod.key.slice(0, 4) === activeKey?.slice(0, 4)
              ? `${Number(prevPeriod.key.slice(5, 7))}월`
              : periodLabel(prevPeriod.key)
            : undefined
        }
      />
    ) : null;
  const summaryTrend = trendKey === "strokes" || trendKey === "diff";
  // 내기 라운드는 정산 화면 대신 이 화면 안에서 내 기록 분석을 연다
  const [detailId, setDetailId] = useState<string | null>(null);
  const split = useUnfolded();
  // 기기 뒤로가기: 내기 라운드 분석 → 목록
  useBack(!!detailId, () => setDetailId(null));
  const detail = rounds?.find((r) => r.roundId === detailId) ?? null;
  const openDetail = (r: RecordRound) => {
    if (r.gameMode === "record") openRound(r.roundId);
    else {
      setDetailId(r.roundId);
      window.scrollTo(0, 0);
      document.querySelector(".split-pane.rec-left")?.scrollTo(0, 0);
    }
  };

  if (detail && !split)
    return (
      <RoundDetail
        r={detail}
        all={rounds ?? []}
        onBack={() => setDetailId(null)}
        onGreenSpeed={(v) => setGreenSpeed(detail.roundId, v)}
      />
    );

  const status = (
    <>
      {err && (
        <div className="card">
          <div className="empty-note" style={{ color: "var(--loss)" }}>
            {err}
          </div>
        </div>
      )}
      {!rounds && !err && (
        <div className="card">
          <div className="empty-note">불러오는 중…</div>
        </div>
      )}
      {rounds && rounds.length === 0 && (
        <div className="card">
          <div className="empty-note">
            아직 끝낸 기록 라운드가 없어요. 라운드 만들기에서 게임 방식을 '기록'으로 고르면 쌓여요.
          </div>
        </div>
      )}
    </>
  );
  // 기간 고르기 · 요약 · 추이 · 분석
  const analysis = rounds && rounds.length > 0 && (
    <>
      <div className="segmented" style={{ marginBottom: 14 }}>
        {SCOPES.map(([k, label]) => (
          <button key={k} className={scope === k ? "active" : ""} onClick={() => setScope(k)}>
            {label}
          </button>
        ))}
      </div>

      {/* 연도별·월별: 기간마다 요약, 누르면 그 기간 분석 */}
      {scope !== "all" && (
        <div className="card st-list">
          {periods.map((p) => (
            <button
              key={p.key}
              className={`st-row ${p.key === activeKey ? "rr-on" : ""}`}
              onClick={() => setPeriod(p.key)}
            >
              <span className="st-row-main">
                <span className="st-row-name">{periodLabel(p.key)}</span>
                <span className="st-row-sub">
                  {p.d.count}라운드
                  {p.d.putts != null && ` · 퍼트 ${one(p.d.putts)}`}
                  {p.d.all.gir.rate != null && ` · GIR ${Math.round(p.d.all.gir.rate * 100)}%`}
                  {p.d.avgDiff != null && ` · 보정 ${one(72 + p.d.avgDiff)}`}
                </span>
              </span>
              <span className="st-row-amt">{p.d.avg == null ? "–" : `${one(p.d.avg)}타`}</span>
            </button>
          ))}
        </div>
      )}

      {scope !== "all" && activeKey && (
        <div className="section-title" style={{ marginTop: 20 }}>
          {periodLabel(activeKey)}
        </div>
      )}
      <div className="card rr-sum">
        <button
          className={`rr-total rr-pick ${trendKey === "strokes" ? "on" : ""}`}
          aria-pressed={trendKey === "strokes"}
          onClick={() => pickTrend("strokes")}
        >
          <b>{d.avg == null ? "–" : one(d.avg)}</b>
          <span>평균 타수</span>
          <em>{trendKey === "strokes" ? "추이 접기 ▴" : "추이 ▾"}</em>
        </button>
        <div className="st-golf">
          <span>
            <b>{d.count}</b>라운드
          </span>
          <span>
            베스트 <b>{d.best ?? "–"}</b>
            {d.best != null && "타"}
          </span>
          <span>
            라운드당 퍼트 <b>{one(d.putts)}</b>
          </span>
        </div>
        {d.avgDiff != null && (
          <button
            className={`rr-adj rr-pick ${trendKey === "diff" ? "on" : ""}`}
            aria-pressed={trendKey === "diff"}
            onClick={() => pickTrend("diff")}
          >
            {/* 보정타수는 파 72에 더해 타수처럼 보여준다 (예: 8.4 → 80.4타) */}
            <div className="rr-adj-main">
              <span>
                평균 보정타수 (파 72 기준) <em>{trendKey === "diff" ? "▴" : "▾"}</em>
              </span>
              <b>{one(72 + d.avgDiff)}타</b>
            </div>
            <div className="rr-adj-sub">
              파 72 + 보정타수 {one(d.avgDiff)}
              <span className="rr-adj-formula">보정타수 = (타수 − 코스레이팅) × 113 ÷ 슬로프</span>
            </div>
          </button>
        )}
      </div>
      {summaryTrend && chart}

      <div className="section-title">
        분석 ({scope === "all" || !activeKey ? "전체 라운드" : periodLabel(activeKey)})
      </div>
      <p className="hint trend-hint">칸을 누르면 추이를 그래프로 볼 수 있어요.</p>
      <RecordAnalysis
        s={d.all}
        rounds={d.count}
        trend={{ active: trendKey, onPick: pickTrend, chart: summaryTrend ? null : chart }}
      />
    </>
  );
  // 라운드별 기록 목록
  const list = rounds && rounds.length > 0 && (
    <div className="card st-list">
      {shown.map((r) => {
        return (
          <button
            className={`st-rec st-rec-btn ${split && r.roundId === detailId ? "rr-on" : ""}`}
            key={r.roundId}
            onClick={() => openDetail(r)}
          >
            <RecDate date={r.date} />
            <span className="st-row-main">
              <span className="st-row-name">
                <span className="ri-title">{r.courseName || "이름 없는 라운드"}</span>
                <span className={`mode-tag ${r.gameMode}`}>{GAME_MODE_LABEL[r.gameMode]}</span>
              </span>
              {/* 퍼트 · FW · GIR. 18홀을 다 치지 않은 라운드만 홀 수를 앞에. 줄이 넘어가도 항목은 끊지 않는다 */}
              <span className="st-row-sub">
                {[
                  r.summary.holesPlayed !== 18 && `${r.summary.holesPlayed}홀`,
                  r.summary.putts != null && `퍼트 ${r.summary.putts}`,
                  r.summary.fairway.rate != null && `FW ${Math.round(r.summary.fairway.rate * 100)}%`,
                  r.summary.gir.rate != null && `GIR ${Math.round(r.summary.gir.rate * 100)}%`,
                ]
                  .filter((v): v is string => !!v)
                  .map((v, i, all) => (
                    // 가운뎃점은 앞 항목에 붙여, 줄이 넘어가도 새 줄이 점으로 시작하지 않게
                    <span key={v}>
                      <span className="nw">
                        {v}
                        {i < all.length - 1 && " ·"}
                      </span>
                      {i < all.length - 1 && " "}
                    </span>
                  ))}
              </span>
            </span>
            {/* 타수는 오른쪽, 파 대비는 고정 폭: 줄마다 '타' 자리가 같다 */}
            <span className="st-row-amt st-rec-score">
              <span className="s">{r.summary.strokes}타</span>
              <small className="rr-rel">{relLabel(r.summary.toPar)}</small>
            </span>
            <Icon name="chevronRight" size={16} className="st-row-go" />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="app">
      <TopBar left={<BackButton onClick={close} />} right={<NoticeButton />} />

      {split ? (
        // 펼친 iPhone Duo: 왼쪽 분석까지 · 오른쪽 라운드별 기록
        <div className="split-view">
          <div className="split-pane rec-left">
            {/* 내기 라운드를 누르면 이 칸에 그 라운드 내 기록 (오른쪽 목록은 그대로) */}
            {detail ? (
              <RoundDetail
                embedded
                r={detail}
                all={rounds ?? []}
                onBack={() => setDetailId(null)}
                onGreenSpeed={(v) => setGreenSpeed(detail.roundId, v)}
              />
            ) : (
              <>
                <LogoHead />
                <div className="sheet results">
                  {status}
                  {analysis}
                </div>
              </>
            )}
          </div>
          <div className="split-pane">
            <PaneHead title="라운드별 기록" />
            <div className="sheet results">
              {/* 올해의 골프 결산: 라운드별 기록 바로 위 */}
              <YearReviewEntry />
              {list}
            </div>
          </div>
        </div>
      ) : (
        <div className="sheet results">
          <h2 className="page-title">라운드 기록</h2>
          {status}
          {analysis}
          {/* 올해의 골프 결산: 라운드별 기록 바로 위 */}
          <YearReviewEntry />
          {list && (
            <>
              <div className="section-title">라운드별 기록 {shown.length}개</div>
              {list}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 내기 라운드 하나의 내 기록 분석 (정산은 정산 결과 화면에서 본다) */
function RoundDetail({
  r,
  all,
  onBack,
  onGreenSpeed,
  embedded = false,
}: {
  r: RecordRound;
  /** 내 기록 라운드 전체 (AI 분석의 평소 기록) */
  all: RecordRound[];
  onBack: () => void;
  /** 그린스피드 넣기·고치기 (내가 친 라운드라 누구나) */
  onGreenSpeed: (v: number | null) => Promise<void>;
  /** 펼친 iPhone Duo: 왼쪽 칸 안에 (위 바 대신 로고 머리, 오른쪽 칸에는 라운드별 기록이 그대로) */
  embedded?: boolean;
}) {
  const tee = teeLabel(r.courseTee);
  const { user } = useAuth();
  const [sharing, setSharing] = useState(false);
  // AI 분석 (관리자·허용된 사람): 이 라운드의 내 기록 + 다른 라운드 평균 + 같은 코스 평균
  const { ai: canAi } = useAiAccess(user?.uid);
  const past = all.filter((x) => x.roundId !== r.roundId);
  const here = { name: r.courseName, rating: r.rating, holeCount: r.holeCount };
  const ai = useRoundInsight({
    roundId: r.roundId,
    playerUid: user?.uid ?? "",
    enabled: canAi,
    fingerprint: insightFingerprint(r.holes),
    build: async () =>
      buildInsightInput(
        {
          date: r.date,
          course: courseTitle(r.courseName, r.rating),
          holeCount: r.holeCount,
          mode: GAME_MODE_LABEL[r.gameMode],
          differential: r.differential,
          greenSpeed: r.greenSpeed,
        },
        r.holes,
        past.map((x) => x.holes),
        past
          .filter((x) => isSameCourse(here, { name: x.courseName, rating: x.rating, holeCount: x.holeCount }))
          .map((x) => x.holes)
      ),
  });
  /** 내 스코어카드 이미지 (내기 라운드에서 남긴 내 기록도) */
  const makeScorecard = () =>
    renderScorecard({
      date: r.date,
      course: courseTitle(r.courseName, r.rating),
      tee: tee || undefined,
      player: user?.displayName?.trim() || "나",
      holes: r.holes.map((h) => ({
        par: h.par,
        strokes: h.rel == null ? null : h.par + h.rel,
        putts: h.putts,
        fairway: h.fairway,
        lie: h.lie,
        ob: h.ob,
        hazard: h.hazard,
        sand: h.sand,
      })),
      differential: r.differential,
      rating: r.ratingLabel,
      mode: r.gameMode,
    });
  const body = (
    <div className="sheet results">
      <h2 className="page-title">{r.courseName || "라운드 기록"}</h2>
      <div className="card rr-sum">
        {/* 날짜·티·게임 방식 */}
        <div className="rr-meta">
          {[r.date, tee].filter(Boolean).join(" · ")}
          <span className={`mode-tag ${r.gameMode}`}>{GAME_MODE_LABEL[r.gameMode]}</span>
          <GreenSpeedButton value={r.greenSpeed} onSave={onGreenSpeed} />
        </div>
        <div className="rr-total">
          <b>{r.summary.holesPlayed === 0 ? "–" : r.summary.strokes}</b>
          <span>타</span>
          {r.summary.holesPlayed > 0 && <em>{relLabel(r.summary.toPar)}</em>}
        </div>
        <div className="st-golf">
          <span>
            전반 <b>{r.summary.out ?? "–"}</b>
          </span>
          {r.holeCount > 9 && (
            <span>
              후반 <b>{r.summary.in ?? "–"}</b>
            </span>
          )}
          <span>
            퍼트 <b>{r.summary.putts ?? "–"}</b>
          </span>
          <span>
            {r.summary.holesPlayed}/{r.holeCount}홀
          </span>
        </div>
        {r.differential != null && (
          <div className="rr-adj">
            <div className="rr-adj-main">
              <span>보정타수</span>
              <b>{r.differential.toFixed(1)}</b>
            </div>
            {r.rating && <RatingLines rating={r.rating} sex={user?.gender === "female" ? "F" : "M"} />}
          </div>
        )}
      </div>
      <button className="btn-line wide share-btn" onClick={() => setSharing(true)}>
        <Icon name="share" size={17} />
        스코어카드 이미지로 공유·저장
      </button>
      {canAi && <InsightAction state={ai} />}
      <div className="section-title">분석</div>
      <RecordAnalysis s={r.summary} insight={canAi ? ai.insight ?? undefined : undefined} />
      <div className="section-title">스코어카드</div>
      <RecordScorecard holes={r.holes} />
      {canAi && <InsightSummary state={ai} />}
    </div>
  );
  const sheet = sharing && (
    <ShareImageSheet
      make={makeScorecard}
      fileName={`scorecard-${r.date || "round"}.png`}
      title="내 스코어카드"
      onClose={() => setSharing(false)}
    />
  );
  if (embedded)
    return (
      <>
        <LogoHead onBack={onBack} />
        {body}
        {sheet}
      </>
    );
  return (
    <div className="app">
      <TopBar left={<BackButton label="라운드 기록으로" onClick={onBack} />} right={<NoticeButton />} />
      {body}
      {sheet}
    </div>
  );
}
