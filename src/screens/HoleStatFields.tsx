import { Icon } from "../icons";
import type { Fairway, HoleStat, TeeLie } from "../types";

const PUTTS = [0, 1, 2, 3, 4, 5, 6];

/** 티샷 방향: 훅(왼쪽)·적중·짧음(안 뜸)·슬라이스(오른쪽) */
const FAIRWAYS: [Fairway, string, "hook" | "ring" | "short" | "slice"][] = [
  ["left", "훅 (왼쪽)", "hook"],
  ["hit", "적중", "ring"],
  ["short", "짧음 (안 뜸)", "short"],
  ["right", "슬라이스 (오른쪽)", "slice"],
];
/** 티샷 벙커·패널티: 방향과 함께 고를 수 있다 */
const LIES: [TeeLie, string][] = [
  ["bunker", "벙커"],
  ["penalty", "패널티"],
];

const COUNTS: ["ob" | "hazard" | "sand", string][] = [
  ["ob", "OB"],
  ["hazard", "해저드"],
  ["sand", "샌드샷"],
];

/**
 * 내 홀 기록 입력칸: 퍼트·티샷(방향 + 벙커/패널티)·OB·해저드·샌드샷.
 * 기록 모드 홀 진행과 내기 홀 진행(내 이름을 눌러 펼침)에서 함께 쓴다.
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
  return (
    <>
      <div className="rec-label">퍼트</div>
      <div className="score-grid" style={{ gridTemplateColumns: `repeat(${PUTTS.length}, 1fr)` }}>
        {PUTTS.map((n) => (
          <button
            key={n}
            className={`sbtn ${stat.putts === n ? "active even" : ""}`}
            // 타수보다 많은 퍼트는 고를 수 없다
            disabled={strokes != null && n > strokes}
            onClick={() => onChange({ putts: stat.putts === n ? null : n })}
          >
            {n}
          </button>
        ))}
      </div>

      {par !== 3 && (
        <>
          <div className="rec-label">
            티샷 페어웨이 <small>(벙커/패널티와 티샷 방향 동시선택 가능)</small>
          </div>
          <div className="rec-fw-row">
            <div className="score-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {FAIRWAYS.map(([f, label, icon]) => (
                <button
                  key={f}
                  className={`sbtn rec-fw ${stat.fairway === f ? `active ${f}` : ""}`}
                  aria-label={label}
                  aria-pressed={stat.fairway === f}
                  onClick={() => onChange({ fairway: stat.fairway === f ? null : f })}
                >
                  <Icon name={icon} size={20} strokeWidth={2.2} />
                </button>
              ))}
            </div>
            <div className="score-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              {LIES.map(([l, label]) => (
                <button
                  key={l}
                  className={`sbtn rec-fw ${stat.lie === l ? `active ${l}` : ""}`}
                  aria-pressed={stat.lie === l}
                  onClick={() => onChange({ lie: stat.lie === l ? null : l })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
                disabled={stat[k] === 0}
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
