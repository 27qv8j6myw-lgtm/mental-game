import { useMemo, useState } from "react";
import {
  birdieEvents,
  birdieNet,
  gameNet,
  handicapNet,
  holeBreakdowns,
  totalNet,
} from "../betting";
import {
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

/** 표 안의 금액: 단위(원) 없이 부호만 */
const signed = (n: number) =>
  n === 0 ? "0" : `${n > 0 ? "+" : "-"}${Math.abs(Math.round(n)).toLocaleString("ko-KR")}`;

const tone = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

export default function ResultsScreen({
  session,
  onEditScores,
}: {
  session: Session;
  onEditScores: () => void;
}) {
  const { config, holes } = session;
  const isPost = config.handicapSettle === "post";
  const [vi, setVi] = useState(0);
  const [editing, setEditing] = useState(false);
  const { myUid, updateMe } = useRound();
  const { saveBankAccount } = useAuth();
  const [copied, setCopied] = useState<string | null>(null);
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

  const nameOf = (id: string) => config.players.find((p) => p.id === id)!;
  const isPlayed = (h: HoleScore) => Object.values(h.scores).some((s) => s !== null);
  const playedHoles = holes.filter(isPlayed).length;

  const grossOf = (id: string) =>
    holes.reduce((s, h) => (h.scores[id] != null ? s + h.par + (h.scores[id] as number) : s), 0);
  /** 그 사람이 친 홀들의 파 합계 (18홀 기본 72, 파 설정에 따라 71 등으로 자동 계산) */
  const parOf = (id: string) => holes.reduce((s, h) => (h.scores[id] != null ? s + h.par : s), 0);
  const coursePar = holes.reduce((s, h) => s + h.par, 0);

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

  return (
    <>
      <div className="result-hero">
        <div className="big">
          <Icon name="trophy" size={22} className="inline-ic" /> 최종 정산
        </div>
        <div style={{ opacity: 0.82, marginTop: 5, fontSize: 13 }}>
          {playedHoles}개 홀 진행 · 타당 {won(config.unit)} · {PAYMENT_LABEL[config.payment]}
        </div>
        {config.editLog.length > 0 && (
          <div className="hero-edited">
            정산 확정 후 {config.editLog.length}번 수정됨 · 맨 아래 수정 내역에서 확인
          </div>
        )}
      </div>

      <div className="sheet">
        {session.isHost && (
          <div className="host-edit">
            <button className="btn-line" onClick={onEditScores}>
              스코어 수정
            </button>
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
        <p className="hint" style={{ margin: "2px 2px 0" }}>
          타원 안의 왼쪽은 타수, 오른쪽은 오늘 핸디캡(타수 − 파 {coursePar}타 기준)이에요.
          덜 친 홀이 있으면 친 홀의 파만 합산해요.
        </p>

        {/* 1) 게임 순수 정산 */}
        <div className="section-title" style={{ marginTop: 20 }}>
          ① 게임 순수 정산
        </div>
        <NetList net={game.net} />

        {/* 2) 버디 추가 정산 */}
        <div className="section-title">② 버디 추가 정산</div>
        {!config.rules.birdieDouble && (
          <p className="hint" style={{ margin: "0 2px 10px" }}>
            버디는 <b>1타</b>, 이글은 <b>2타</b> 값(타당 금액 × 그 홀 배수)을 그 홀 다른 참여자
            모두에게서 받아요. 합계 = 내 버디로 받은 돈 − 다른 사람 버디로 낸 돈.
          </p>
        )}
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
              return (
                <div className="bd-player" key={p.id}>
                  <div className="bd-head">
                    <Avatar photoUrl={p.photoUrl} gender={p.gender} size={26} />
                    <b>{p.name || "?"}</b>
                    <span className="bd-tag">{label}</span>
                    <span className={`bd-total ${tone(v)}`}>
                      {v === 0 ? "±0원" : wonSigned(v)}
                    </span>
                  </div>
                  {got.length > 0 && (
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
                  {paid.length > 0 && (
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

        {/* 3) 핸디캡 정산 */}
        <div className="section-title">
          ③ 핸디캡 정산 {isPost ? "(사후·합산)" : "(사전·현금)"}
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

        {/* 4) 최종 송금 */}
        <div className="section-title">④ 최종 송금 (최소 횟수)</div>
        <p className="hint" style={{ margin: "0 2px 10px" }}>
          {isPost
            ? "게임 + 버디 + 핸디캡을 모두 합산했습니다."
            : "게임 + 버디 합산 (핸디캡은 현금으로 사전 지급)."}
          {isTransfer && " 줄마다 받는 사람 계좌와 금액을 복사할 수 있어요."}
        </p>
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
          ⑤ 홀별 검증
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
            {vBd.allTie ? (
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

          <table className="vf-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>타수</th>
                <th>게임</th>
                <th>버디</th>
                <th>누적</th>
              </tr>
            </thead>
            <tbody>
              {config.players.map((p) => {
                const rel = vHole.scores[p.id];
                const g = vBd.game[p.id] ?? 0;
                const b = vBd.birdie[p.id] ?? 0;
                const c = vBd.cumulative[p.id] ?? 0;
                return (
                  <tr key={p.id}>
                    <td className="vf-name">{p.name || "?"}</td>
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
                    <td className={tone(g)}>{signed(g)}</td>
                    <td className={tone(b)}>{signed(b)}</td>
                    <td className={`vf-cum ${tone(c)}`}>{signed(c)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 10 }}>
            금액 단위는 원이에요. 누적은 이 홀까지의 게임 + 버디 합계이고, 마지막 홀의 누적이
            ①+② 결과와 같아요. (핸디캡 제외)
          </p>
        </div>

        {/* 6) 정산 확정 후 수정 내역: 모든 참여자에게 공개 */}
        {(session.status === "done" || config.editLog.length > 0) && (
          <>
            <div className="section-title" style={{ marginTop: 20 }}>
              ⑥ 정산 확정 후 수정 내역
              {config.editLog.length > 0 ? ` (${config.editLog.length}건)` : ""}
            </div>
            {config.editLog.length === 0 ? (
              <div className="card">
                <div className="empty-note">정산 확정 후 수정된 내용이 없어요.</div>
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
