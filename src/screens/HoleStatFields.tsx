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

/**
 * 티샷 결과를 바꿀 때: 새로 고른 것의 카운트에 1을 더하고, 풀거나 다른 것으로 바꾼 것의 카운트에서 1을 뺀다
 */
function withLie(stat: HoleStat, lie: TeeLie | null): Partial<HoleStat> {
  const counts = { ob: stat.ob, hazard: stat.hazard, sand: stat.sand };
  if (stat.lie) counts[LIE_COUNT[stat.lie]] = Math.max(0, counts[LIE_COUNT[stat.lie]] - 1);
  if (lie) counts[LIE_COUNT[lie]] = Math.min(9, counts[LIE_COUNT[lie]] + 1);
  return { lie, ...counts };
}

/**
 * 내 홀 기록 입력칸: 퍼트·티샷(방향 + 벙커/OB/해저드)·OB·해저드·샌드샷.
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
            티샷 페어웨이 <small>(벙커/OB/해저드와 티샷 방향 동시선택 가능)</small>
          </div>
          <div className="rec-fw-row">
            <div className="score-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {FAIRWAYS.map(([f, label, icon]) => (
                <button
                  key={f}
                  className={`sbtn rec-fw ${stat.fairway === f ? `active ${f}` : ""}`}
                  aria-label={label}
                  aria-pressed={stat.fairway === f}
                  onClick={() =>
                    // 적중은 페어웨이에 떨어진 것이라 벙커·OB·해저드와 함께 고를 수 없다
                    onChange(
                      stat.fairway === f
                        ? { fairway: null }
                        : f === "hit"
                        ? { fairway: f, ...withLie(stat, null) }
                        : { fairway: f }
                    )
                  }
                >
                  <Icon name={icon} size={20} strokeWidth={2.2} />
                </button>
              ))}
            </div>
            <div className="score-grid" style={{ gridTemplateColumns: `repeat(${LIES.length}, 1fr)` }}>
              {LIES.map(([l, label]) => (
                <button
                  key={l}
                  className={`sbtn rec-fw rec-lie ${stat.lie === l ? `active ${l}` : ""}`}
                  aria-pressed={stat.lie === l}
                  disabled={stat.fairway === "hit"}
                  onClick={() => onChange(withLie(stat, stat.lie === l ? null : l))}
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
                // 티샷으로 고른 OB·해저드·벙커가 있으면 그 카운트는 1 아래로 내려가지 않는다
                disabled={stat[k] <= (stat.lie && LIE_COUNT[stat.lie] === k ? 1 : 0)}
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
