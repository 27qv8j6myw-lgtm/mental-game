import { bogeyOverPar, difficulty } from "../kga";

/** 코스 난이도 칩 (슬로프레이팅 기준 쉬움·보통·어려움·매우 어려움) */
export function DifficultyChip({ slope }: { slope: number }) {
  const d = difficulty(slope);
  return <span className={`diff-chip lv${d.level}`}>{d.label}</span>;
}

/** "보기 플레이어 기준 +22타 예상 (94타)" */
export function BogeyExpect({ cr, slope, par = 72 }: { cr: number; slope: number; par?: number }) {
  const over = bogeyOverPar(cr, slope, par);
  return (
    <span className="bogey-expect">
      보기 플레이어 기준 {over >= 0 ? `+${over}` : over}타 예상 ({par + over}타)
    </span>
  );
}
