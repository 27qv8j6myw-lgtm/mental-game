import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  adjustedRel,
  birdieEvents,
  birdieNet,
  gameNet,
  handicapNet,
  holeBreakdowns,
  skinsResult,
  totalNet,
} from "../betting";
import {
  adjLabel,
  hcLabel,
  logTime,
  PAYMENT_LABEL,
  relLabel,
  scoreLabel,
  settleNote,
  won,
  wonSigned,
} from "../util";
import { Avatar, Icon } from "../icons";
import type { HoleScore, Session, Transfer } from "../types";
import RoundSettingsSheet from "./RoundSettingsSheet";
import AccountField from "./AccountField";
import { useRound } from "../round";
import { useAuth } from "../auth";
import { settledHoles } from "../model";

/** 클립보드 복사 (구형 브라우저는 textarea 로 대체) */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/** 홀별 검증 표 금액 (원 단위, 단위 표시 없이 부호만): 40,000 → +40,000 */
const signedWon = (n: number) => {
  const r = Math.round(n);
  return r === 0 ? "0" : `${r > 0 ? "+" : "-"}${Math.abs(r).toLocaleString("ko-KR")}`;
};
/** 홀별 검증 표 금액 (만원 단위, 천원 단위는 소수점): 125,000 → +12.5만 */
const signedMan = (n: number) => {
  const r = Math.round(n);
  if (r === 0) return "0";
  const man = (Math.abs(r) / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 4 });
  return `${r > 0 ? "+" : "-"}${man}만`;
};

const tone = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

/** 홀별 검증 표 금액 글자 크기(px). 만원 단위로도 안 들어갈 만큼 크면 그때만 줄인다 */
const AMT_MAX = 13;
const AMT_MIN = 9;

export default function ResultsScreen({
  session,
  onEditScores,
}: {
  session: Session;
  onEditScores: () => void;
}) {
  const { config } = session;
  // 정산은 저장된 홀만 (홀 저장 방식에서 입력 중인 홀은 빠진다)
  const holes = useMemo(() => settledHoles(session.holes), [session.holes]);
  const savingNow = session.holeSave && session.status === "playing";
  const savedCount = session.holes.filter((h) => h.saved !== false).length;
  const isPost = config.handicapSettle === "post";
  const [vi, setVi] = useState(0);
  const [editing, setEditing] = useState(false);
  const { myUid, updateMe } = useRound();
  const { saveBankAccount } = useAuth();
  const [copied, setCopied] = useState<string | null>(null);
  /** 버디 추가 정산: 내역을 펼친 사람 */
  const [bdOpen, setBdOpen] = useState<Record<string, boolean>>({});
  const isTransfer = config.payment === "transfer";
  const me = config.players.find((p) => p.id === myUid);

  const copy = async (key: string, text: string) => {
    await copyToClipboard(text);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  const game = useMemo(() => gameNet(config, holes), [config, holes]);
  const bird = useMemo(() => birdieNet(config, holes), [config, holes]);
  const birdies = useMemo(() => birdieEvents(config, holes), [config, holes]);
  const breakdowns = useMemo(() => holeBreakdowns(config, holes), [config, holes]);
  const hc = useMemo(() => handicapNet(config), [config]);
  const final = useMemo(() => totalNet(config, holes, isPost), [config, holes, isPost]);
  const isSkins = config.gameMode === "skins";
  const isAdjust = config.handicapMode === "adjust";
  const skins = useMemo(() => (isSkins ? skinsResult(config, holes) : null), [isSkins, config, holes]);
  /** 섹션 번호: 타당 기준 번호를 받아, 스킨스는 버디 섹션이 없으니 그 뒤를 하나씩 당긴다 */
  const N = (k: number) => "①②③④⑤⑥"[(isSkins && k > 2 ? k - 1 : k) - 1];

  const nameOf = (id: string) => config.players.find((p) => p.id === id)!;
  const isPlayed = (h: HoleScore) => Object.values(h.scores).some((s) => s !== null);
  const playedHoles = holes.filter(isPlayed).length;

  const grossOf = (id: string) =>
    holes.reduce((s, h) => (h.scores[id] != null ? s + h.par + (h.scores[id] as number) : s), 0);
  /** 그 사람이 친 홀들의 파 합계 (18홀 기본 72, 파 설정에 따라 71 등으로 자동 계산) */
  const parOf = (id: string) => holes.reduce((s, h) => (h.scores[id] != null ? s + h.par : s), 0);

  const standings = [...config.players]
    .map((p) => ({ p, net: final.net[p.id] ?? 0 }))
    .sort((a, b) => b.net - a.net);

  const NetList = ({ net }: { net: Record<string, number> }) => (
    <div className="card">
      {config.players.map((p) => {
        const v = net[p.id] ?? 0;
        return (
          <div className="gplayer" key={p.id} style={{ justifyContent: "space-between" }}>
            <span className="gp-name">
              <Avatar photoUrl={p.photoUrl} gender={p.gender} size={22} />
              <b>{p.name || "?"}</b>
            </span>
            <span className={tone(v)} style={{ fontWeight: 900 }}>
              {v === 0 ? "±0원" : wonSigned(v)}
            </span>
          </div>
        );
      })}
    </div>
  );

  const Transfers = ({ list, withAccount }: { list: Transfer[]; withAccount?: boolean }) =>
    list.length === 0 ? (
      <div className="card">
        <div className="empty-note">주고받을 금액이 없습니다.</div>
      </div>
    ) : (
      <div>
        {list.map((t, i) => {
          const from = nameOf(t.fromId);
          const to = nameOf(t.toId);
          return (
            <div className={`transfer ${withAccount ? "with-acct" : ""}`} key={i}>
              <span className="from">
                <Avatar photoUrl={from.photoUrl} gender={from.gender} size={22} />
                {from.name || "?"}
              </span>
              <span className="arrow">
                <Icon name="chevronRight" size={16} />
              </span>
              <span className="to">
                <Avatar photoUrl={to.photoUrl} gender={to.gender} size={22} />
                {to.name || "?"}
              </span>
              <span className="amt">{won(t.amount)}</span>
              {withAccount && (
                <div className="acct-line">
                  {to.bankAccount ? (
                    <>
                      <span className="acct-text">
                        {to.bankName} {to.bankAccount}
                      </span>
                      <button
                        className="acct-copy"
                        onClick={() =>
                          void copy(`t${i}`, `${to.bankName} ${to.bankAccount} ${won(t.amount)}`)
                        }
                      >
                        {copied === `t${i}` ? "복사됨 ✓" : "계좌·금액 복사"}
                      </button>
                    </>
                  ) : (
                    <span className="acct-missing">
                      {to.name || "?"} 님이 아직 계좌를 입력하지 않았어요
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );

  const vHole = holes[vi];
  const vBd = breakdowns[vi];
  const vSkin = skins?.holes[vi] ?? null;

  // 홀별 검증 표: 모든 칸이 같은 넓이. 금액은 원 단위로 보여 주고, 이 홀의 금액 중 하나라도
  // 칸에 안 들어가면 이 홀의 금액을 모두 만원 단위로 바꾼다 (원·만원이 섞이면 읽기 어려우니)
  const vAmts = vSkin ? [vSkin.net, vSkin.cumulative] : [vBd.game, vBd.birdie, vBd.cumulative];
  /** 금액 칸마다 가장 긴 표시 (마지막 칸 = 누적) */
  const longestOf = (fmt: (n: number) => string) =>
    vAmts.map((m) =>
      config.players.reduce((best, p) => {
        const s = fmt(m[p.id] ?? 0);
        return s.length > best.length ? s : best;
      }, "0")
    );
  const wonLongest = longestOf(signedWon);
  const manLongest = longestOf(signedMan);
  const tableRef = useRef<HTMLTableElement>(null);
  const wonProbeRef = useRef<HTMLDivElement>(null);
  const manProbeRef = useRef<HTMLDivElement>(null);
  const [amtFmt, setAmtFmt] = useState({ man: false, size: AMT_MAX });
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table || !wonProbeRef.current || !manProbeRef.current) return;
    /** 가장 긴 금액을 최대 글자 크기로 그렸을 때의 폭 */
    const widest = (el: HTMLElement) =>
      Math.max(...[...el.children].map((c) => c.getBoundingClientRect().width));
    const fit = () => {
      const cell = table.querySelector<HTMLElement>("td.vf-amt");
      if (!cell || !wonProbeRef.current || !manProbeRef.current) return;
      const cs = getComputedStyle(cell);
      const room = cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const man = widest(wonProbeRef.current) > room;
      const need = man ? widest(manProbeRef.current) : 0;
      const size =
        need > room ? Math.max(AMT_MIN, Math.floor(((AMT_MAX * room) / need) * 2) / 2) : AMT_MAX;
      setAmtFmt((prev) => (prev.man === man && prev.size === size ? prev : { man, size }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(table);
    return () => ro.disconnect();
  }, [wonLongest.join("|"), manLongest.join("|")]);
  const fmtAmt = amtFmt.man ? signedMan : signedWon;

  return (
    <>
      <div className="result-hero">
        <div className="big">
          <Icon name="trophy" size={22} className="inline-ic" /> 최종 정산
        </div>
        <div style={{ opacity: 0.82, marginTop: 5, fontSize: 13 }}>
          {savingNow ? `저장된 ${savedCount}/${holes.length}홀 기준` : `${playedHoles}개 홀 진행`} ·{" "}
          {isSkins ? `스킨스 · 스킨 1개 ${won(config.unit)}` : `타당 ${won(config.unit)}`} ·{" "}
          {PAYMENT_LABEL[config.payment]}
        </div>
        {config.editLog.length > 0 && (
          <div className="hero-edited">
            {config.editLog.length}번 수정됨 · 맨 아래 수정 내역에서 확인
          </div>
        )}
      </div>

      <div className="sheet results">
        {session.isHost && (
          <div className="host-edit">
            {/* 라운드 중엔 누구나 홀 진행에서 저장된 홀을 '수정'한다. 종료 후엔 방장만 */}
            {session.status === "done" && (
              <button className="btn-line" onClick={onEditScores}>
                스코어 수정
              </button>
            )}
            <button className="btn-line" onClick={() => setEditing(true)}>
              정산 설정 수정
            </button>
          </div>
        )}

        <div className="section-title">순위</div>
        <div className="standings">
        {standings.map((s, i) => {
          const played = holes.some((h) => h.scores[s.p.id] != null);
          return (
            <div className="standing" key={s.p.id}>
              <div className={`rank ${i === 0 && s.net > 0 ? "top" : ""}`}>{i + 1}</div>
              <Avatar photoUrl={s.p.photoUrl} gender={s.p.gender} size={26} />
              <span className="nm">{s.p.name || "?"}</span>
              <span className="st-pill">
                <b>{played ? `${grossOf(s.p.id)}타` : "-"}</b>
                <small>{played ? relLabel(grossOf(s.p.id) - parOf(s.p.id)) : "-"}</small>
              </span>
              <span className={`val ${tone(s.net)}`}>
                {s.net === 0 ? "±0원" : wonSigned(s.net)}
              </span>
            </div>
          );
        })}
        </div>

        {skins ? (
          <>
            {/* 1) 스킨스 정산 */}
            <div className="section-title" style={{ marginTop: 20 }}>
              ① 스킨스 정산
            </div>
            <p className="hint" style={{ margin: "0 2px 10px" }}>
              단독 최저 타수가 그 홀에 걸린 스킨을 모두 가져가고, 다른 참여자 모두에게서{" "}
              <b>스킨 수 × {won(config.unit)}</b>씩 받아요.
            </p>
            <NetList net={skins.net} />
            <div className="card">
              {skins.holes.every((h) => h.status === "pending") ? (
                <div className="empty-note">아직 판정된 홀이 없어요.</div>
              ) : (
                <>
                  {skins.holes.map((h, i) =>
                    h.status === "pending" ? null : (
                      <div className={`skin-log ${h.status}`} key={i}>
                        <span className="sl-hole">{i + 1}번홀</span>
                        {h.status === "won" || h.status === "split" ? (
                          <>
                            <span className="sl-txt">
                              <b>{h.winnerIds.map((id) => nameOf(id).name || "?").join("·")}</b>{" "}
                              {h.status === "split" ? "나눠 가짐 · " : ""}스킨 {h.skins}개 · 1명당{" "}
                              {won(h.skins * config.unit)}
                              {h.reasons.length > 0 && (
                                <small className="sl-why">{h.reasons.join(" · ")}</small>
                              )}
                            </span>
                            <span className="sl-amt pos">
                              {h.status === "split" ? "각 " : ""}+{won(h.amount)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="sl-txt">최저 동타 · 스킨 {h.stake}개 이월</span>
                            <span className="sl-amt">–</span>
                          </>
                        )}
                      </div>
                    )
                  )}
                  {skins.leftover > 0 && (
                    <div className="skin-log gone">
                      <span className="sl-hole">소멸</span>
                      <span className="sl-txt">
                        마지막 홀이 전원 동타라 남은 스킨 {skins.leftover}개는 사라졌어요
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 1) 게임 순수 정산 */}
            <div className="section-title" style={{ marginTop: 20 }}>
              ① 게임 순수 정산
            </div>
            <NetList net={game.net} />

            {/* 2) 버디 추가 정산 */}
            <div className="section-title">② 버디 추가 정산</div>
            <div className="card">
              {config.rules.birdieDouble ? (
                <div className="empty-note">
                  버디 배판 규칙이라 버디 홀은 배판으로 처리되고 추가 정산은 없어요.
                </div>
              ) : (
                config.players.map((p) => {
                  const v = bird.net[p.id] ?? 0;
                  const got = birdies.filter((e) => e.playerId === p.id);
                  const paid = birdies.filter((e) => e.payers.includes(p.id));
                  const gotSum = got.reduce((s, e) => s + e.amount, 0);
                  const paidSum = paid.reduce((s, e) => s + e.perPayer, 0);
                  const label =
                    got.length > 0 ? `버디 ${got.length}개` : paid.length > 0 ? "버디 정산" : "버디 없음";
                  // 내역은 평소엔 접어 두고, 줄을 누르면 아래로 펼친다
                  const hasDetail = got.length > 0 || paid.length > 0;
                  const open = hasDetail && !!bdOpen[p.id];
                  return (
                    <div className="bd-player" key={p.id}>
                      <button
                        className="bd-head"
                        disabled={!hasDetail}
                        aria-expanded={hasDetail ? open : undefined}
                        onClick={() => setBdOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
                      >
                        <Avatar photoUrl={p.photoUrl} gender={p.gender} size={26} />
                        <b>{p.name || "?"}</b>
                        <span className="bd-tag">{label}</span>
                        <span className={`bd-total ${tone(v)}`}>
                          {v === 0 ? "±0원" : wonSigned(v)}
                        </span>
                      </button>
                      {open && got.length > 0 && (
                        <div className="bd-group">
                          <div className="bd-gt">
                            <span>내 버디로 받은 돈</span>
                            <span className="pos">+{won(gotSum)}</span>
                          </div>
                          {got.map((e, i) => (
                            <div className="bd-item" key={i}>
                              <span>
                                {e.holeIndex + 1}번홀 {scoreLabel(holes[e.holeIndex].par, e.rel)}
                                {e.strokes > 1 ? `(${e.strokes}타)` : ""} · {e.payers.length}명 ×{" "}
                                {won(e.perPayer)}
                                {e.multiplier > 1 ? ` (×${e.multiplier})` : ""}
                              </span>
                              <span>+{won(e.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {open && paid.length > 0 && (
                        <div className="bd-group">
                          <div className="bd-gt">
                            <span>다른 사람 버디로 낸 돈</span>
                            <span className="neg">-{won(paidSum)}</span>
                          </div>
                          {paid.map((e, i) => (
                            <div className="bd-item" key={i}>
                              <span>
                                {e.holeIndex + 1}번홀 {nameOf(e.playerId).name || "?"}{" "}
                                {scoreLabel(holes[e.holeIndex].par, e.rel)}
                                {e.strokes > 1 ? `(${e.strokes}타)` : ""}
                                {e.multiplier > 1 ? ` (×${e.multiplier})` : ""}
                              </span>
                              <span>-{won(e.perPayer)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* 3) 핸디캡 정산 — 타수 보정 방식은 금액 대신 홀 판정에 반영 */}
        {isAdjust ? (
          <>
            <div className="section-title">{N(3)} 핸디캡 (타수 보정)</div>
            <p className="hint" style={{ margin: "0 2px 10px" }}>
              핸디캡은 금액으로 정산하지 않고, 파4·파5 홀에서 보기 이상이면 잡아준 타수만큼 빼서
              (파까지만) 승패를 가렸어요.
            </p>
            <div className="card">
              {config.players.map((p) => {
                const used = holes.reduce((s, h) => {
                  const rel = h.scores[p.id];
                  return rel == null ? s : s + rel - adjustedRel(h.par, rel, p.strokeAdj);
                }, 0);
                return (
                  <div className="hc-line" key={p.id}>
                    <span className="gp-name">
                      <Avatar photoUrl={p.photoUrl} gender={p.gender} size={22} />
                      <b>{p.name || "?"}</b>
                    </span>
                    <span className="hc-hd">{adjLabel(p.strokeAdj ?? 0)}</span>
                    <span className="hc-amt">{used > 0 ? `${used}타 보정됨` : "–"}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
          <div className="section-title">
            {N(3)} 핸디캡 정산 {isPost ? "(사후·합산)" : "(사전·현금)"}
          </div>
          <p className="hint" style={{ margin: "0 2px 10px" }}>
            <b>{settleNote(config.handicapSettle)}</b>
          </p>
          {hc.transfers.length === 0 ? (
            <div className="card">
              <div className="empty-note">핸디 차이가 없습니다.</div>
            </div>
          ) : (
            <Transfers list={hc.transfers} />
          )}
          <div className="card">
            {config.players.map((p) => {
              const v = hc.net[p.id] ?? 0;
              return (
                <div className="hc-line" key={p.id}>
                  <span className="gp-name">
                    <Avatar photoUrl={p.photoUrl} gender={p.gender} size={22} />
                    <b>{p.name || "?"}</b>
                  </span>
                  <span className="hc-hd">핸디 {hcLabel(p.handicap)}</span>
                  <span className={`hc-amt ${tone(v)}`}>{v === 0 ? "±0원" : wonSigned(v)}</span>
                </div>
              );
            })}
          </div>
          {!isPost && (
            <p className="hint" style={{ margin: "-6px 2px 12px" }}>
              핸디캡은 현금으로 미리 주고받으므로 최종 송금에는 포함되지 않았습니다.
            </p>
          )}
          </>
        )}

        {/* 4) 최종 송금 */}
        <div className="section-title">{N(4)} 최종 송금 (최소 횟수)</div>
        {isTransfer && me && (
          <div className="card my-acct">
            <AccountField
              label="내 받을 계좌"
              bank={me.bankName ?? null}
              account={me.bankAccount ?? null}
              onSave={async (bank, account) => {
                await updateMe({ bank_name: bank, bank_account: account });
                await saveBankAccount(bank, account);
              }}
            />
          </div>
        )}
        <Transfers list={final.transfers} withAccount={isTransfer} />

        {/* 5) 홀별 검증 */}
        <div className="section-title" style={{ marginTop: 20 }}>
          {N(5)} 홀별 검증
        </div>
        <div className="card verify">
          <div className="vf-nav">
            <button
              className="navbtn"
              disabled={vi === 0}
              onClick={() => setVi(vi - 1)}
              aria-label="이전 홀"
            >
              <Icon name="chevronLeft" size={20} />
            </button>
            <div className="vf-title">
              <b>{vi + 1}번 홀</b>
              <span>PAR {vHole.par}</span>
            </div>
            <button
              className="navbtn"
              disabled={vi === holes.length - 1}
              onClick={() => setVi(vi + 1)}
              aria-label="다음 홀"
            >
              <Icon name="chevronRight" size={20} />
            </button>
          </div>

          <div className="vf-strip">
            {holes.map((h, i) => (
              <button
                key={i}
                className={`${i === vi ? "active" : ""} ${isPlayed(h) ? "played" : ""}`}
                onClick={() => setVi(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="vf-rate">
            {vSkin ? (
              <>
                스킨 {vSkin.skins}개 · 1명당 {won(vSkin.skins * config.unit)}
                {vSkin.reasons.length > 0 && ` (${vSkin.reasons.join(" · ")})`}
                <span className="vf-reasons">
                  {vSkin.status === "won"
                    ? `${nameOf(vSkin.winnerIds[0]).name || "?"} 단독 최저 → 스킨 ${vSkin.skins}개 획득`
                    : vSkin.status === "split"
                    ? `${vSkin.winnerIds.map((id) => nameOf(id).name || "?").join("·")} 최저 동타 → 나눠 가짐 (각 +${won(vSkin.amount)})`
                    : vSkin.status === "carried"
                    ? vi < holes.length - 1
                      ? `최저 동타 → 다음 홀로 이월 (스킨 ${skins?.holes[vi + 1]?.stake ?? vSkin.stake + 1}개)`
                      : "마지막 홀 전원 동타 · 남은 스킨 소멸"
                    : "아직 모든 스코어가 입력되지 않았어요"}
                </span>
              </>
            ) : vBd.allTie ? (
              <>
                전원 동타 · 이 홀은 정산 없음
                <span className="vf-reasons">
                  {vBd.nextCarry ? `다음 홀로 ×${vBd.nextCarry} 이월` : "마지막 홀이라 이월 소멸"}
                </span>
              </>
            ) : (
              <>
                1타당 {won(config.unit * vBd.multiplier)}
                {vBd.multiplier > 1 && (
                  <>
                    {" "}
                    (타당 {won(config.unit)} × 배수 {vBd.multiplier})
                    <span className="vf-reasons">{vBd.reasons.join(" · ")}</span>
                  </>
                )}
              </>
            )}
          </div>

          <table
            className="vf-table"
            ref={tableRef}
            style={{ "--vf-amt": `${amtFmt.size}px` } as CSSProperties}
          >
            <thead>
              <tr>
                <th>이름</th>
                <th>타수</th>
                {vSkin ? (
                  <th>이 홀</th>
                ) : (
                  <>
                    <th>게임</th>
                    <th>버디</th>
                  </>
                )}
                <th>누적</th>
              </tr>
            </thead>
            <tbody>
              {config.players.map((p) => {
                const rel = vHole.scores[p.id];
                const g = (vSkin ? vSkin.net[p.id] : vBd.game[p.id]) ?? 0;
                const b = vBd.birdie[p.id] ?? 0;
                const c = (vSkin ? vSkin.cumulative[p.id] : vBd.cumulative[p.id]) ?? 0;
                // 이 홀에서 타수 보정으로 뺀 타수 (이름 옆 배지)
                const cut = rel == null ? 0 : rel - adjustedRel(vHole.par, rel, p.strokeAdj);
                return (
                  <tr key={p.id}>
                    <td className="vf-name">
                      <span className="vf-name-in">
                        <span className="vf-nm">{p.name || "?"}</span>
                        {cut > 0 && (
                          <span className="vf-adj" aria-label={`${cut}타 보정`}>
                            −{cut}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="vf-score">
                      <span
                        className={`vf-pill ${
                          rel == null ? "none" : rel < 0 ? "under" : rel > 0 ? "over" : "even"
                        }`}
                      >
                        <b>{rel == null ? "–" : vHole.par + rel}</b>
                        {rel != null && <small>{relLabel(rel)}</small>}
                      </span>
                    </td>
                    <td className={`vf-amt ${tone(g)}`}>{fmtAmt(g)}</td>
                    {!vSkin && <td className={`vf-amt ${tone(b)}`}>{fmtAmt(b)}</td>}
                    <td className={`vf-amt vf-cum ${tone(c)}`}>{fmtAmt(c)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* 단위 판단용: 이 홀에서 칸마다 가장 긴 금액을 원·만원 단위로 그려 폭을 잰다 (화면엔 안 보임) */}
          <div className="vf-probe" ref={wonProbeRef} aria-hidden>
            {wonLongest.map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>
          <div className="vf-probe" ref={manProbeRef} aria-hidden>
            {manLongest.map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>
          {isAdjust && (
            <p className="hint" style={{ marginTop: 10 }}>
              이름 옆 파란 배지는 이 홀에서 타수 보정으로 뺀 타수예요.
            </p>
          )}
        </div>

        {/* 6) 수정 내역 (저장된 홀 수정, 종료 후 방장 수정): 모든 참여자에게 공개 */}
        {(session.status === "done" || config.editLog.length > 0) && (
          <>
            <div className="section-title" style={{ marginTop: 20 }}>
              {N(6)} 수정 내역
              {config.editLog.length > 0 ? ` (${config.editLog.length}건)` : ""}
            </div>
            {config.editLog.length === 0 ? (
              <div className="card">
                <div className="empty-note">수정된 내용이 없어요.</div>
              </div>
            ) : (
              [...config.editLog].reverse().map((e, i) => (
                <div className="card edit-log" key={`${e.at}-${i}`}>
                  <div className="el-head">
                    <b>{logTime(e.at)}</b>
                    <span>{e.by} 수정</span>
                  </div>
                  <ul>
                    {e.items.map((t, j) => (
                      <li key={j}>{t}</li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {editing && <RoundSettingsSheet session={session} onClose={() => setEditing(false)} />}
    </>
  );
}
