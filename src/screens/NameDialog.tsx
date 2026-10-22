import { useState } from "react";
import { useAuth } from "../auth";

/** 이름 길이 (실명 기준으로 넉넉하게) */
const MAX_NAME = 20;

/**
 * 앱에서 쓸 이름(실명) 정하기. 카카오 닉네임이 별명인 경우가 많아 처음 로그인할 때 묻는다.
 * onClose 가 없으면 닫을 수 없다 (처음 정할 때). 프로필 메뉴의 '내 이름 바꾸기'에서는 닫을 수 있다.
 * 관리자가 다른 사람 이름을 고칠 때는 title·desc·onSave 를 넘긴다
 */
export default function NameDialog({
  initial,
  onClose,
  title,
  desc,
  onSave,
  allowEmpty = false,
}: {
  initial: string;
  onClose?: () => void;
  title?: string;
  desc?: string;
  /** 저장. 성공하면 true (없으면 내 이름으로 저장) */
  onSave?: (name: string) => Promise<boolean>;
  /** 빈 값도 저장 (관리자: 실명을 지워 다음 로그인 때 다시 묻게) */
  allowEmpty?: boolean;
}) {
  const { saveName } = useAuth();
  const save = onSave ?? saveName;
  const [name, setName] = useState(initial.slice(0, MAX_NAME));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trimmed = name.trim();
  const canSave = !!trimmed || allowEmpty;

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setErr(null);
    const ok = await save(trimmed);
    setBusy(false);
    if (!ok) {
      setErr("저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
      return;
    }
    onClose?.();
  };

  return (
    <div className="alert-backdrop" onClick={onClose}>
      <div className="alert-box name-box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{title ?? (onClose ? "내 이름 바꾸기" : "이름을 알려 주세요")}</h3>
        <span className="name-desc">
          {desc ?? "함께 치는 사람들이 알아볼 수 있게 실명을 적어 주세요. 라운드·전적·랭킹에 이 이름이 나와요."}
        </span>
        <input
          className="input"
          value={name}
          maxLength={MAX_NAME}
          placeholder="예: 홍길동"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        {err && <div className="name-err">{err}</div>}
        <button className="btn-primary" disabled={!canSave || busy} onClick={() => void submit()}>
          {busy ? "저장하는 중…" : "저장"}
        </button>
        {onClose && (
          <button className="name-cancel" onClick={onClose}>
            취소
          </button>
        )}
      </div>
    </div>
  );
}
