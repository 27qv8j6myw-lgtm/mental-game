import { useState } from "react";
import { Icon } from "../icons";
import { useAuth } from "../auth";
import { DEFAULT_BAG, clubName, clubShort, sameClub, type Club } from "../bag";
import { PUTT_DIST_MAX, PUTT_LINES, PUTT_LINE_LABEL, SHOT_DIST_MAX, SLOPE_LABEL, puttCells, shotLimit } from "../detail";
import type { Fairway, HoleDetail, HoleStat, PuttDetail, PuttLine, ShotDetail, TeeLie } from "../types";

const PUTTS = [0, 1, 2, 3, 4, 5, 6];

type DirIcon = "hook" | "ring" | "short" | "slice";
/** 티샷 방향: 훅(왼쪽)·적중·짧음(안 뜸)·슬라이스(오른쪽) */
const FAIRWAYS: [Fairway, string, DirIcon][] = [
  ["left", "훅 (왼쪽)", "hook"],
  ["hit", "적중", "ring"],
  ["short", "짧음 (안 뜸)", "short"],
  ["right", "슬라이스 (오른쪽)", "slice"],
];
/** 디테일 기록의 결과 칸 이름: 파3 티샷은 그린, 두 번째 샷부터는 페어웨이 또는 그린 */
const DIR_LABEL: Record<"tee" | "par3" | "next", Record<Fairway, string>> = {
  tee: { left: "훅 (왼쪽)", hit: "페어웨이", short: "짧음", right: "슬라이스 (오른쪽)" },
  par3: { left: "왼쪽 그린 미스", hit: "온그린", short: "짧음", right: "오른쪽 그린 미스" },
  next: { left: "왼쪽", hit: "페어웨이·그린", short: "짧음", right: "오른쪽" },
};
const HIT_NOTE = { tee: "O는 페어웨이", par3: "O는 온그린 · 좌우는 그린 미스", next: "O는 페어웨이 또는 그린" };
/** 티샷 벙커·OB·해저드: 방향과 함께 고를 수 있고, 셋 중에는 하나만 */
const LIES: [TeeLie, string][] = [
  ["bunker", "벙커"],
  ["ob", "OB"],
  ["hazard", "해저드"],
];

type Count = "ob" | "hazard" | "sand";
const COUNTS: [Count, string][] = [
  ["ob", "OB"],
  ["hazard", "해저드"],
  ["sand", "샌드샷"],
];
/** 티샷 결과마다 같이 세는 아래 카운트 (벙커에 들어가면 샌드샷을 한 번 친다) */
const LIE_COUNT: Record<TeeLie, Count> = { bunker: "sand", ob: "ob", hazard: "hazard" };

/** 결과(벙커·OB·해저드)를 바꿀 때 카운트: 풀거나 다른 것으로 바꾼 것의 카운트에서 1을 빼고, 새로 고른 것에 1을 더한다 */
function shiftCounts(stat: HoleStat, from: TeeLie | null | undefined, to: TeeLie | null | undefined) {
  const counts = { ob: stat.ob, hazard: stat.hazard, sand: stat.sand };
  if (from) counts[LIE_COUNT[from]] = Math.max(0, counts[LIE_COUNT[from]] - 1);
  if (to) counts[LIE_COUNT[to]] = Math.min(9, counts[LIE_COUNT[to]] + 1);
  return counts;
}
/** 티샷 결과를 바꿀 때 (파4·파5 티샷은 stat.lie) */
function withLie(stat: HoleStat, lie: TeeLie | null): Partial<HoleStat> {
  return { lie, ...shiftCounts(stat, stat.lie, lie) };
}
/** 고른 벙커·OB·해저드 수 (티샷 + 디테일 샷들): 아래 카운트는 이 아래로 내려가지 않는다 */
function lieFloor(stat: HoleStat, k: Count): number {
  const lies = [stat.lie, ...(stat.detail?.shots ?? []).map((s) => s.lie)];
  return lies.filter((l) => l && LIE_COUNT[l] === k).length;
}

/* ---- 디테일 기록 스위치·거리 단위: 이 기기에 기억 ---- */
const DETAIL_KEY = "mentalgame-detail-record";
const UNIT_KEY = "mentalgame-shot-unit";
const readLocal = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeLocal = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* 기억하지 못하면 다음에 다시 고를 뿐 */
  }
};

/**
 * 내 홀 기록 입력칸: 퍼트·티샷(방향 + 벙커/OB/해저드)·OB·해저드·샌드샷.
 * 기록 모드 홀 진행과 내기 홀 진행(내 이름을 눌러 펼침)에서 함께 쓴다.
 * '디테일 기록'을 켜면 샷마다 클럽·핀까지 거리·결과와 퍼트마다 거리·라이·경사를 더 넣는다 (detail.ts)
 */
export default function HoleStatFields({
  par,
  strokes,
  stat,
  onChange,
}: {
  par: number;
  /** 이 홀 내 타수 (입력 전이면 null). 퍼트는 이보다 많을 수 없다 */
  strokes: number | null;
  stat: HoleStat;
  onChange: (patch: Partial<HoleStat>) => void;
}) {
  const [detailOn, setDetailOn] = useState(() => readLocal(DETAIL_KEY) === "1");
  const toggleDetail = () => {
    setDetailOn(!detailOn);
    writeLocal(DETAIL_KEY, detailOn ? "0" : "1");
  };

  const putts = (
    <>
      <div className="rec-label">퍼트</div>
      <div className="score-grid" style={{ gridTemplateColumns: `repeat(${PUTTS.length}, 1fr)` }}>
        {PUTTS.map((n) => (
          <button
            key={n}
            className={`sbtn ${stat.putts === n ? "active even" : ""}`}
            // 타수보다 많은 퍼트는 고를 수 없다
            disabled={strokes != null && n > strokes}
            onClick={() => {
              const next = stat.putts === n ? null : n;
              // 퍼트 수를 줄이면 넘치는 퍼트 칸은 지운다
              onChange(
                stat.detail
                  ? { putts: next, detail: { ...stat.detail, putts: stat.detail.putts.slice(0, puttCells(next)) } }
                  : { putts: next }
              );
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <>
      <button className="dt-switch" role="switch" aria-checked={detailOn} onClick={toggleDetail}>
        <span className="dt-switch-t">
          디테일 기록 <small>클럽 · 거리 · 퍼트 라이</small>
        </span>
        <span className={`switch ${detailOn ? "on" : ""}`} />
      </button>

      {detailOn ? (
        <>
          <DetailShots par={par} strokes={strokes} stat={stat} onChange={onChange} />
          {putts}
          <DetailPutts stat={stat} onChange={onChange} />
        </>
      ) : (
        <>
          {putts}
          {par !== 3 && (
            <>
              <div className="rec-label">
                티샷 페어웨이 <small>(벙커/OB/해저드와 티샷 방향 동시선택 가능)</small>
              </div>
              <DirRow
                labels={DIR_LABEL.tee}
                dir={stat.fairway}
                lie={stat.lie}
                onDir={(f) =>
                  // 적중은 페어웨이에 떨어진 것이라 벙커·OB·해저드와 함께 고를 수 없다
                  onChange(f == null ? { fairway: null } : f === "hit" ? { fairway: f, ...withLie(stat, null) } : { fairway: f })
                }
                onLie={(l) => onChange(withLie(stat, l))}
                plainLabels
              />
            </>
          )}
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
                // 샷 결과로 고른 OB·해저드·벙커가 있으면 그 수 아래로 내려가지 않는다
                disabled={stat[k] <= lieFloor(stat, k)}
                onClick={() => onChange({ [k]: Math.max(0, stat[k] - 1) })}
              >
                −
              </button>
              <b>{stat[k]}</b>
              <button
                aria-label={`${label} 더하기`}
                disabled={stat[k] >= 9}
                onClick={() => onChange({ [k]: stat[k] + 1 })}
              >
                ＋
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** 결과 한 줄: 방향 4칸 (훅·O·짧음·슬라이스) + 벙커·OB·해저드 3칸. 다시 누르면 풀린다 */
function DirRow({
  labels,
  dir,
  lie,
  onDir,
  onLie,
  plainLabels = false,
}: {
  labels: Record<Fairway, string>;
  dir: Fairway | null | undefined;
  lie: TeeLie | null | undefined;
  onDir: (f: Fairway | null) => void;
  onLie: (l: TeeLie | null) => void;
  /** 예전 티샷 칸 그대로 (aria-label 은 FAIRWAYS 이름) */
  plainLabels?: boolean;
}) {
  return (
    <div className="rec-fw-row">
      <div className="score-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {FAIRWAYS.map(([f, label, icon]) => (
          <button
            key={f}
            className={`sbtn rec-fw ${dir === f ? `active ${f}` : ""}`}
            aria-label={plainLabels ? label : labels[f]}
            aria-pressed={dir === f}
            onClick={() => onDir(dir === f ? null : f)}
          >
            <Icon name={icon} size={20} strokeWidth={2.2} />
          </button>
        ))}
      </div>
      <div className="score-grid" style={{ gridTemplateColumns: `repeat(${LIES.length}, 1fr)` }}>
        {LIES.map(([l, label]) => (
          <button
            key={l}
            className={`sbtn rec-fw rec-lie ${lie === l ? `active ${l}` : ""}`}
            aria-pressed={lie === l}
            disabled={dir === "hit"}
            onClick={() => onLie(lie === l ? null : l)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "150" → 150. 비었으면 null, 숫자가 아니면 undefined (그대로 둔다) */
function parseDist(text: string, max: number, step: number): number | null | undefined {
  const t = text.replace(",", ".").trim();
  if (!t) return null;
  const v = Number(t);
  if (!Number.isFinite(v) || v <= 0) return undefined;
  return Math.min(max, Math.round(v / step) * step);
}

/** 숫자 입력칸: 고치는 동안은 쓴 글자 그대로, 벗어나면 값으로 */
function NumInput({
  value,
  onValue,
  max,
  step,
  label,
}: {
  value: number | null | undefined;
  onValue: (v: number | null) => void;
  max: number;
  step: number;
  label: string;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="input dt-num"
      aria-label={label}
      inputMode={step < 1 ? "decimal" : "numeric"}
      value={text ?? (value == null ? "" : String(value))}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseDist(e.target.value, max, step);
        if (v !== undefined) onValue(v);
      }}
      onBlur={() => setText(null)}
    />
  );
}

/**
 * 샷: [1 티샷] [2] … [+] 탭으로 한 샷씩. 클럽(내 골프백) · 핀까지 거리(m/y) · 결과.
 * 파4·파5 티샷의 방향·벙커/OB/해저드는 예전 칸(stat.fairway·lie)에 그대로 둔다
 */
function DetailShots({
  par,
  strokes,
  stat,
  onChange,
}: {
  par: number;
  strokes: number | null;
  stat: HoleStat;
  onChange: (patch: Partial<HoleStat>) => void;
}) {
  const { user } = useAuth();
  const bag = user?.bag.length ? user.bag : DEFAULT_BAG;
  const detail: HoleDetail = stat.detail ?? { shots: [], putts: [] };
  const shots = detail.shots.length ? detail.shots : [{}];
  const limit = shotLimit(strokes, stat.putts);
  const [cur, setCur] = useState(0);
  const at = Math.min(cur, shots.length - 1);
  const shot: ShotDetail = shots[at];
  const teeOld = at === 0 && par >= 4;
  const ctx = at > 0 ? "next" : par === 3 ? "par3" : "tee";
  const dir = teeOld ? stat.fairway : shot.dir;
  const lie = teeOld ? stat.lie : shot.lie;
  const [unit, setUnit] = useState<"m" | "y">(() => (readLocal(UNIT_KEY) === "y" ? "y" : "m"));

  const setShots = (next: ShotDetail[], extra: Partial<HoleStat> = {}) =>
    onChange({ ...extra, detail: { ...detail, shots: next } });
  const patchShot = (patch: Partial<ShotDetail>, extra: Partial<HoleStat> = {}) =>
    setShots(
      shots.map((s, i) => (i === at ? { ...s, ...patch } : s)),
      extra
    );

  const onDir = (f: Fairway | null) => {
    if (teeOld) {
      onChange(f === "hit" ? { fairway: f, ...withLie(stat, null) } : { fairway: f });
      return;
    }
    // O(페어웨이·그린)는 벙커·OB·해저드와 함께 고를 수 없다
    if (f === "hit" && shot.lie) patchShot({ dir: f, lie: null }, shiftCounts(stat, shot.lie, null));
    else patchShot({ dir: f });
  };
  const onLie = (l: TeeLie | null) => {
    if (teeOld) onChange(withLie(stat, l));
    else patchShot({ lie: l }, shiftCounts(stat, shot.lie, l));
  };
  const add = () => {
    if (shots.length >= limit) return;
    setShots([...shots, {}]);
    setCur(shots.length);
  };
  const remove = () => {
    const gone = shots[at];
    setShots(
      shots.filter((_, i) => i !== at),
      gone.lie ? shiftCounts(stat, gone.lie, null) : {}
    );
    setCur(at - 1);
  };
  const pickUnit = (u: "m" | "y") => {
    setUnit(u);
    writeLocal(UNIT_KEY, u);
    if (shot.dist != null) patchShot({ unit: u });
  };
  const shotUnit = shot.dist != null ? shot.unit ?? "m" : unit;
  const putterApproach = at > 0 && shot.club?.kind === "putter";

  return (
    <>
      <div className="rec-label">
        샷 <small>(+를 눌러 다음 샷)</small>
      </div>
      <div className="dt-tabs" role="tablist">
        {shots.map((s, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === at}
            className={`dt-tab ${i === at ? "on" : ""}`}
            onClick={() => setCur(i)}
          >
            <small>{i === 0 ? "티샷" : `${i + 1}번째`}</small>
            <b>{s.club ? clubShort(s.club) : "—"}</b>
          </button>
        ))}
        {shots.length < limit && (
          <button className="dt-tab add" aria-label={`${shots.length + 1}번째 샷 넣기`} onClick={add}>
            <Icon name="plus" size={18} />
          </button>
        )}
      </div>

      <div className="dt-shot">
        <div className="dt-sub">클럽</div>
        <div className="dt-clubs">
          {bag.map((c: Club, i) => {
            const on = sameClub(shot.club, c);
            return (
              <button
                key={i}
                className={`dt-club ${on ? "on" : ""}`}
                aria-label={clubName(c)}
                aria-pressed={on}
                onClick={() => patchShot({ club: on ? null : c })}
              >
                {clubShort(c)}
                {c.kind === "wedge" && c.wedge && c.loft != null && <small>{c.loft}°</small>}
              </button>
            );
          })}
        </div>
        {!user?.bag.length && <p className="dt-hint">프로필 › 골프백을 정하면 내 클럽만 나와요.</p>}
        {putterApproach && <p className="dt-hint on">퍼터로 어프로치 · 퍼트 수에는 안 들어가요</p>}

        <div className="dt-sub">핀까지</div>
        <div className="dt-dist">
          <NumInput
            key={at}
            label="핀까지 남은 거리"
            value={shot.dist}
            max={SHOT_DIST_MAX}
            step={1}
            onValue={(v) => patchShot(v == null ? { dist: null, unit: undefined } : { dist: v, unit: shotUnit })}
          />
          <div className="segmented dt-unit">
            {(["m", "y"] as const).map((u) => (
              <button key={u} className={shotUnit === u ? "active" : ""} onClick={() => pickUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="dt-sub">
          결과 <small>({HIT_NOTE[ctx]})</small>
        </div>
        <DirRow labels={DIR_LABEL[ctx]} dir={dir} lie={lie} onDir={onDir} onLie={onLie} />

        {at > 0 && (
          <button className="dt-remove" onClick={remove}>
            이 샷 지우기
          </button>
        )}
      </div>
    </>
  );
}

const LINE_ICON: Record<PuttLine, "hook" | "up" | "slice" | "sbreak"> = {
  hook: "hook",
  straight: "up",
  slice: "slice",
  double: "sbreak",
};

/** 퍼트 칸: 퍼트 수 − 1 개 (1퍼트면 1개). 홀컵까지 거리 · 오르막/내리막 · 라이 */
function DetailPutts({ stat, onChange }: { stat: HoleStat; onChange: (patch: Partial<HoleStat>) => void }) {
  const n = puttCells(stat.putts);
  if (n === 0) return null;
  const detail: HoleDetail = stat.detail ?? { shots: [], putts: [] };
  const cells: PuttDetail[] = Array.from({ length: n }, (_, i) => detail.putts[i] ?? {});
  const patch = (i: number, p: Partial<PuttDetail>) =>
    onChange({ detail: { ...detail, putts: cells.map((c, j) => (j === i ? { ...c, ...p } : c)) } });

  return (
    <div className="dt-putts">
      {cells.map((c, i) => (
        <div className="dt-putt" key={i}>
          <div className="dt-putt-head">
            <b>{i === 0 ? "첫 퍼트" : `${i + 1}번째 퍼트`}</b>
            <span className="dt-putt-dist">
              <small>홀컵까지</small>
              <NumInput
                label={`${i + 1}번째 퍼트 홀컵까지 거리`}
                value={c.dist}
                max={PUTT_DIST_MAX}
                step={0.5}
                onValue={(v) => patch(i, { dist: v })}
              />
              <span>m</span>
            </span>
          </div>
          <div className="dt-putt-row">
            <div className="dt-slope">
              {(["up", "down"] as const).map((s) => (
                <button
                  key={s}
                  className={`sbtn dt-slope-btn ${c.slope === s ? `active ${s}` : ""}`}
                  aria-pressed={c.slope === s}
                  onClick={() => patch(i, { slope: c.slope === s ? null : s })}
                >
                  {SLOPE_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="dt-lines">
              {PUTT_LINES.map((l) => (
                <button
                  key={l}
                  className={`sbtn dt-line ${c.line === l ? "active" : ""}`}
                  aria-label={PUTT_LINE_LABEL[l]}
                  aria-pressed={c.line === l}
                  onClick={() => patch(i, { line: c.line === l ? null : l })}
                >
                  <Icon name={LINE_ICON[l]} size={19} strokeWidth={2.2} />
                </button>
              ))}
            </div>
          </div>
          <div className="dt-putt-note">
            {c.slope ? SLOPE_LABEL[c.slope] : "평지"}
            {c.line && ` · ${PUTT_LINE_LABEL[c.line]}`}
          </div>
        </div>
      ))}
    </div>
  );
}
