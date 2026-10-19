import { useEffect, useState } from "react";

const BANKS = [
  "카카오뱅크",
  "토스뱅크",
  "국민",
  "신한",
  "우리",
  "하나",
  "농협",
  "기업",
  "케이뱅크",
  "새마을",
  "우체국",
  "SC제일",
  "씨티",
  "수협",
  "신협",
  "부산",
  "대구",
  "경남",
  "광주",
  "전북",
  "제주",
  "산업",
];

/** 계좌번호는 숫자와 하이픈만 */
const cleanAccount = (v: string) => v.replace(/[^\d-]/g, "");

/** 받을 계좌(은행명 / 계좌번호) 입력. 계좌번호 옆 저장을 눌러야 저장되고, 저장되면 ✓ 만 보인다. */
export default function AccountField({
  label,
  bank,
  account,
  onSave,
}: {
  label: string;
  bank: string | null;
  account: string | null;
  onSave: (bank: string, account: string) => Promise<void> | void;
}) {
  const [b, setB] = useState(bank ?? "");
  const [a, setA] = useState(account ?? "");
  const [saving, setSaving] = useState(false);

  // 다른 기기·자동 입력으로 값이 바뀌면 반영 (편집 중이 아닐 때)
  useEffect(() => {
    setB(bank ?? "");
    setA(account ?? "");
  }, [bank, account]);

  const dirty = b.trim() !== (bank ?? "") || a !== (account ?? "");
  const valid = b.trim().length > 0 && a.replace(/\D/g, "").length >= 6;
  const saved = !dirty && !!account;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave(b.trim(), a);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-field">
      <div className="af-label">{label}</div>
      <div className="af-row">
        <input
          className="input af-bank"
          list="bank-list"
          placeholder="은행"
          aria-label="은행명"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
        <input
          className="input af-number"
          inputMode="numeric"
          placeholder="계좌번호"
          aria-label="계좌번호"
          value={a}
          onChange={(e) => setA(cleanAccount(e.target.value))}
        />
        <div className="af-action">
          {saved ? (
            <span className="af-saved" role="img" aria-label="저장됨">
              ✓
            </span>
          ) : (
            <button className="af-save" disabled={!valid || saving} onClick={() => void save()}>
              {saving ? "…" : "저장"}
            </button>
          )}
        </div>
      </div>
      <datalist id="bank-list">
        {BANKS.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}
