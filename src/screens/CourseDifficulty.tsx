import { bogeyOverPar, difficulty } from "../kga";

/** 코스 난이도 칩 (슬로프레이팅 기준 쉬움·보통·어려움·매우 어려움) */
export function DifficultyChip({ slope }: { slope: number }) {
  const d = difficulty(slope);
  return <span className={`diff-chip lv${d.level}`}>{d.label}</span>;
}

/** 보기 플레이어가 표준 코스(파72·슬로프 113)에서 치는 타수 */
const BOGEY_BASE = 90;

/** "보기 플레이어(90타) 기준 +5타 · 예상 스코어 95타" */
export function BogeyExpect({ cr, slope, par = 72 }: { cr: number; slope: number; par?: number }) {
  const expected = par + bogeyOverPar(cr, slope, par);
  const diff = expected - BOGEY_BASE;
  return (
    <span className="bogey-expect">
      보기 플레이어({BOGEY_BASE}타) 기준 {diff > 0 ? `+${diff}` : diff < 0 ? diff : "±0"}타 · 예상 스코어{" "}
      {expected}타
    </span>
  );
}
