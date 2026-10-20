import { useEffect, useState } from "react";
import { useRound } from "../round";
import { Avatar } from "../icons";
import {
  adjLabel,
  appendEditLog,
  capLabel,
  DEFAULT_SKINS_RULES,
  GAME_MODE_LABEL,
  hcLabel,
  onOff,
  PAYMENT_LABEL,
  RULE_LABELS,
  SETTLE_LABEL,
  SKINS_RULE_LABELS,
} from "../util";
import { CLASSIC_SKINS } from "../betting";
import type {
  BetRules,
  GameMode,
  PaymentMethod,
  Session,
  SettleTiming,
  SkinsRules,
  StoredRules,
} from "../types";
import {
  GameModeField,
  MaxMultiplierField,
  PaymentFields,
  RuleToggles,
  SkinsMultiplierFields,
  StrokeAdjField,
} from "./RoundFields";

/** 방장 전용: 게임 시작·정산 확정 후에도 게임 방식·지불 방법·핸디캡·배판(배수) 규칙을 고친다. */
export default function RoundSettingsSheet({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const { bundle, myUid, updateRound } = useRound();
  const cfg = session.config;
  const [gameMode, setGameMode] = useState<GameMode>(cfg.gameMode);
  const isStroke = gameMode === "stroke";
  const [payment, setPayment] = useState<PaymentMethod>(cfg.payment);
  const [settle, setSettle] = useState<SettleTiming>(cfg.handicapSettle);
  const [rules, setRules] = useState<BetRules>({
    parPenalty: cfg.rules.parPenalty,
    doublePar: !!cfg.rules.doublePar,
    tie: cfg.rules.tie,
    birdieDouble: cfg.rules.birdieDouble,
    // 값이 없는 예전 라운드는 ×2
    maxMultiplier: cfg.rules.maxMultiplier === undefined ? 2 : cfg.rules.maxMultiplier,
  });
  // 배수 조건이 없는 예전 스킨스 라운드는 모두 꺼진 상태, 타당에서 바꾸면 새 라운드 기본값
  const skinsInit = cfg.rules.skins ?? (cfg.gameMode === "skins" ? CLASSIC_SKINS : DEFAULT_SKINS_RULES);
  const [skins, setSkins] = useState<SkinsRules>(skinsInit);
  const [hc, setHc] = useState<Record<string, number>>(() =>
    Object.fromEntries(cfg.players.map((p) => [p.id, p.handicap]))
  );
  const isAvg = cfg.handicapMode === "avg";
  const isAdjust = cfg.handicapMode === "adjust";
  const [adj, setAdj] = useState<Record<string, number>>(() =>
    Object.fromEntries(cfg.players.map((p) => [p.id, p.strokeAdj ?? 0]))
  );
  const [avgInit] = useState<Record<string, number | null>>(() => {
    const ov = bundle?.round.rules.avgOverrides ?? {};
    return Object.fromEntries(
      (bundle?.players ?? []).map((p) => [
        p.user_uid,
        p.user_uid in ov ? ov[p.user_uid] : p.avg_score,
      ])
    );
  });
  const [avg, setAvg] = useState(avgInit);
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(cfg.players.map((p) => [p.id, p.name]))
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 시트가 열려 있는 동안 뒤쪽 페이지가 같이 스크롤되지 않게 막는다
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!bundle) return null;

  /** 비워 두면 원래 이름 유지 */
  const finalName = (id: string, current: string) => names[id]?.trim() || current;

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

  /** 정산 확정 후 수정 내역에 남길 문장들 */
  const changes = () => {
    const items: string[] = [];
    if (gameMode !== cfg.gameMode)
      items.push(`게임 방식: ${GAME_MODE_LABEL[cfg.gameMode]} → ${GAME_MODE_LABEL[gameMode]}`);
    if (payment !== cfg.payment)
      items.push(`지불 방법: ${PAYMENT_LABEL[cfg.payment]} → ${PAYMENT_LABEL[payment]}`);
    if (!isAdjust && settle !== cfg.handicapSettle)
      items.push(`핸디캡 정산: ${SETTLE_LABEL[cfg.handicapSettle]} → ${SETTLE_LABEL[settle]}`);
    for (const p of cfg.players) {
      const name = p.name || "?";
      const renamed = finalName(p.id, p.name);
      if (renamed !== p.name) items.push(`이름: ${name} → ${renamed}`);
      const a0 = avgInit[p.id] ?? null;
      const a1 = avg[p.id] ?? null;
      if (isAvg && a0 !== a1)
        items.push(`${name} 평균타수: ${a0 ?? "미입력"} → ${a1 ?? "미입력"}`);
      if (!isAdjust && (hc[p.id] ?? 0) !== p.handicap)
        items.push(`${name} 핸디: ${hcLabel(p.handicap)} → ${hcLabel(hc[p.id] ?? 0)}`);
      if (isAdjust && (adj[p.id] ?? 0) !== (p.strokeAdj ?? 0))
        items.push(`${name} 타수 보정: ${adjLabel(p.strokeAdj ?? 0)} → ${adjLabel(adj[p.id] ?? 0)}`);
    }
    // 스킨스는 배판 대신 배수 조건, 타당은 배판 규칙만 저장·기록한다
    if (!isStroke) {
      if (skins.maxMultiplier !== skinsInit.maxMultiplier)
        items.push(`스킨스 배수 총 상한: ${capLabel(skinsInit.maxMultiplier)} → ${capLabel(skins.maxMultiplier)}`);
      for (const [key, label] of SKINS_RULE_LABELS) {
        if (skins[key] !== skinsInit[key])
          items.push(`${label}: ${onOff(skinsInit[key])} → ${onOff(skins[key])}`);
      }
      return items;
    }
    if (rules.maxMultiplier !== (cfg.rules.maxMultiplier === undefined ? 2 : cfg.rules.maxMultiplier))
      items.push(`배수 총 상한: ${capLabel(cfg.rules.maxMultiplier)} → ${capLabel(rules.maxMultiplier)}`);
    for (const [key, label] of RULE_LABELS) {
      if (!!rules[key] !== !!cfg.rules[key])
        items.push(`${label}: ${onOff(cfg.rules[key])} → ${onOff(rules[key])}`);
    }
    return items;
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      let next: StoredRules = {
        ...bundle.round.rules,
        ...(isStroke ? rules : { skins }),
        gameMode,
        payment,
        hcOverrides: hc,
        ...(isAdjust && { strokeAdj: adj }),
        ...(isAvg && { avgOverrides: avg }),
        nameOverrides: Object.fromEntries(
          bundle.players
            .map((row) => {
              const cur = cfg.players.find((p) => p.id === row.user_uid)?.name ?? row.name;
              return [row.user_uid, finalName(row.user_uid, cur)] as const;
            })
            .filter(([uid, name]) => name !== bundle.players.find((r) => r.user_uid === uid)?.name)
        ),
      };
      const items = changes();
      if (session.status === "done" && items.length > 0) {
        const by = cfg.players.find((p) => p.id === myUid)?.name || "방장";
        next = appendEditLog(next, by, items);
      }
      await updateRound({ handicap_settle: settle, rules: next });
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
        <div className="sm-head">
          <h3>정산 설정 수정</h3>
          <p className="hint">
            방장만 고칠 수 있고, 저장하면 모든 참여자의 정산이 바로 다시 계산돼요.
          </p>
        </div>

        <div className="sm-body">

        <div className="section-title">참여자 이름</div>
        <div className="card">
          {cfg.players.map((p) => (
            <div className="gplayer name-edit-row" key={p.id}>
              <Avatar photoUrl={p.photoUrl} gender={p.gender} size={26} />
              <input
                className="input"
                value={names[p.id] ?? ""}
                placeholder={p.name || "이름"}
                aria-label={`${p.name} 이름`}
                onChange={(e) => setNames((m) => ({ ...m, [p.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="section-title">게임 방식</div>
        <div className="card">
          <GameModeField value={gameMode} onChange={setGameMode} />
        </div>

        <div className="section-title">지불 방법</div>
        <div className="card">
          <PaymentFields
            payment={payment}
            settle={settle}
            onChange={(p, s) => {
              setPayment(p);
              setSettle(s);
            }}
            showSettle={!isAdjust}
          />
        </div>

        <div className="section-title">
          핸디캡
          {cfg.handicapMode === "stroke" ? " (최저핸디 대비)" : isAdjust ? " (타수 보정)" : ""}
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
                <b>{finalName(p.id, p.name) || "?"}</b>
              </span>
              {isAdjust ? (
                <StrokeAdjField
                  label={`${p.name} 타수 보정`}
                  value={adj[p.id] ?? 0}
                  onChange={(v) => setAdj((m) => ({ ...m, [p.id]: v }))}
                />
              ) : null}
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
              {!isAdjust && (
                <div className="stepper sm">
                  <button onClick={() => bump(p.id, -1)}>−</button>
                  <span>{hcLabel(hc[p.id] ?? 0)}</span>
                  <button onClick={() => bump(p.id, 1)}>＋</button>
                </div>
              )}
            </div>
          ))}
          {isAdjust && (
            <p className="hint" style={{ marginTop: 8 }}>
              파4·파5 홀에서 보기 이상이면 고른 타수만큼 빼고(파까지만) 승패를 가려요.
            </p>
          )}
          {isAvg && (
            <p className="hint" style={{ marginTop: 8 }}>
              평균타수를 바꾸면 핸디가 평균−72로 다시 계산되고, ±로 조정할 수 있어요.
            </p>
          )}
        </div>

        {!isStroke && (
          <>
            <div className="section-title">배수 조건</div>
            <div className="card">
              <SkinsMultiplierFields value={skins} onChange={setSkins} />
            </div>
          </>
        )}

        {isStroke && (
          <>
            <div className="section-title">배수 총 상한</div>
            <div className="card">
              <MaxMultiplierField
                value={rules.maxMultiplier ?? null}
                onChange={(v) => setRules((r) => ({ ...r, maxMultiplier: v }))}
              />
            </div>

            <div className="section-title">배판 규칙</div>
            <div className="card">
              <RuleToggles rules={rules} onChange={setRules} />
            </div>
          </>
        )}

        </div>

        <div className="sm-foot">
          {err && <p className="hint" style={{ color: "var(--loss)", marginBottom: 8 }}>{err}</p>}
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
    </div>
  );
}
