import type { Coaching } from "../coach";

/** 홀 상태 칸 위에 떠 있는 AI 홀 코칭 (두 줄). 누르면 닫힌다 */
export default function CoachCard({ coaching, onClose }: { coaching: Coaching; onClose: () => void }) {
  return (
    <button type="button" className={`coach-card ${coaching.loading ? "loading" : ""}`} role="status" onClick={onClose}>
      {coaching.loading ? (
        <span className="coach-wait">{coaching.hole + 1}번 홀 기록을 보는 중…</span>
      ) : coaching.error ? (
        <span className="coach-wait">{coaching.error}</span>
      ) : (
        coaching.lines.map((l, i) => (
          <span key={i} className="coach-line">
            {l}
          </span>
        ))
      )}
    </button>
  );
}
