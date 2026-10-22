import { Icon } from "../icons";
import type { Coaching } from "../coach";

/** 홀 상태 칸 위에 떠 있는 AI 홀 코칭 (두 줄). X 로 닫는다 */
export default function CoachCard({ coaching, onClose }: { coaching: Coaching; onClose: () => void }) {
  return (
    <div className={`coach-card ${coaching.loading ? "loading" : ""}`} role="status">
      <Icon name="spark" size={15} className="coach-ic" />
      <div className="coach-body">
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
      </div>
      <button className="coach-x" aria-label="코칭 닫기" onClick={onClose}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
