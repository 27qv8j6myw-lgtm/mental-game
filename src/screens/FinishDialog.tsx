import { useState } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../back";
import { tailRange, tailWord, type EmptyTail } from "../model";

/**
 * 라운드 종료(최종 확정) 확인: 파3·파4·파5 홀 수와 합계 파를 보여 주고 골프장 파가 맞는지 한 번 더 묻는다.
 * 파가 틀렸으면 취소하고 그 홀의 파를 고친 뒤 다시 종료한다.
 * 중간에 끝내면(tail) 입력 안 된 뒤쪽 홀을 지우고 끝낼지 고른다 (처음엔 지우기)
 */
export default function FinishDialog({
  pars: allPars,
  notes,
  warn,
  tail,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  /** 홀마다 파 */
  pars: number[];
  /** 지울 수 있는 뒤쪽 홀 (마지막으로 친 홀 다음부터). 없으면 null */
  tail?: EmptyTail | null;
  /** 모드마다 덧붙이는 안내 (정산 확정·내 기록 고치기 등) */
  notes: string[];
  /** 저장하지 않은 입력 같은 주의 (빨간 글자) */
  warn?: string | null;
  confirmLabel: string;
  /** keep: 지우고 끝낼 때 남길 홀 수 */
  onConfirm: (keep?: number) => void;
  onClose: () => void;
}) {
  useBack(true, onClose);
  const [trim, setTrim] = useState(true);
  const trimming = !!tail && trim;
  // 지우고 끝내면 남길 홀의 파만 확인한다
  const pars = trimming ? allPars.slice(0, tail.keep) : allPars;
  const count = (p: number) => pars.filter((x) => x === p).length;
  const total = pars.reduce((a, p) => a + p, 0);
  const kinds = [3, 4, 5].map((p) => [p, count(p)] as const);

  return createPortal(
    <div className="alert-backdrop" onClick={onClose}>
      <div className="alert-box fin-box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>라운드를 종료할까요?</h3>
        {/* 파3·파4·파5 홀 수와 합계 파 */}
        <div className="fin-pars">
          {kinds.map(([p, n]) => (
            <div className="fin-par" key={p}>
              <span>파{p}</span>
              <b>{n}</b>
              <small>개</small>
            </div>
          ))}
          <div className="fin-par total">
            <span>{pars.length}홀</span>
            <b>{total}</b>
            <small>파</small>
          </div>
        </div>
        <p className="fin-q">
          {kinds
            .filter(([, n]) => n > 0)
            .map(([p, n]) => `파${p} ${n}개`)
            .join(", ")}
          {" 해서 "}
          {trimming ? (
            <>
              친 {pars.length}홀이 <b>파{total}</b>예요. 맞으면 확정해 주세요.
            </>
          ) : (
            <>
              <b>파{total}</b> 골프장이에요. 맞으면 확정해 주세요.
            </>
          )}
        </p>
        {tail && (
          <div className="toggle-row fin-trim" onClick={() => setTrim((v) => !v)}>
            <div className="tinfo">
              <span className="t">
                {tailWord(tail)} {tailRange(tail)} 홀 지우기
              </span>
              <span className="s">
                {trim
                  ? `${tail.keep}홀 라운드로 남겨요. 중간에 끝낸 라운드라 평균 타수에는 들어가지 않아요.`
                  : `${allPars.length}홀 라운드로 남기고 뒤쪽 홀은 빈칸으로 둬요.`}
              </span>
            </div>
            <div className={`switch ${trim ? "on" : ""}`} />
          </div>
        )}
        {notes.map((n) => (
          <p className="fin-note" key={n}>
            {n}
          </p>
        ))}
        {warn && <p className="fin-note fin-warn">{warn}</p>}
        <p className="fin-note">파가 다르면 취소하고 그 홀의 파를 고쳐 주세요.</p>
        <button className="btn-primary" onClick={() => onConfirm(trimming ? tail.keep : undefined)}>
          {confirmLabel}
        </button>
        <button className="name-cancel" onClick={onClose}>
          취소
        </button>
      </div>
    </div>,
    document.body
  );
}
