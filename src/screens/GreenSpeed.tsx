import { useState } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../back";
import {
  GREEN_SPEED_DEFAULT,
  GREEN_SPEED_LABEL,
  GREEN_SPEED_RANGE,
  GreenSpeedSetupError,
  greenSpeedClass,
  greenSpeedText,
  parseGreenSpeed,
} from "../greenSpeed";

/**
 * 기록 스코어카드 오른쪽 위: 그린스피드 배지 (게임 방식 배지와 같은 크기).
 * 값이 없으면 '＋ 그린스피드' (넣을 수 있는 사람만), 있으면 "그린 2.8m · 약간 빠름" (빠르기 색).
 * onSave 가 있으면 눌러서 넣고 고친다 (내 라운드 기록에서만)
 */
export function GreenSpeedButton({ value, onSave }: { value: number | null; onSave?: (v: number | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  if (value == null && !onSave) return null;
  const body = value == null ? "＋ 그린스피드" : `그린 ${greenSpeedText(value)} · ${GREEN_SPEED_LABEL[greenSpeedClass(value)]}`;
  const cls = `gs-btn ${value == null ? "empty" : `gs${greenSpeedClass(value)}`}`;
  return (
    <>
      {onSave ? (
        <button className={cls} onClick={() => setOpen(true)}>
          {body}
        </button>
      ) : (
        <span className={`${cls} static`}>{body}</span>
      )}
      {open && onSave && <GreenSpeedDialog initial={value} onSave={onSave} onClose={() => setOpen(false)} />}
    </>
  );
}

/** 그린스피드 넣기·고치기 (빈칸으로 두거나 '지우기'면 지운다) */
export function GreenSpeedDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: number | null;
  onSave: (v: number | null) => Promise<void>;
  onClose: () => void;
}) {
  useBack(true, onClose);
  const [text, setText] = useState((initial ?? GREEN_SPEED_DEFAULT).toFixed(1));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const v = parseGreenSpeed(text);

  const save = async (next: number | null) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSave(next);
      onClose();
    } catch (e) {
      console.error("그린스피드 저장 실패", e);
      setErr(
        e instanceof GreenSpeedSetupError
          ? "서버 설정이 아직 안 돼서 저장하지 못했어요."
          : "저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요."
      );
      setBusy(false);
    }
  };

  return createPortal(
    <div className="alert-backdrop" onClick={busy ? undefined : onClose}>
      <div className="alert-box name-box gs-box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>그린스피드</h3>
        <span className="name-desc">스팀프미터로 잰 그린 빠르기예요. 골프장 안내판이나 캐디에게 물어보면 알 수 있어요.</span>
        <div className="gs-field">
          <input
            className="input"
            value={text}
            inputMode="decimal"
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save(v)}
          />
          <span className="gs-unit">m</span>
        </div>
        {/* 다섯 단계 눈금: 같은 크기 배지, 지금 값의 단계만 색 */}
        <div className="gs-scale">
          {GREEN_SPEED_LABEL.map((label, i) => (
            <span key={label} className={`gs-step ${v != null && greenSpeedClass(v) === i ? `on gs${i}` : ""}`}>
              <b>{label}</b>
              <small>{GREEN_SPEED_RANGE[i]}</small>
            </span>
          ))}
        </div>
        {err && <div className="name-err">{err}</div>}
        <button className="btn-primary" disabled={busy || (v == null && initial == null)} onClick={() => void save(v)}>
          {busy ? "저장하는 중…" : "저장"}
        </button>
        {initial != null && (
          <button className="name-cancel gs-clear" disabled={busy} onClick={() => void save(null)}>
            지우기
          </button>
        )}
        <button className="name-cancel" disabled={busy} onClick={onClose}>
          취소
        </button>
      </div>
    </div>,
    document.body
  );
}
