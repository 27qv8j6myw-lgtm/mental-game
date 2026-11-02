import { useState } from "react";
import { emptyTail, tailRange, tailWord } from "../model";
import { useRound } from "../round";

/**
 * 종료된 라운드(방장): 중간에 끝내 입력 안 된 뒤쪽 홀이 남아 있으면 지우기.
 * 지우면 남긴 홀 수의 라운드가 된다 (정산은 그대로, 18홀을 다 치지 않아 평균 타수에는 들어가지 않는다)
 */
export default function TrimHolesCard() {
  const { bundle, isHost, status, trimHoles } = useRound();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tail = bundle && isHost && status === "done" ? emptyTail(bundle) : null;
  if (!tail) return null;
  const range = tailRange(tail);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      await trimHoles(tail.keep);
      setAsking(false);
    } catch (e) {
      console.error(e);
      setErr(
        !navigator.onLine
          ? "연결이 안 돼서 지우지 못했어요. 연결을 확인하고 다시 눌러 주세요."
          : "홀을 지우지 못했어요. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card trim-card">
      <div className="trim-t">
        {tailWord(tail)} {range} 홀이 남아 있어요
      </div>
      <p className="hint">
        지우면 {tail.keep}홀 라운드로 남아요. 정산은 그대로이고, 중간에 끝낸 라운드라 평균 타수에는 들어가지 않아요.
      </p>
      {asking ? (
        <div className="trim-actions">
          <button className="trim-cancel" disabled={busy} onClick={() => setAsking(false)}>
            취소
          </button>
          <button className="trim-go" disabled={busy} onClick={run}>
            {busy ? "지우는 중…" : `${range} 홀 지우기`}
          </button>
        </div>
      ) : (
        <button className="trim-ask" onClick={() => setAsking(true)}>
          {range} 홀 지우기
        </button>
      )}
      {err && <p className="hint trim-err">{err}</p>}
    </div>
  );
}
