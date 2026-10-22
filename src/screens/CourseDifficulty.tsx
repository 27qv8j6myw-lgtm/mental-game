import { bogeyOverPar, difficulty, ratingFor } from "../kga";
import type { CourseRating } from "../types";

/** 코스 난이도 칩 (슬로프레이팅 기준 쉬움·보통·어려움·매우 어려움) */
export function DifficultyChip({ slope }: { slope: number }) {
  const d = difficulty(slope);
  return <span className={`diff-chip lv${d.level}`}>{d.label}</span>;
}

/** 보기 플레이어가 표준 코스(파72·슬로프 113)에서 치는 타수 */
const BOGEY_BASE = 90;

/** "보기 플레이어 예상 95타 (+5)": 표준 코스 90타인 보기 플레이어가 이 코스에서 칠 타수 (한 줄에 들어가게 짧게) */
export function BogeyExpect({ cr, slope, par = 72 }: { cr: number; slope: number; par?: number }) {
  const expected = par + bogeyOverPar(cr, slope, par);
  const diff = expected - BOGEY_BASE;
  return (
    <span className="bogey-expect">
      보기 플레이어 예상 {expected}타 ({diff > 0 ? `+${diff}` : diff < 0 ? diff : "±0"})
    </span>
  );
}

/**
 * 코스 정보 3줄: 골프장·티·성별 / 코스레이팅·슬로프레이팅 / 난이도·보기 플레이어 예상 스코어.
 * 고른 성별의 레이팅이 없으면 다른 성별 레이팅으로 ('… 레이팅' 표시)
 */
export function RatingLines({ rating, sex }: { rating: CourseRating; sex: "M" | "F" }) {
  const r = ratingFor(rating, sex);
  if (!r) return null;
  return (
    <>
      <div className="rr-adj-sub">
        {rating.club} {rating.course} · {rating.tee} 티 · {r.sex === "M" ? "남자" : "여자"}
        {!r.exact && " 레이팅"}
      </div>
      <div className="rr-adj-sub">
        코스레이팅 {r.cr} · 슬로프레이팅 {r.slope}
      </div>
      <div className="rr-adj-diff">
        <DifficultyChip slope={r.slope} />
        <BogeyExpect cr={r.cr} slope={r.slope} par={r.par} />
      </div>
    </>
  );
}
