import type { Frac, HoleRecord, RecordSummary } from "../recordStats";
import { girOf } from "../recordStats";
import { relLabel } from "../util";
import { Icon } from "../icons";
import type { Fairway } from "../types";

/** 0.333 → "33%". 분모가 0이면 "—" */
const pct = (f: Frac) => (f.rate == null ? "—" : `${Math.round(f.rate * 100)}%`);
const sub = (f: Frac, unit = "홀") => (f.d === 0 ? "기록 없음" : `${f.n}/${f.d}${unit}`);
const one = (v: number | null) => (v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1));

/** 지표 한 칸: 이름 · 큰 값 · 근거 */
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rm-tile">
      <span className="rm-label">{label}</span>
      <b className="rm-value">{value}</b>
      {note && <span className="rm-note">{note}</span>}
    </div>
  );
}

/**
 * 기록 분석: 지표 카드 + 티샷 결과·스코어 분포 막대.
 * 한 라운드(기록 분석 탭)와 여러 라운드 합산(라운드 기록)에서 함께 쓴다.
 * rounds 를 넘기면 벌타·샌드샷을 라운드당 값으로도 보여준다.
 */
export function RecordAnalysis({ s, rounds }: { s: RecordSummary; rounds?: number }) {
  const perRound = (n: number) =>
    rounds && rounds > 1 ? `라운드당 벌타 ${one(n / rounds)}` : undefined;
  return (
    <>
      <div className="card rm-grid">
        <Metric label="페어웨이 적중률" value={pct(s.fairway)} note={sub(s.fairway)} />
        <Metric label="GIR" value={pct(s.gir)} note={sub(s.gir)} />
        <Metric
          label="홀당 퍼트"
          value={one(s.avgPutts)}
          note={`1퍼트 ${s.onePutts} · 3퍼트+ ${s.threePutts}`}
        />
        <Metric label="GIR 후 3퍼트" value={pct(s.girThreePutt)} note={sub(s.girThreePutt)} />
        <Metric label="스크램블 (파 세이브)" value={pct(s.scrambling)} note={sub(s.scrambling)} />
        <Metric
          label="그린 놓친 홀 추가 샷"
          value={s.extraShots == null ? "—" : `+${one(s.extraShots)}`}
          note="그린까지 정규 타수보다"
        />
        <Metric
          label="OB · 해저드"
          value={`${s.ob} · ${s.hazard}`}
          note={perRound(s.ob + s.hazard) ?? "벌타 합계"}
        />
        <Metric
          label="샌드샷"
          value={`${s.sandShots}`}
          note={`샌드 세이브 ${pct(s.sandSave)}${s.sandSave.d ? ` (${s.sandSave.n}/${s.sandSave.d})` : ""}`}
        />
      </div>
      <div className="card">
        <div className="ad-ratio-title">티샷 결과 (파4·파5)</div>
        <TeeShotChart s={s} />
      </div>
      <div className="card">
        <div className="ad-ratio-title">스코어 분포</div>
        <ScoreBars s={s} />
      </div>
    </>
  );
}

/**
 * 티샷 결과: 반원에 방향(훅·적중·짧음·슬라이스) 비중, 오른쪽에 벙커·OB·해저드.
 * 방향 비율과 페어웨이 적중률은 방향을 적은 홀 기준, 벙커·OB·해저드는 전체 티샷(친 파4·5 홀) 중 비중
 */
function TeeShotChart({ s }: { s: RecordSummary }) {
  const { left, hit, short, right } = s.mix;
  const dirShare = (n: number) => (s.fairway.d === 0 ? "—" : `${Math.round((n / s.fairway.d) * 100)}%`);
  const allShare = (n: number) => (s.teeShots === 0 ? "—" : `${Math.round((n / s.teeShots) * 100)}%`);
  // 반원: 왼쪽 끝 = 훅 → 적중 → 짧음 → 오른쪽 끝 = 슬라이스
  const R = 66;
  const cx = 84;
  const cy = 80;
  const len = Math.PI * R;
  const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const parts = (
    [
      [left, "var(--teal)"],
      [hit, "var(--gain)"],
      [short, "#9ca3af"],
      [right, "#60a5fa"],
    ] as [number, string][]
  ).filter(([n]) => n > 0);
  const arcTotal = left + hit + short + right;
  const GAP = parts.length > 1 ? 3 : 0;
  let at = 0;
  const item = (icon: "hook" | "ring" | "short" | "slice", label: string, n: number) => (
    <span>
      <Icon name={icon} size={13} /> {label} <b>{n}</b>
      <small>{dirShare(n)}</small>
    </span>
  );
  return (
    <div className="ts-wrap">
      <div className="ts-gauge">
        <svg viewBox="0 0 168 92" role="img" aria-label={`페어웨이 적중 ${pct(s.fairway)}`}>
          <path d={arc} className="ts-track" />
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
            <b>{s.lies[k]}</b>
            <small>{allShare(s.lies[k])}</small>
          </div>
        ))}
        <span className="ts-side-note">전체 티샷 {s.teeShots}개 중</span>
      </div>
      {/* 범례는 카드 폭 전체: 첫째 줄 훅·적중·슬라이스 / 둘째 줄 짧음·미입력 */}
      <div className="ts-legends">
        <div className="ts-legend">
          {item("hook", "훅", left)}
          {item("ring", "적중", hit)}
          {item("slice", "슬라이스", right)}
        </div>
        <div className="ts-legend">
          {item("short", "짧음", short)}
          <span>
            미입력 <b>{s.noDirection}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

/** 스코어 분포: 세로 막대 (홀 수와 비중) */
function ScoreBars({ s }: { s: RecordSummary }) {
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
    <div className="sd-bars">
      {items.map(([label, n, color]) => (
        <div className="sd-col" key={label}>
          <span className="sd-n">{n}</span>
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
      {halves.map((part, hi) => (
        <table className="rsc-table" key={hi}>
          <thead>
            <tr>
              <th>홀</th>
              {part.map((h) => (
                <th key={h.hole}>{h.hole + 1}</th>
              ))}
              <th>{hi === 0 ? "전반" : "후반"}</th>
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
        티샷 <Icon name="hook" size={12} /> 훅 <Icon name="ring" size={11} /> 적중{" "}
        <Icon name="short" size={11} /> 짧음 <Icon name="slice" size={12} /> 슬라이스 ·{" "}
        <b className="lg-bunker">벙커는 갈색</b> · <b className="lg-penalty">OB·해저드는 빨간색</b> · GIR ● 정규
        온
      </p>
    </div>
  );
}
