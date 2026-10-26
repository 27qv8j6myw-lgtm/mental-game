import { useEffect, useRef, useState } from "react";
import type { ParValue } from "../types";

/** 라운드별로 PAR 를 고른 홀 (홀 진행 ↔ 정산 화면을 오가며 다시 그려져도 다시 묻지 않게) */
const pickedByRound = new Map<string, Set<number>>();

/**
 * 이 홀 PAR 를 아직 안 골랐는지. 처음엔 모든 홀이 PAR 4 라서, 저장 전 홀로 넘어오면 고르라고 묻는다.
 * 여기서 PAR 를 누르거나 다른 사람이 이 홀 PAR 를 바꾸면 그 홀은 더 묻지 않는다
 */
export function useParAsk(roundId: string | null, idx: number, par: number) {
  const key = roundId ?? "";
  const [, rerender] = useState(0);
  const picked = pickedByRound.get(key) ?? new Set<number>();
  const pick = () => {
    if (picked.has(idx)) return;
    pickedByRound.set(key, new Set(picked).add(idx));
    rerender((n) => n + 1);
  };
  const prev = useRef({ idx, par });
  useEffect(() => {
    if (prev.current.idx === idx && prev.current.par !== par) pick();
    prev.current = { idx, par };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, par]);
  return { unpicked: !picked.has(idx), pick };
}

/** 노란 상태 칸 안내 두 줄: 위 "홀별 기준 타수를 설정하세요", 아래 지금 상태 (칸 높이는 그대로) */
export function ParAskStatus({ sub }: { sub: string }) {
  return (
    <>
      <span className="ask-main">홀별 기준 타수를 설정하세요</span>
      <span className="ask-sub">{sub}</span>
    </>
  );
}

/** 홀 PAR 3 · 4 · 5. ask 면 버튼을 파란 테두리로 강조한다 (안내는 위 노란 상태 칸에. 홀을 옮길 때마다 key 로 다시 그려 애니메이션을 다시 튼다) */
export default function ParPicker({
  par,
  disabled,
  ask,
  onPick,
}: {
  par: number;
  disabled?: boolean;
  ask: boolean;
  onPick: (p: ParValue) => void;
}) {
  return (
    <div className={`par-seg ${ask ? "ask" : ""}`}>
      {([3, 4, 5] as ParValue[]).map((p) => (
        <button key={p} className={par === p ? "active" : ""} disabled={disabled} onClick={() => onPick(p)}>
          PAR {p}
        </button>
      ))}
    </div>
  );
}
