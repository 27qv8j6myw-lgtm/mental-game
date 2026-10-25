import type { Frac, HoleRecord, RecordSummary } from "../recordStats";
import { girOf, HALF_LABEL, halfHoles, summarize, type Half } from "../recordStats";
import { relLabel } from "../util";
import { Icon } from "../icons";
import type { Fairway } from "../types";
import { useMemo, useState, type ReactNode } from "react";
import type { TrendKey } from "../recordTrend";
import type { InsightSections } from "../insight";
import { InsightBox } from "./Insight";

/** 0.333 → "33%". 분모가 0이면 "—" */
const pct = (f: Frac) => (f.rate == null ? "—" : `${Math.round(f.rate * 100)}%`);
const sub = (f: Frac, unit = "홀") => (f.d === 0 ? "기록 없음" : `${f.n}/${f.d}${unit}`);
const one = (v: number | null) => (v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1));

/** 칸을 누르면 그 지표의 라운드별 추이를 펼친다 (라운드 기록 화면에서만) */
export interface TrendPick {
  active: TrendKey | null;
  onPick: (k: TrendKey) => void;
  /** 고른 지표의 추이 그래프 (분석 칸 바로 아래에 둔다) */
  chart: ReactNode;
}

/** 전반 → 후반: 두 값과 바뀐 만큼 (좋아졌으면 good, 나빠졌으면 bad) */
interface Cmp {
  from: string;
  to: string;
  /** 바뀐 크기 ("14%p", "0.3"). 비교할 수 없으면 null */
  change: string | null;
  up: boolean;
  tone: "good" | "bad" | "same" | null;
}

/**
 * 전반·후반 값 비교. 보여 주는 자리(반올림한 값)로 견줘 "+0%p" 가 나오지 않게 한다.
 * higherBetter: 클수록 좋은 지표 (페어웨이·GIR·스크램블)
 */
function cmpOf(
  a: number | null,
  b: number | null,
  show: (v: number) => string,
  step: number,
  higherBetter: boolean,
  unit = ""
): Cmp {
  const from = a == null ? "—" : show(a);
  const to = b == null ? "—" : show(b);
  if (a == null || b == null) return { from, to, change: null, up: false, tone: null };
  const ra = Math.round(a / step);
  const rb = Math.round(b / step);
  if (ra === rb) return { from, to, change: "같아요", up: false, tone: "same" };
  const d = Math.abs(rb - ra) * step;
  const up = rb > ra;
  return {
    from,
    to,
    change: `${step < 1 ? d.toFixed(1) : d}${unit}`,
    up,
    tone: up === higherBetter ? "good" : "bad",
  };
}
const rateOf = (f: Frac) => (f.rate == null ? null : f.rate * 100);
const showPct = (v: number) => `${Math.round(v)}%`;

const ARROW_UP = (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
const ARROW_DOWN = (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </svg>
);

/** 비교 칸: 전반 값 → 후반 값, 아래에 화살표와 바뀐 만큼 (좋아지면 초록, 나빠지면 빨강) */
function CmpBody({ label, c }: { label: string; c: Cmp }) {
  return (
    <>
      <span className="rm-label">{label}</span>
      <span className="rm-cmp">
        <span className="rm-from">{c.from}</span>
        <span className="rm-to-ic" aria-label="에서">→</span>
        <b className="rm-value">{c.to}</b>
      </span>
      {c.change && (
        <span className={`rm-chg ${c.tone ?? ""}`}>
          {c.tone !== "same" && (c.up ? ARROW_UP : ARROW_DOWN)}
          {c.change}
          {c.tone === "good" ? " 좋아짐" : c.tone === "bad" ? " 나빠짐" : ""}
        </span>
      )}
    </>
  );
}

/** 지표 한 칸: 이름 · 큰 값 · 근거. 추이를 볼 수 있으면 누르는 칸. cmp 가 있으면 전반 → 후반 비교 */
function Metric({
  label,
  value,
  note,
  k,
  trend,
  cmp,
}: {
  label: string;
  value: string;
  note?: string;
  k?: TrendKey;
  trend?: TrendPick;
  cmp?: Cmp;
}) {
  if (cmp)
    return (
      <div className="rm-tile">
        <CmpBody label={label} c={cmp} />
      </div>
    );
  const body = (
    <>
      <span className="rm-label">{label}</span>
      <b className="rm-value">{value}</b>
      {note && <span className="rm-note">{note}</span>}
    </>
  );
  if (!trend || !k) return <div className="rm-tile">{body}</div>;
  const on = trend.active === k;
  return (
    <button className={`rm-tile rm-btn ${on ? "on" : ""}`} aria-pressed={on} onClick={() => trend.onPick(k)}>
      {body}
    </button>
  );
}

/**
 * 한 라운드를 전반·후반으로 나눠 보기 (내 기록 카드의 전반·후반 칩, 분석 옆 '전/후반 비교').
 * half: 고른 9홀 (all 이면 라운드 전체). holes·s: 그 9홀의 기록과 요약 (분석·스코어카드·AI 분석이 쓴다).
 * compare: 비교를 켰으면 전반·후반 요약 (라운드 전체를 볼 때만). 9홀 라운드는 나누지 않는다
 */
export function useHalfView(recs: HoleRecord[], holeCount: number, full?: RecordSummary) {
  const [pick, setPick] = useState<Half>("all");
  const [cmpOn, setCmpOn] = useState(false);
  const split = holeCount > 9;
  const half: Half = split ? pick : "all";
  const holes = useMemo(() => halfHoles(recs, half), [recs, half]);
  const s = useMemo(() => (half === "all" ? full ?? summarize(recs) : summarize(holes)), [half, full, recs, holes]);
  const parts = useMemo(
    () => (split ? { out: summarize(halfHoles(recs, "out")), in: summarize(halfHoles(recs, "in")) } : null),
    [split, recs]
  );
  const canCompare = !!parts && parts.out.holesPlayed > 0 && parts.in.holesPlayed > 0;
  const compareOn = canCompare && cmpOn && half === "all";
  return {
    split,
    half,
    holes,
    s,
    /** 전반·후반 칩: 다시 누르면 전체로. 비교는 끈다 */
    setHalf: (h: Half) => {
      setPick(h);
      setCmpOn(false);
    },
    canCompare,
    compareOn,
    compare: compareOn && parts ? parts : undefined,
    /** 비교를 켜면 라운드 전체로 돌아간다 */
    toggleCompare: () => {
      setCmpOn(!compareOn);
      setPick("all");
    },
  };
}
export type HalfView = ReturnType<typeof useHalfView>;

/** 내 기록 카드의 칩: 전반 · 후반(누르면 아래가 그 9홀로, 다시 누르면 전체) · 퍼트 · 친 홀 */
export function HalfChips({ s, holeCount, view }: { s: RecordSummary; holeCount: number; view: HalfView }) {
  const chip = (h: "out" | "in", v: number | null) => {
    const body = (
      <>
        {HALF_LABEL[h]} <b>{v ?? "–"}</b>
      </>
    );
    if (!view.split) return <span>{body}</span>;
    const on = view.half === h;
    return (
      <button className={`half-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => view.setHalf(on ? "all" : h)}>
        {body}
      </button>
    );
  };
  return (
    <div className="st-golf">
      {chip("out", s.out)}
      {view.split && chip("in", s.in)}
      <span>
        퍼트 <b>{s.putts ?? "–"}</b>
      </span>
      <span>
        {s.holesPlayed}/{holeCount}홀
      </span>
    </div>
  );
}

/** 섹션 제목 옆: 지금 보는 9홀 표시 · '전/후반 비교' 뱃지 */
export function HalfTitleTags({ view, compare = false }: { view: HalfView; compare?: boolean }) {
  return (
    <>
      {view.half !== "all" && <span className="half-tag">{HALF_LABEL[view.half]}</span>}
      {compare && view.canCompare && (
        <button
          className={`half-cmp ${view.compareOn ? "on" : ""}`}
          aria-pressed={view.compareOn}
          onClick={view.toggleCompare}
        >
          전/후반 비교
        </button>
      )}
    </>
  );
}

/**
 * 기록 분석: 지표 카드 + 티샷 결과·스코어 분포 막대.
 * 한 라운드(기록 분석 탭)와 여러 라운드 합산(라운드 기록)에서 함께 쓴다.
 * rounds 를 넘기면 벌타·샌드샷을 라운드당 값으로도 보여준다.
 */
export function RecordAnalysis({
  s,
  rounds,
  trend,
  insight,
  compare,
}: {
  s: RecordSummary;
  rounds?: number;
  /** 라운드 기록 화면: 칸을 누르면 추이 그래프 */
  trend?: TrendPick;
  /** 관리자 AI 분석: 지표 칸 아래 · 티샷 결과 · 스코어 분포 카드 안 */
  insight?: Partial<InsightSections>;
  /** 전/후반 비교: 지표 칸마다 전반 → 후반과 화살표 */
  compare?: { out: RecordSummary; in: RecordSummary };
}) {
  const perRound = (n: number) =>
    rounds && rounds > 1 ? `라운드당 벌타 ${one(n / rounds)}` : undefined;
  const a = compare?.out;
  const b = compare?.in;
  /** 비교 첫 칸: 9홀을 다 쳤으면 타수, 아니면 친 홀의 파 대비 */
  const bothFull = !!a && !!b && a.out != null && b.in != null;
  return (
    <>
      <div className={`card rm-grid ${compare ? "rm-compare" : ""}`}>
        {a && b && (
          <div className="rm-tile rm-wide">
            <CmpBody
              label={bothFull ? "타수" : "파 대비 (친 홀)"}
              c={
                bothFull
                  ? cmpOf(a.out, b.in, (v) => `${v}타`, 1, false, "타")
                  : cmpOf(
                      a.holesPlayed ? a.toPar : null,
                      b.holesPlayed ? b.toPar : null,
                      relLabel,
                      1,
                      false,
                      "타"
                    )
              }
            />
          </div>
        )}
        <Metric
          k="fairway"
          trend={trend}
          label="페어웨이 적중률"
          value={pct(s.fairway)}
          note={sub(s.fairway)}
          cmp={a && b && cmpOf(rateOf(a.fairway), rateOf(b.fairway), showPct, 1, true, "%p")}
        />
        <Metric
          k="gir"
          trend={trend}
          label="GIR"
          value={pct(s.gir)}
          note={sub(s.gir)}
          cmp={a && b && cmpOf(rateOf(a.gir), rateOf(b.gir), showPct, 1, true, "%p")}
        />
        <Metric
          k="putts"
          trend={trend}
          label="홀당 퍼트"
          value={one(s.avgPutts)}
          note={`1퍼트 ${s.onePutts} · 3퍼트+ ${s.threePutts}`}
          cmp={a && b && cmpOf(a.avgPutts, b.avgPutts, one, 0.1, false)}
        />
        <Metric
          k="girThreePutt"
          trend={trend}
          label="GIR 후 3퍼트"
          value={pct(s.girThreePutt)}
          note={sub(s.girThreePutt)}
          cmp={a && b && cmpOf(rateOf(a.girThreePutt), rateOf(b.girThreePutt), showPct, 1, false, "%p")}
        />
        <Metric
          k="scrambling"
          trend={trend}
          label="스크램블 (파 세이브)"
          value={pct(s.scrambling)}
          note={sub(s.scrambling)}
          cmp={a && b && cmpOf(rateOf(a.scrambling), rateOf(b.scrambling), showPct, 1, true, "%p")}
        />
        <Metric
          k="extraShots"
          trend={trend}
          label="그린 놓친 홀 추가 샷"
          value={s.extraShots == null ? "—" : `+${one(s.extraShots)}`}
          note="그린까지 정규 타수보다"
          cmp={a && b && cmpOf(a.extraShots, b.extraShots, (v) => `+${one(v)}`, 0.1, false)}
        />
        <Metric
          k="penalty"
          trend={trend}
          label="OB · 해저드"
          value={`${s.ob} · ${s.hazard}`}
          note={perRound(s.ob + s.hazard) ?? "벌타 합계"}
          cmp={a && b && cmpOf(a.ob + a.hazard, b.ob + b.hazard, (v) => `${v}번`, 1, false, "번")}
        />
        <Metric
          k="sand"
          trend={trend}
          label="샌드샷"
          value={`${s.sandShots}`}
          note={`샌드 세이브 ${pct(s.sandSave)}${s.sandSave.d ? ` (${s.sandSave.n}/${s.sandSave.d})` : ""}`}
          cmp={a && b && cmpOf(a.sandShots, b.sandShots, (v) => `${v}번`, 1, false, "번")}
        />
      </div>
      {compare && <p className="hint rm-cmp-hint">전반(1~9번) → 후반(10번~) · 초록은 좋아진 것, 빨강은 나빠진 것</p>}
      {trend?.chart}
      {insight?.stats && (
        <div className="card insight-card">
          <InsightBox text={insight.stats} />
        </div>
      )}
      <div className="card">
        <div className="ad-ratio-title">티샷 결과 (파4·파5)</div>
        <TeeShotChart s={s} />
        <InsightBox text={insight?.teeShot} />
      </div>
      <div className="card">
        <div className="ad-ratio-title">스코어 분포{rounds && rounds > 1 ? " (라운드당 평균)" : ""}</div>
        <ScoreBars s={s} rounds={rounds} />
        <InsightBox text={insight?.scoring} />
      </div>
    </>
  );
}

/**
 * 티샷 결과: 반원은 왼쪽 미스(훅)·적중(가운데)·오른쪽 미스(슬라이스) 셋만 그 비중대로 나눠 칠한다. 오른쪽에 벙커·OB·해저드.
 * 짧음(기타)은 방향이 아니어서 반원에 넣지 않고 아래에 따로 적는다.
 * 비율과 페어웨이 적중률은 방향을 적은 홀 기준, 벙커·OB·해저드는 전체 티샷(친 파4·5 홀) 중 비중. 개수보다 비율을 크게
 */
function TeeShotChart({ s }: { s: RecordSummary }) {
  const { left, hit, short, right } = s.mix;
  const d = s.fairway.d;
  const dirShare = (n: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);
  const allShare = (n: number) => (s.teeShots === 0 ? "—" : `${Math.round((n / s.teeShots) * 100)}%`);
  const R = 66;
  const cx = 84;
  const cy = 80;
  const len = Math.PI * R;
  const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const parts = (
    [
      [left, "var(--teal)"],
      [hit, "var(--gain)"],
      [right, "#60a5fa"],
    ] as [number, string][]
  ).filter(([n]) => n > 0);
  const arcTotal = left + hit + right;
  const GAP = parts.length > 1 ? 3 : 0;
  let at = 0;
  return (
    <div className="ts-wrap">
      <div className="ts-gauge">
        <svg viewBox="-14 0 196 85" role="img" aria-label={`페어웨이 적중 ${pct(s.fairway)}`}>
          {/* 칠할 방향이 없을 때만 빈 반원 */}
          {arcTotal === 0 && <path d={arc} className="ts-track" />}
          {parts.map(([n, color], i) => {
            const seg = (len * n) / arcTotal;
            const el = (
              <path
                key={i}
                d={arc}
                className="ts-seg"
                style={{ stroke: color }}
                strokeDasharray={`${Math.max(0, seg - GAP)} ${len}`}
                strokeDashoffset={-at}
              />
            );
            at += seg;
            return el;
          })}
          <text x={cx} y={cy - 16} className="ts-pct">
            {pct(s.fairway)}
          </text>
          <text x={cx} y={cy + 2} className="ts-cap">
            페어웨이 적중
          </text>
        </svg>
        {/* 반원 양 끝 바로 밑: 퍼센트는 반원 끝 가운데, 화살표는 그 바깥 */}
        <div className="ts-dirs">
          <div className="ts-dir hook">
            <b>
              <Icon name="hook" size={14} strokeWidth={2.4} />
              {dirShare(left)}
            </b>
            <small>왼쪽 미스 {left}홀</small>
          </div>
          <div className="ts-dir slice">
            <b>
              {dirShare(right)}
              <Icon name="slice" size={14} strokeWidth={2.4} />
            </b>
            <small>오른쪽 미스 {right}홀</small>
          </div>
        </div>
        {/* 기타(짧음)는 반원 밖에 따로 */}
        <div className="ts-etc">
          <span>기타(짧음)</span>
          <b>{dirShare(short)}</b>
          <small>{short}홀</small>
        </div>
        {s.noDirection > 0 && <span className="ts-dir-note">방향 미입력 {s.noDirection}홀은 빼고 계산</span>}
      </div>
      <div className="ts-side">
        {(
          [
            ["bunker", "벙커"],
            ["ob", "OB"],
            ["hazard", "해저드"],
          ] as const
        ).map(([k, label]) => (
          <div className={`ts-box ${k}`} key={k}>
            <span>{label}</span>
            <b>{allShare(s.lies[k])}</b>
            <small>{s.lies[k]}번</small>
          </div>
        ))}
        <span className="ts-side-note">전체 티샷 {s.teeShots}개 중</span>
      </div>
    </div>
  );
}

/** 스코어 분포: 세로 막대 (홀 수와 비중). 여러 라운드를 합친 화면(rounds)에서는 개수를 라운드당 평균으로 */
function ScoreBars({ s, rounds }: { s: RecordSummary; rounds?: number }) {
  const avg = !!rounds && rounds > 1;
  const items: [string, number, string][] = [
    ["이글", s.dist.eagle, "#9f1239"],
    ["버디", s.dist.birdie, "var(--terra)"],
    ["파", s.dist.par, "var(--gain)"],
    ["보기", s.dist.bogey, "#60a5fa"],
    ["더블", s.dist.double, "var(--teal)"],
    ["트리플+", s.dist.triple, "#1e3a8a"],
  ];
  const total = items.reduce((a, [, n]) => a + n, 0);
  // 막대 높이 = 전체 홀 중 비율 (39% 면 39% 높이)
  const ratio = (n: number) => (total === 0 ? 0 : n / total);
  return (
    <div className={`sd-bars ${avg ? "avg" : ""}`}>
      {items.map(([label, n, color]) => (
        <div className="sd-col" key={label}>
          <span className="sd-n">{avg ? one(n / rounds!) : n}</span>
          <div className="sd-track">
            <div className="sd-bar" style={{ height: `${ratio(n) * 100}%`, background: color }} />
          </div>
          <span className="sd-label">{label}</span>
          <span className="sd-pct">{total === 0 ? "—" : `${Math.round((n / total) * 100)}%`}</span>
        </div>
      ))}
    </div>
  );
}

/** 스코어카드 티샷 칸: 방향은 입력 버튼과 같은 아이콘. 벙커면 갈색, OB·해저드면 빨간색으로 칠한다 */
const FW_MARK: Record<Fairway, JSX.Element> = {
  hit: <Icon name="ring" size={13} strokeWidth={2.4} />,
  left: <Icon name="hook" size={14} strokeWidth={2.2} />,
  short: <Icon name="short" size={13} strokeWidth={2.4} />,
  right: <Icon name="slice" size={14} strokeWidth={2.2} />,
};
/** 파 대비: +1 / E / -1 */
const relText = (n: number) => (n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);

/** 스코어카드 (전반·후반 9홀씩): 파·스코어·파 대비·퍼트·티샷·GIR·OB·해저드·샌드샷 */
export function RecordScorecard({ holes }: { holes: HoleRecord[] }) {
  const halves = [holes.slice(0, 9), holes.slice(9, 18)].filter((h) => h.length > 0);
  const sum = (part: HoleRecord[], f: (h: HoleRecord) => number | null) => {
    const xs = part.map(f);
    return xs.some((v) => v == null) ? "" : String(xs.reduce<number>((a, v) => a + v!, 0));
  };
  const blank = (n: number) => (n > 0 ? String(n) : "");
  return (
    <div className="card rsc">
      {halves.map((part) => (
        <table className="rsc-table" key={part[0].hole}>
          <thead>
            <tr>
              <th>홀</th>
              {part.map((h) => (
                <th key={h.hole}>{h.hole + 1}</th>
              ))}
              <th>{part[0].hole < 9 ? "전반" : "후반"}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="rsc-par">
              <td>파</td>
              {part.map((h) => (
                <td key={h.hole}>{h.par}</td>
              ))}
              <td>{part.reduce((a, h) => a + h.par, 0)}</td>
            </tr>
            <tr className="rsc-score">
              <td>스코어</td>
              {part.map((h) => (
                <td key={h.hole}>
                  {h.rel == null ? (
                    ""
                  ) : (
                    <span
                      className={`rsc-s ${h.rel < 0 ? "under" : h.rel > 0 ? "over" : ""}`}
                      title={relLabel(h.rel)}
                    >
                      {h.par + h.rel}
                    </span>
                  )}
                </td>
              ))}
              <td>{sum(part, (h) => (h.rel == null ? null : h.par + h.rel))}</td>
            </tr>
            {/* 스코어 바로 아래: 파 대비 (+1 / E / -1) */}
            <tr className="rsc-rel">
              <td>+/−</td>
              {part.map((h) => (
                <td
                  key={h.hole}
                  className={h.rel == null ? "" : h.rel < 0 ? "under" : h.rel > 0 ? "over" : ""}
                >
                  {h.rel == null ? "" : relText(h.rel)}
                </td>
              ))}
              <td>
                {part.every((h) => h.rel != null)
                  ? relText(part.reduce((a, h) => a + h.rel!, 0))
                  : ""}
              </td>
            </tr>
            <tr>
              <td>퍼트</td>
              {part.map((h) => (
                <td key={h.hole}>{h.putts ?? ""}</td>
              ))}
              <td>{sum(part, (h) => (h.rel == null ? 0 : h.putts))}</td>
            </tr>
            <tr>
              <td>티샷</td>
              {part.map((h) => (
                <td
                  key={h.hole}
                  className={`${h.fairway ? `fw-${h.fairway}` : ""} ${h.lie ? `lie-${h.lie}` : ""}`}
                >
                  {h.par === 3
                    ? "–"
                    : h.fairway
                    ? FW_MARK[h.fairway]
                    : // 방향 없이 벙커·OB·해저드만 고른 홀은 그 색 점으로
                      h.lie && "●"}
                </td>
              ))}
              <td />
            </tr>
            <tr>
              <td>GIR</td>
              {part.map((h) => {
                const g = girOf(h.par, h.rel, h.putts);
                return (
                  <td key={h.hole} className="rsc-gir">
                    {g == null ? "" : g ? "●" : "·"}
                  </td>
                );
              })}
              <td>{part.filter((h) => girOf(h.par, h.rel, h.putts)).length || ""}</td>
            </tr>
            <tr>
              <td>OB</td>
              {part.map((h) => (
                <td key={h.hole}>{blank(h.ob)}</td>
              ))}
              <td>{blank(part.reduce((a, h) => a + h.ob, 0))}</td>
            </tr>
            <tr>
              <td>해저드</td>
              {part.map((h) => (
                <td key={h.hole}>{blank(h.hazard)}</td>
              ))}
              <td>{blank(part.reduce((a, h) => a + h.hazard, 0))}</td>
            </tr>
            <tr>
              <td>샌드</td>
              {part.map((h) => (
                <td key={h.hole}>{blank(h.sand)}</td>
              ))}
              <td>{blank(part.reduce((a, h) => a + h.sand, 0))}</td>
            </tr>
          </tbody>
        </table>
      ))}
      <p className="rsc-legend">
        {/* 항목 사이에서만 줄이 바뀌게 */}
        <span className="nw">
          티샷 <Icon name="hook" size={12} /> 훅 <Icon name="ring" size={11} /> 적중{" "}
          <Icon name="short" size={11} /> 짧음 <Icon name="slice" size={12} /> 슬라이스
        </span>{" "}
        · <b className="lg-bunker nw">벙커는 갈색</b> · <b className="lg-penalty nw">OB·해저드는 빨간색</b> ·{" "}
        <span className="nw">GIR ● 정규 온</span>
      </p>
    </div>
  );
}
