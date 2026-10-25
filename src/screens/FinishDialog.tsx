import { createPortal } from "react-dom";
import { useBack } from "../back";

/**
 * 라운드 종료(최종 확정) 확인: 파3·파4·파5 홀 수와 합계 파를 보여 주고 골프장 파가 맞는지 한 번 더 묻는다.
 * 파가 틀렸으면 취소하고 그 홀의 파를 고친 뒤 다시 종료한다
 */
export default function FinishDialog({
  pars,
  notes,
  warn,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  /** 홀마다 파 */
  pars: number[];
  /** 모드마다 덧붙이는 안내 (정산 확정·내 기록 고치기 등) */
  notes: string[];
  /** 저장하지 않은 입력 같은 주의 (빨간 글자) */
  warn?: string | null;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useBack(true, onClose);
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
          <b>파{total}</b> 골프장이에요. 맞으면 확정해 주세요.
        </p>
        {notes.map((n) => (
          <p className="fin-note" key={n}>
            {n}
          </p>
        ))}
        {warn && <p className="fin-note fin-warn">{warn}</p>}
        <p className="fin-note">파가 다르면 취소하고 그 홀의 파를 고쳐 주세요.</p>
        <button className="btn-primary" onClick={onConfirm}>
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
