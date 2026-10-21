import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { useRound } from "../round";
import { useBack } from "../back";
import { loadRecordRounds, summarize, type RecordRound } from "../recordStats";
import { GAME_MODE_LABEL, relLabel, teeLabel } from "../util";
import { Icon } from "../icons";
import { RecordAnalysis, RecordScorecard } from "./RecordAnalysis";

/** 2026-10-20 → 10/20 */
const md = (d: string) => {
  const [, m, day] = d.split("-");
  return m && day ? `${Number(m)}/${Number(day)}` : d;
};
const one = (v: number | null) => (v == null ? "–" : (Math.round(v * 10) / 10).toFixed(1));
const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

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

/** 라운드 묶음 요약: 평균·베스트·라운드당 퍼트는 18홀을 다 친 라운드만 (부분합을 섞지 않는다) */
function digest(rs: RecordRound[]) {
  const full = rs.filter((r) => r.holeCount === 18 && r.summary.holesPlayed === 18);
  // 보정타수: KGA 레이팅이 있는 18홀 라운드만
  const diffs = rs.map((r) => r.differential).filter((v): v is number => v != null);
  return {
    count: rs.length,
    avg: mean(full.map((r) => r.summary.strokes)),
    best: full.length ? Math.min(...full.map((r) => r.summary.strokes)) : null,
    putts: mean(full.map((r) => r.summary.putts).filter((v): v is number => v != null)),
    avgDiff: mean(diffs),
    all: summarize(rs.flatMap((r) => r.holes)),
  };
}

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
  // 내기 라운드는 정산 화면 대신 이 화면 안에서 내 기록 분석을 연다
  const [detailId, setDetailId] = useState<string | null>(null);
  // 기기 뒤로가기: 내기 라운드 분석 → 목록
  useBack(!!detailId, () => setDetailId(null));
  const detail = rounds?.find((r) => r.roundId === detailId) ?? null;
  const openDetail = (r: RecordRound) => {
    if (r.gameMode === "record") openRound(r.roundId);
    else {
      setDetailId(r.roundId);
      window.scrollTo(0, 0);
    }
  };

  if (detail) return <RoundDetail r={detail} onBack={() => setDetailId(null)} onClose={close} />;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="chart" size={18} />
          </span>
          라운드 기록
        </div>
        <button className="icon-btn" aria-label="닫기" onClick={close}>
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="sheet results">
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

        {rounds && rounds.length > 0 && (
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
              <div className="rr-total">
                <b>{d.avg == null ? "–" : one(d.avg)}</b>
                <span>평균 타수</span>
              </div>
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
                <div className="rr-adj">
                  {/* 보정타수는 파 72에 더해 타수처럼 보여준다 (예: 8.4 → 80.4타) */}
                  <div className="rr-adj-main">
                    <span>평균 보정타수 (파 72 기준)</span>
                    <b>{one(72 + d.avgDiff)}타</b>
                  </div>
                  <div className="rr-adj-sub">
                    파 72 + 보정타수 {one(d.avgDiff)} · 보정타수 = (타수 − 코스레이팅) × 113 ÷ 슬로프
                  </div>
                </div>
              )}
            </div>

            <div className="section-title">
              분석 ({scope === "all" || !activeKey ? "전체 라운드" : periodLabel(activeKey)})
            </div>
            <RecordAnalysis s={d.all} rounds={d.count} />

            <div className="section-title">라운드별 기록 {shown.length}개</div>
            <div className="card st-list">
              {shown.map((r) => {
                const tee = teeLabel(r.courseTee);
                return (
                  <button
                    className="st-rec st-rec-btn"
                    key={r.roundId}
                    onClick={() => openDetail(r)}
                  >
                    <span className="st-rec-date">{md(r.date)}</span>
                    <span className="st-row-main">
                      <span className="st-row-name">
                        <span className="ri-title">{r.courseName || "이름 없는 라운드"}</span>
                        <span className={`mode-tag ${r.gameMode}`}>{GAME_MODE_LABEL[r.gameMode]}</span>
                      </span>
                      <span className="st-row-sub">
                        {tee && `${tee} · `}
                        {r.summary.holesPlayed}홀
                        {r.summary.putts != null && ` · 퍼트 ${r.summary.putts}`}
                        {r.summary.gir.rate != null &&
                          ` · GIR ${Math.round(r.summary.gir.rate * 100)}%`}
                        {r.differential != null && ` · 보정 ${r.differential.toFixed(1)}`}
                      </span>
                    </span>
                    <span className="st-row-amt">
                      {r.summary.strokes}타
                      <small className="rr-rel"> {relLabel(r.summary.toPar)}</small>
                    </span>
                    <Icon name="chevronRight" size={16} className="st-row-go" />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 내기 라운드 하나의 내 기록 분석 (정산은 정산 결과 화면에서 본다) */
function RoundDetail({
  r,
  onBack,
  onClose,
}: {
  r: RecordRound;
  onBack: () => void;
  onClose: () => void;
}) {
  const tee = teeLabel(r.courseTee);
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="chart" size={18} />
          </span>
          {r.courseName || "라운드 기록"}
        </div>
        <button className="icon-btn" aria-label="닫기" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="sheet results">
        <button className="st-back" onClick={onBack}>
          <Icon name="chevronLeft" size={16} /> 라운드 기록
        </button>
        <div className="section-title">
          {r.date}
          {tee && ` · ${tee}`} · <span className={`mode-tag ${r.gameMode}`}>{GAME_MODE_LABEL[r.gameMode]}</span>
        </div>
        <div className="card rr-sum">
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
            </div>
          )}
        </div>
        <div className="section-title">분석</div>
        <RecordAnalysis s={r.summary} />
        <div className="section-title">스코어카드</div>
        <RecordScorecard holes={r.holes} />
      </div>
    </div>
  );
}
