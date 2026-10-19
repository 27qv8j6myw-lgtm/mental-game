import { useState } from "react";
import { useRound } from "../round";
import { Avatar } from "../icons";
import { hcLabel } from "../util";
import type { BetRules, PaymentMethod, Session, SettleTiming } from "../types";
import { PaymentFields, RuleToggles } from "./RoundFields";

/** 방장 전용: 게임 시작·정산 확정 후에도 지불 방법·핸디캡·배판 규칙을 고친다. */
export default function RoundSettingsSheet({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const { bundle, updateRound } = useRound();
  const cfg = session.config;
  const [payment, setPayment] = useState<PaymentMethod>(cfg.payment);
  const [settle, setSettle] = useState<SettleTiming>(cfg.handicapSettle);
  const [rules, setRules] = useState<BetRules>({
    parPenalty: cfg.rules.parPenalty,
    doublePar: !!cfg.rules.doublePar,
    tie: cfg.rules.tie,
    birdieDouble: cfg.rules.birdieDouble,
  });
  const [hc, setHc] = useState<Record<string, number>>(() =>
    Object.fromEntries(cfg.players.map((p) => [p.id, p.handicap]))
  );
  const isAvg = cfg.handicapMode === "avg";
  const [avg, setAvg] = useState<Record<string, number | null>>(() => {
    const ov = bundle?.round.rules.avgOverrides ?? {};
    return Object.fromEntries(
      (bundle?.players ?? []).map((p) => [
        p.user_uid,
        p.user_uid in ov ? ov[p.user_uid] : p.avg_score,
      ])
    );
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!bundle) return null;

  const bump = (id: string, d: number) =>
    setHc((m) => ({ ...m, [id]: Math.max(0, Math.min(54, (m[id] ?? 0) + d)) }));

  // 대기실과 같은 규칙: 평균을 바꾸면 핸디 = 평균 − 72 로 다시 계산, 이후 ± 로 조정
  const changeAvg = (id: string, val: string) => {
    if (val.trim() === "") {
      setAvg((m) => ({ ...m, [id]: null }));
      return;
    }
    const n = Number(val);
    if (Number.isNaN(n)) return;
    const v = Math.max(0, Math.min(200, Math.round(n)));
    setAvg((m) => ({ ...m, [id]: v }));
    setHc((m) => ({ ...m, [id]: Math.max(0, v - 72) }));
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await updateRound({
        handicap_settle: settle,
        rules: {
          ...bundle.round.rules,
          ...rules,
          payment,
          hcOverrides: hc,
          ...(isAvg && { avgOverrides: avg }),
        },
      });
      onClose();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErr("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>정산 설정 수정</h3>
        <p className="hint">방장만 고칠 수 있고, 저장하면 모든 참여자의 정산이 바로 다시 계산돼요.</p>

        <div className="section-title">지불 방법</div>
        <div className="card">
          <PaymentFields
            payment={payment}
            settle={settle}
            onChange={(p, s) => {
              setPayment(p);
              setSettle(s);
            }}
          />
        </div>

        <div className="section-title">
          핸디캡{cfg.handicapMode === "stroke" ? " (기준 인원 대비)" : ""}
        </div>
        <div className="card">
          {isAvg && (
            <div className="hc-edit-head">
              <span>이름</span>
              <span>평균타수</span>
              <span>핸디캡</span>
            </div>
          )}
          {cfg.players.map((p) => (
            <div
              className={`gplayer ${isAvg ? "hc-edit-row" : ""}`}
              key={p.id}
              style={isAvg ? undefined : { justifyContent: "space-between" }}
            >
              <span className="gp-name">
                <Avatar photoUrl={p.photoUrl} gender={p.gender} size={22} />
                <b>{p.name || "?"}</b>
              </span>
              {isAvg && (
                <input
                  className="input avg-mini"
                  type="number"
                  inputMode="numeric"
                  placeholder="–"
                  aria-label={`${p.name} 평균타수`}
                  value={avg[p.id] ?? ""}
                  onChange={(e) => changeAvg(p.id, e.target.value)}
                />
              )}
              <div className="stepper sm">
                <button onClick={() => bump(p.id, -1)}>−</button>
                <span>{hcLabel(hc[p.id] ?? 0)}</span>
                <button onClick={() => bump(p.id, 1)}>＋</button>
              </div>
            </div>
          ))}
          {isAvg && (
            <p className="hint" style={{ marginTop: 8 }}>
              평균타수를 바꾸면 핸디가 평균−72로 다시 계산되고, ±로 조정할 수 있어요.
            </p>
          )}
        </div>

        <div className="section-title">배판 규칙</div>
        <div className="card">
          <RuleToggles rules={rules} onChange={setRules} />
        </div>

        {err && <p className="hint" style={{ color: "var(--loss)" }}>{err}</p>}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            취소
          </button>
          <button className="btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? "저장 중…" : "수정 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}
