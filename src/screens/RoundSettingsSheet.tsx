import { useEffect, useState } from "react";
import { useRound } from "../round";
import { useBack } from "../back";
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
  RANK_METHOD_LABEL,
  RANK_PRIZE_LABEL,
  RULE_LABELS,
  SETTLE_LABEL,
  SKINS_RULE_LABELS,
  won,
} from "../util";
import { CLASSIC_SKINS } from "../betting";
import type {
  BetRules,
  GameMode,
  HandicapMode,
  PaymentMethod,
  RankRules,
  Session,
  SettleTiming,
  SkinsRules,
  StoredRules,
} from "../types";
import {
  CaddieFeeField,
  GameModeField,
  HandicapModeField,
  MaxMultiplierField,
  PaymentFields,
  RankMethodField,
  RankPrizeField,
  PlayerCountField,
  rankAmountsFor,
  RuleToggles,
  SkinsMultiplierFields,
  StrokeAdjField,
} from "./RoundFields";
import { rankRules } from "../rankGame";

/** "내는 돈 0원·10,000원·20,000원" (수정 내역용) */
const prizeText = (r: RankRules, n: number) =>
  r.prize === "none"
    ? RANK_PRIZE_LABEL.none
    : `${RANK_PRIZE_LABEL[r.prize]} ${Array.from({ length: n }, (_, i) => won(r.amounts[i] ?? 0)).join("·")}`;

/** 방장 전용: 게임 시작·정산 확정 후에도 게임 방식·지불 방법·핸디캡·배판(배수) 규칙을 고친다. */
export default function RoundSettingsSheet({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const { bundle, myUid, updateRound } = useRound();
  // 기기 뒤로가기: 시트 닫기
  useBack(true, onClose);
  const cfg = session.config;
  // 게임 시작 전(대기실): 금액·홀 수도 바꿀 수 있고, 이름·핸디는 각자 대기실에서 고친다. 수정 내역은 남기지 않는다
  const inLobby = session.status === "lobby";
  const [unit, setUnit] = useState(cfg.unit);
  const [holeCount, setHoleCount] = useState(bundle?.round.hole_count ?? 18);
  /** 몇 인 플레이 (예전 라운드는 지금 참여 인원) */
  const joined = bundle?.players.length ?? cfg.players.length;
  const [playerCount, setPlayerCountState] = useState(
    Math.min(5, Math.max(2, bundle?.round.rules.playerCount ?? joined))
  );
  const [gameMode, setGameMode] = useState<GameMode>(cfg.gameMode);
  // 캐디피·등수 내기는 방식을 바꾸지 않고 그 방식의 설정만 고친다
  const isCaddie = cfg.gameMode === "caddie";
  const isRank = cfg.gameMode === "rank";
  const isMoney = !isCaddie && !isRank;
  const [caddieFee, setCaddieFee] = useState(cfg.rules.caddie?.fee ?? 0);
  const rankInit = rankRules(cfg);
  const [rank, setRank] = useState<RankRules>(rankInit);
  const setPlayerCount = (n: number) => {
    setPlayerCountState(n);
    setRank((r) => ({ ...r, amounts: rankAmountsFor(r, Math.max(n, joined)) }));
  };
  /** 등수 내기 핸디 타수의 핸디 방식 (포인트·스킨스는 늘 타수 보정). 대기실에서만 바꾼다 */
  const [rankHm, setRankHm] = useState<HandicapMode>(
    isRank && rankInit.method === "net" ? cfg.handicapMode : "avg"
  );
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
  /** 배판 규칙을 쓰는지 (타당, 등수 내기 포인트 + 배판) / 스킨스 배수 조건을 쓰는지 (스킨스, 등수 내기 스킨스) */
  const usesStrokeRules = isMoney ? gameMode === "stroke" : isRank && rank.method === "points" && rank.multipliers;
  const usesSkins = isMoney ? gameMode === "skins" : isRank && rank.method === "skins";
  /** 지불 방법을 고르는지 (등수 내기는 주고받는 돈일 때만) */
  const showPayment = isMoney || (isRank && rank.prize === "exchange");
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
    if (isRank) {
      if (rank.method !== rankInit.method)
        items.push(`등수 정하는 방식: ${RANK_METHOD_LABEL[rankInit.method]} → ${RANK_METHOD_LABEL[rank.method]}`);
      if (rank.method === "points" && rank.multipliers !== rankInit.multipliers)
        items.push(`배판 적용: ${onOff(rankInit.multipliers)} → ${onOff(rank.multipliers)}`);
      const n = cfg.players.length;
      if (prizeText(rank, n) !== prizeText(rankInit, n))
        items.push(`등수 금액: ${prizeText(rankInit, n)} → ${prizeText(rank, n)}`);
    }
    // 스킨스는 배판 대신 배수 조건, 타당은 배판 규칙만 저장·기록한다
    if (usesSkins) {
      if (skins.maxMultiplier !== skinsInit.maxMultiplier)
        items.push(`스킨스 배수 총 상한: ${capLabel(skinsInit.maxMultiplier)} → ${capLabel(skins.maxMultiplier)}`);
      for (const [key, label] of SKINS_RULE_LABELS) {
        if (skins[key] !== skinsInit[key])
          items.push(`${label}: ${onOff(skinsInit[key])} → ${onOff(skins[key])}`);
      }
      return items;
    }
    if (!usesStrokeRules) return items;
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
      /** 방식별 설정: 등수 내기는 방식에 따라 핸디 방식·지불 방법이 정해진다 */
      const modeRules: Partial<StoredRules> = isCaddie
        ? { caddie: { fee: caddieFee } }
        : isRank
          ? {
              rank,
              handicapMode: rank.method === "net" ? rankHm : "adjust",
              payment: rank.prize === "exchange" ? payment : "cash",
            }
          : { gameMode, payment };
      if (inLobby) {
        const next: StoredRules = {
          ...bundle.round.rules,
          ...(usesStrokeRules && rules),
          ...(usesSkins && { skins }),
          ...modeRules,
          playerCount,
        };
        await updateRound({
          handicap_settle: settle,
          rules: next,
          ...(isMoney && unit > 0 && { unit }),
          hole_count: holeCount,
        });
        onClose();
        return;
      }
      let next: StoredRules = {
        ...bundle.round.rules,
        ...(usesStrokeRules && rules),
        ...(usesSkins && { skins }),
        ...modeRules,
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
      // 돈이 바뀌는 변경이라 라운드 중이든 종료 후든 모두에게 보이는 수정 내역에 남긴다
      if (items.length > 0) {
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
          <h3>{inLobby ? "라운드 설정 수정" : "정산 설정 수정"}</h3>
          <p className="hint">
            {inLobby
              ? "게임을 시작하기 전이라 금액·홀 수도 바꿀 수 있어요. 이름·핸디는 각자 대기실에서 고쳐요."
              : "방장만 고칠 수 있고, 저장하면 모든 참여자의 정산이 바로 다시 계산돼요."}
          </p>
        </div>

        <div className="sm-body">

        {inLobby && isCaddie && (
          <>
            <div className="section-title">캐디피</div>
            <div className="card">
              <CaddieFeeField fee={caddieFee} holeCount={holeCount} onChange={setCaddieFee} />
            </div>
          </>
        )}

        {inLobby && isMoney && (
          <>
            <div className="section-title">{gameMode === "skins" ? "홀당 금액" : "타당 금액"}</div>
            <div className="card">
              <div className="unit-chips">
                {[1000, 2000, 5000, 10000].map((u) => (
                  <button key={u} className={`chip ${unit === u ? "active" : ""}`} onClick={() => setUnit(u)}>
                    {won(u)}
                  </button>
                ))}
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  aria-label="금액 직접 입력 (원)"
                  value={unit ? unit.toLocaleString("ko-KR") : ""}
                  onChange={(e) => setUnit(Number(e.target.value.replace(/\D/g, "").slice(0, 9)) || 0)}
                />
              </div>
            </div>
          </>
        )}
        {inLobby && (
          <>
            <div className="section-title">홀 수</div>
            <div className="card">
              <div className="segmented">
                {[9, 18].map((h) => (
                  <button key={h} className={holeCount === h ? "active" : ""} onClick={() => setHoleCount(h)}>
                    {h}홀
                  </button>
                ))}
              </div>
            </div>
            <div className="section-title">인원</div>
            <div className="card">
              <PlayerCountField value={playerCount} onChange={setPlayerCount} />
            </div>
          </>
        )}

        {!inLobby && (
        <>
        <div className="section-title">참여자 이름</div>
        <div className="card">
          {cfg.players.map((p) => (
            <div className="gplayer name-edit-row" key={p.id}>
              <Avatar photoUrl={p.photoUrl} size={26} />
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

        </>
        )}

        {isMoney && (
          <>
            <div className="section-title">게임 방식</div>
            <div className="card">
              {/* 내기 라운드를 기록 모드로 바꾸지는 않는다 (정산·핸디 설정이 사라지므로) */}
              <GameModeField value={gameMode} onChange={setGameMode} modes={["stroke", "skins"]} />
            </div>
          </>
        )}

        {isRank && (
          <>
            <div className="section-title">등수 정하는 방식</div>
            <div className="card">
              {/* 시작한 뒤에는 핸디 방식이 달라져 방식은 대기실에서만 바꾼다 */}
              {inLobby ? (
                <RankMethodField value={rank.method} onChange={(method) => setRank((r) => ({ ...r, method }))} />
              ) : (
                <p className="hint" style={{ margin: 0 }}>
                  <b>{RANK_METHOD_LABEL[rank.method]}</b> · 방식은 게임 시작 전에만 바꿀 수 있어요.
                </p>
              )}
              {rank.method === "points" && (
                <div className="toggle-row rank-mult" onClick={() => setRank((r) => ({ ...r, multipliers: !r.multipliers }))}>
                  <div className="tinfo">
                    <span className="t">배판 적용</span>
                    <span className="s">
                      {rank.multipliers
                        ? "배판 규칙·이월·버디 추가 포인트를 그대로 써요."
                        : "배판·이월·버디 추가 없이 타수 차이만 포인트로 쌓아요."}
                    </span>
                  </div>
                  <div className={`switch ${rank.multipliers ? "on" : ""}`} />
                </div>
              )}
            </div>
            {inLobby && rank.method === "net" && (
              <>
                <div className="section-title">핸디캡 설정 방식</div>
                <div className="card">
                  <HandicapModeField value={rankHm} onChange={setRankHm} />
                </div>
              </>
            )}
            <div className="section-title">등수 금액</div>
            <div className="card">
              <RankPrizeField rules={rank} onChange={setRank} count={Math.max(2, playerCount, bundle.players.length)} />
            </div>
          </>
        )}

        {showPayment && (
          <>
            <div className="section-title">지불 방법</div>
            <div className="card">
              <PaymentFields
                payment={payment}
                settle={settle}
                onChange={(p, s) => {
                  setPayment(p);
                  setSettle(s);
                }}
                showSettle={isMoney && !isAdjust}
              />
            </div>
          </>
        )}

        {!inLobby && (
        <>
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
                <Avatar photoUrl={p.photoUrl} size={22} />
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
        </>
        )}

        {usesSkins && (
          <>
            <div className="section-title">배수 조건</div>
            <div className="card">
              <SkinsMultiplierFields value={skins} onChange={setSkins} />
            </div>
          </>
        )}

        {usesStrokeRules && (
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
