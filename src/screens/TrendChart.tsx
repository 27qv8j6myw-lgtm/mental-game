import { useState } from "react";
import { formatTrend, TREND_META, type TrendKey, type TrendPoint, type TrendUnit } from "../recordTrend";

/** 평균은 소수 한 자리까지 (타수 82.4타, 벌타 0.6개) */
const formatAvg = (k: TrendKey, v: number) => {
  const m = TREND_META[k];
  if (m.percent || m.decimals > 0) return formatTrend(k, v);
  return `${(Math.round(v * 10) / 10).toFixed(1)}${m.unit}`;
};

const W = 320;
const H = 150;
// 세로 축 숫자를 두지 않아 왼쪽 여백은 점이 잘리지 않을 만큼만. 아래는 날짜 줄
const PAD = { l: 18, r: 18, t: 26, b: 34 };

/**
 * 지표 하나의 추이 (오래된 → 최근). 점 하나는 한 달 평균 또는 라운드 하나.
 * 점선은 이 기간 전체 값(분석 칸과 같은 값), 점을 누르면 그 달·라운드 값.
 * 가로 간격은 날짜 차이가 아니라 순서대로 고르게 둔다
 */
export default function TrendChart({
  k,
  points,
  unit,
  overall,
  beforeLabel,
}: {
  k: TrendKey;
  points: TrendPoint[];
  unit: TrendUnit;
  /** 이 기간 전체 값 (분석 칸과 같은 값). 없으면 점들의 평균 */
  overall: number | null;
  /** 월별: 흐리게 함께 보여주는 그 전 기록 달 ("9월", 해가 다르면 "2025년 11월") */
  beforeLabel?: string;
}) {
  const meta = TREND_META[k];
  const [picked, setPicked] = useState<number | null>(null);
  const n = points.length;
  const sel = picked != null && picked < n ? picked : n - 1;
  const values = points.map((p) => p.value);
  const avg = overall ?? (n ? values.reduce((a, b) => a + b, 0) / n : 0);
  const unitLabel = unit === "month" ? "월 평균" : "라운드별";

  if (n < 2) {
    return (
      <div className="card trend-card">
        <div className="trend-head">
          <b>
            {meta.label} 추이 <small>{unitLabel}</small>
          </b>
        </div>
        <div className="trend-empty">
          {n === 0
            ? "이 기간에는 이 기록을 남긴 라운드가 없어요."
            : "라운드가 2개 이상이면 추이를 보여줘요. (지금 1개)"}
        </div>
      </div>
    );
  }

  // 세로 범위: 값 범위에 여백을 둔다 (비율은 10% 단위로 끊어 0~100 안에서)
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (meta.percent) {
    // (세로 축 숫자가 없으니 0 아래로 내려가도 된다: 0% 점이 바닥에 붙지 않게)
    lo = Math.floor((lo - 10) / 10) * 10;
    hi = Math.ceil((hi + 10) / 10) * 10;
  } else {
    const span = Math.max(hi - lo, meta.decimals === 0 ? 2 : 0.4);
    const pad = span * 0.2;
    // 0 아래로도 여백을 둔다 (OB 0개처럼 가장 작은 값이 바닥에 붙어 날짜와 겹치지 않게)
    lo = lo - pad;
    hi = hi + pad;
  }
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / (n - 1);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / (hi - lo || 1));
  // 가로 날짜: 마지막(최근)부터 거꾸로, 글자끼리 붙지 않을 만큼 띄워서 고른다
  const MIN_GAP = 52;
  const labelIdx = new Set<number>([n - 1]);
  let lastX = x(n - 1);
  for (let i = n - 2; i >= 0; i--) {
    if (lastX - x(i) >= MIN_GAP) {
      labelIdx.add(i);
      lastX = x(i);
    }
  }
  // 첫 라운드 날짜도 보이게 (가장 앞 라벨과 붙으면 그 라벨 대신)
  if (!labelIdx.has(0)) {
    const first = Math.min(...labelIdx);
    if (x(first) - x(0) < MIN_GAP && first !== n - 1) labelIdx.delete(first);
    if (labelIdx.size === 0 || x(Math.min(...labelIdx)) - x(0) >= MIN_GAP) labelIdx.add(0);
  }
  const r = n > 20 ? 2.5 : 3.5;
  // 이 기간의 첫 점 (앞에 그 전 달 라운드가 흐리게 붙어 있으면 그 다음)
  const firstCur = Math.max(0, points.findIndex((q) => !q.before));
  const p = points[sel];
  // 고른 점의 값 글자: 옆 점으로 이어지는 선과 겹치지 않게, 선이 위에서 내려오면 점 아래에 쓴다
  const nb = points[sel > 0 ? sel - 1 : sel + 1];
  // 단, 아래에 쓰면 날짜 줄에 닿는 경우엔 위에 쓴다
  const below = !!nb && nb.value > p.value && y(p.value) + 20 <= H - PAD.b + 2;
  const valueY = below ? y(p.value) + 20 : y(p.value) - 12;

  return (
    <div className="card trend-card">
      <div className="trend-head">
        <b>
          {meta.label} 추이 <small>{unitLabel}</small>
        </b>
        <span>
          평균 {formatAvg(k, avg)} · 최근 {formatTrend(k, values[n - 1])}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`${meta.label} ${unitLabel} 추이: ${points.map((q) => `${q.label} ${formatTrend(k, q.value)}`).join(", ")}`}
      >
        {/* 점선(이 기간 값)은 이 기간 구간에만 (월별에서 함께 보이는 그 전 달 구간은 빼고) */}
        <line
          x1={firstCur > 0 ? x(firstCur) - 8 : PAD.l}
          x2={W - PAD.r}
          y1={y(avg)}
          y2={y(avg)}
          className="tr-avg"
        />
        {/* 선: 지난달 구간은 흐리게 */}
        {points.slice(1).map((q, i) => (
          <line
            key={`seg-${q.id}`}
            x1={x(i)}
            y1={y(points[i].value)}
            x2={x(i + 1)}
            y2={y(q.value)}
            className={`tr-line ${points[i].before ? "before" : ""}`}
          />
        ))}
        {points.map((q, i) => (
          <circle
            key={q.id}
            cx={x(i)}
            cy={y(q.value)}
            r={i === sel ? r + 2 : r}
            className={`tr-dot ${i === sel ? "on" : ""} ${q.before ? "before" : ""}`}
          />
        ))}
        <text
          x={Math.min(Math.max(x(sel), PAD.l + 14), W - PAD.r - 14)}
          y={valueY}
          textAnchor="middle"
          className="tr-val"
        >
          {formatTrend(k, p.value)}
        </text>
        {[...labelIdx].map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="tr-tick">
            {points[i].label}
          </text>
        ))}
        {/* 누르기 쉬운 넓은 영역 (점마다 세로 띠) */}
        {points.map((q, i) => {
          const half = n > 1 ? (W - PAD.l - PAD.r) / (n - 1) / 2 : 20;
          return (
            <rect
              key={`hit-${q.id}`}
              x={x(i) - half}
              y={PAD.t - 10}
              width={half * 2}
              height={H - PAD.t - PAD.b + 20}
              className="tr-hit"
              onClick={() => setPicked(i)}
            />
          );
        })}
      </svg>
      <div className="trend-pick">
        <span>{p.info}</span>
        <b>{formatTrend(k, p.value)}</b>
      </div>
      <div className="trend-note">
        점선은 이 기간 전체 값이에요.
        {points.some((q) => q.before) && ` 흐린 점은 그 전 달(${beforeLabel ?? "앞 달"}) 라운드예요.`} 그래프를 누르면{" "}
        {unit === "month" ? "그 달" : "그 라운드"} 값을 볼 수 있어요.
      </div>
    </div>
  );
}
