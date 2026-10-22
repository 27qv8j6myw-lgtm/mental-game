import type { ReactNode } from "react";
import { caddieRanks, caddieResult, caddieSummary, type CaddieResult } from "../caddie";
import { pointsConfig, rankResult, rankScoreText, rankSummary, type RankResult } from "../rankGame";
import { holeBreakdowns, skinsResult } from "../betting";
import { adjLabel, HANDICAP_MODE_LABEL, PAYMENT_LABEL, relLabel, won, wonSigned } from "../util";
import { Avatar } from "../icons";
import type { GameConfig, HoleScore, Player, Transfer } from "../types";
import type { SettlementData } from "../shareImage";
import { CaddiePayRow } from "./SideGamePanels";

/*
 * 결과 화면(캐디피 내기·등수 내기)의 가운데 칸.
 * 머리·방장 버튼·이미지 공유·수정 내역은 ResultsScreen 이 그대로 그린다.
 */

const tone = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

const grossOf = (holes: HoleScore[], id: string) =>
  holes.reduce((s, h) => (h.scores[id] != null ? s + h.par + (h.scores[id] as number) : s), 0);
const parOf = (holes: HoleScore[], id: string) =>
  holes.reduce((s, h) => (h.scores[id] != null ? s + h.par : s), 0);
const playedBy = (holes: HoleScore[], id: string) => holes.some((h) => h.scores[id] != null);

/** 이름 아래 줄의 타수: " · 82타(+10)". 안 쳤으면 빈 문자열 */
const grossText = (holes: HoleScore[], id: string) =>
  playedBy(holes, id) ? ` · ${grossOf(holes, id)}타(${relLabel(grossOf(holes, id) - parOf(holes, id))})` : "";

/** 사람별 꼴찌 횟수 (캐디피를 낸 홀 수) */
const lastCount = (cd: CaddieResult, id: string) => cd.holes.filter((h) => h.payerId === id).length;

/** 등수 금액 표기: 내는 돈 "10,000원 냄" / 주고받는 돈 "+20,000원" */
const prizeText = (r: RankResult, v: number) =>
  r.rules.prize === "pay" ? (v > 0 ? `${won(v)} 냄` : "안 냄") : v === 0 ? "±0원" : wonSigned(v);

export default function SideGameResults({
  config,
  holes,
  finished,
  savingNow,
  myUid,
  renderTransfers,
}: {
  config: GameConfig;
  holes: HoleScore[];
  /** 끝난 라운드 (캐디피: 남은 돈을 모두 나눠 낸다) */
  finished: boolean;
  savingNow: boolean;
  myUid: string | null;
  renderTransfers: (list: Transfer[], withAccount: boolean) => ReactNode;
}) {
  const who = (id: string) => config.players.find((p) => p.id === id) as Player;

  if (config.gameMode === "caddie") {
    const cd = caddieResult(config, holes, finished);
    const ranks = caddieRanks(cd);
    const order = [...config.players].sort((a, b) => cd.paid[a.id] - cd.paid[b.id] || grossOf(holes, a.id) - grossOf(holes, b.id));
    const me = myUid ? config.players.find((p) => p.id === myUid) : null;
    const rest = Object.values(cd.restShare).reduce((a, b) => a + b, 0);
    return (
      <>
        {me && (
          <>
            <div className="section-title">{savingNow ? "내 캐디피 (지금까지)" : "내 캐디피"}</div>
            <div className="card my-settle">
              <div className="ms-total">
                <span>낸 캐디피</span>
                <b className={cd.paid[me.id] > 0 ? "neg" : ""}>{won(cd.paid[me.id])}</b>
              </div>
              <div className="ms-note">
                꼴찌 {lastCount(cd, me.id)}번
                {cd.restShare[me.id] > 0 && ` · 나눠 낸 몫 ${won(cd.restShare[me.id])}`}
              </div>
            </div>
          </>
        )}

        <div className="section-title">캐디피 모으기</div>
        <div className="card cd-summary">
          <div>
            <span>캐디피</span>
            <b>{won(cd.target)}</b>
          </div>
          <div>
            <span>모은 돈</span>
            <b>{won(cd.target - cd.remaining)}</b>
          </div>
          <div>
            <span>{finished ? "남은 돈" : "남은 홀 돈"}</span>
            <b className={cd.remaining > 0 ? "neg" : ""}>{won(cd.remaining)}</b>
          </div>
        </div>
        {rest > 0 && (
          <p className="hint" style={{ margin: "0 2px 12px" }}>
            마지막 홀까지 넘어간 돈·못 친 홀의 돈 {won(rest)}은 모두가 나눠 냈어요 (천 원 단위, 총 타수가 많은
            사람부터 천 원 더).
          </p>
        )}

        <div className="section-title">사람별 낸 돈</div>
        <div className="standings">
          {order.map((p) => (
            <div className="standing sg-standing" key={p.id}>
              <div className={`rank ${ranks[p.id] === 1 ? "top" : ""}`}>{ranks[p.id]}</div>
              <Avatar photoUrl={p.photoUrl} gender={p.gender} size={26} />
              <span className="nm sg-nm">
                <span className="sg-line">
                  <span className="sg-name">{p.name || "?"}</span>
                  {p.id === myUid && <span className="me-tag">나</span>}
                </span>
                <small className="sg-sub">
                  꼴찌 {lastCount(cd, p.id)}번{grossText(holes, p.id)}
                </small>
              </span>
              <span className={`val ${cd.paid[p.id] > 0 ? "neg" : ""}`}>{won(cd.paid[p.id])}</span>
            </div>
          ))}
        </div>

        <div className="section-title" style={{ marginTop: 20 }}>
          홀별 캐디피
        </div>
        <div className="card sg-log">
          {cd.practice > 0 && (
            <div className="sg-row muted">
              <span className="sg-hole">{cd.practice === 1 ? "1번" : `1~${cd.practice}번`}</span>
              <span className="sg-what">연습 홀</span>
              <span className="sg-amt">–</span>
            </div>
          )}
          {cd.holes.map((h, i) =>
            h.practice ? null : (
              <div className={`sg-row ${h.status === "paid" ? "" : "muted"}`} key={i}>
                <span className="sg-hole">{i + 1}번</span>
                <span className="sg-what">
                  {h.status === "paid"
                    ? `${who(h.payerId!).name || "?"} 꼴찌${h.carryCount > 0 ? ` (${h.carryCount}홀 넘어옴)` : ""}`
                    : h.status === "carried"
                    ? `공동 꼴찌 ${h.tiedIds.map((id) => who(id).name || "?").join("·")} → 넘김`
                    : "저장 전"}
                </span>
                <span className="sg-amt">{h.status === "paid" ? won(h.stake) : "–"}</span>
              </div>
            )
          )}
        </div>
      </>
    );
  }

  // ---- 등수 내기 ----
  const r = rankResult(config, holes);
  const method = r.rules.method;
  const me = myUid ? r.order.find((x) => x.id === myUid) : null;
  const isTransfer = config.payment === "transfer";
  const mine = me ? r.transfers.filter((t) => t.fromId === me.id || t.toId === me.id) : [];
  const total = Object.values(r.amounts).reduce((a, b) => a + b, 0);
  return (
    <>
      {me && (
        <>
          <div className="section-title">{savingNow ? "내 등수 (지금까지)" : "내 등수"}</div>
          <div className="card my-settle">
            <div className="ms-total">
              <span>
                {me.rank}위 · {rankScoreText(method, me.score)}
              </span>
              {r.rules.prize !== "none" && (
                <b className={r.rules.prize === "pay" ? (r.amounts[me.id] > 0 ? "neg" : "") : tone(r.amounts[me.id])}>
                  {prizeText(r, r.amounts[me.id])}
                </b>
              )}
            </div>
            {mine.map((t, i) => {
              const pay = t.fromId === me.id;
              const other = who(pay ? t.toId : t.fromId);
              return (
                <div className="ms-row" key={i}>
                  <div className="ms-line">
                    <Avatar photoUrl={other.photoUrl} gender={other.gender} size={22} />
                    <span className="ms-who">
                      {other.name || "?"}
                      {pay ? "에게 보내기" : "에게서 받기"}
                    </span>
                    <b className={pay ? "neg" : "pos"}>{won(t.amount)}</b>
                  </div>
                </div>
              );
            })}
            {savingNow && mine.length > 0 && <div className="ms-note">최종 확정 뒤에 송금해 주세요.</div>}
          </div>
        </>
      )}

      <div className="section-title">순위</div>
      <div className="standings">
        {r.order.map((row) => {
          const p = who(row.id);
          return (
            <div className="standing sg-standing" key={row.id}>
              <div className={`rank ${row.rank === 1 ? "top" : ""}`}>{row.rank}</div>
              <Avatar photoUrl={p.photoUrl} gender={p.gender} size={26} />
              <span className="nm sg-nm">
                <span className="sg-line">
                  <span className="sg-name">{p.name || "?"}</span>
                  {row.id === myUid && <span className="me-tag">나</span>}
                </span>
                {/* 금액이 없으면 점수는 오른쪽에만 */}
                <small className="sg-sub">
                  {r.rules.prize !== "none" && rankScoreText(method, row.score)}
                  {method === "net" &&
                    `${r.rules.prize !== "none" ? " · " : ""}${
                      config.handicapMode === "adjust" ? adjLabel(p.strokeAdj ?? 0) : `핸디 ${p.handicap}`
                    }`}
                  {r.rules.prize === "none" && method !== "net"
                    ? grossText(holes, row.id).replace(/^ · /, "")
                    : grossText(holes, row.id)}
                </small>
              </span>
              <span
                className={`val ${
                  r.rules.prize === "pay" ? (r.amounts[row.id] > 0 ? "neg" : "") : tone(r.amounts[row.id])
                }`}
              >
                {r.rules.prize === "none" ? rankScoreText(method, row.score) : prizeText(r, r.amounts[row.id])}
              </span>
            </div>
          );
        })}
      </div>
      <p className="hint" style={{ margin: "8px 2px 0" }}>
        {method === "points"
          ? r.rules.multipliers
            ? "두 명씩 타수 차이를 포인트로 쌓았어요 (배판·이월·버디 추가 포함)."
            : "두 명씩 타수 차이만 포인트로 쌓았어요 (배판 없음)."
          : method === "net"
          ? config.handicapMode === "adjust"
            ? "파4·파5 홀마다 잡아준 타수를 빼고(파까지만) 더한 타수예요 (파 대비)."
            : `친 홀 타수(파 대비)에서 핸디(${HANDICAP_MODE_LABEL[config.handicapMode]})를 뺀 값이에요. 9홀이면 핸디 절반, 다 치기 전에는 친 홀 비율만큼 빼요.`
          : "홀마다 단독 최저 타수가 스킨을 가져갔어요. 마지막 홀 최저 동타는 나눠 가졌어요."}{" "}
        같은 점수는 같은 등수예요.
      </p>

      {r.rules.prize === "pay" && (
        <>
          <div className="section-title" style={{ marginTop: 20 }}>
            등수별로 낸 돈 · 합계 {won(total)}
          </div>
          {r.order
            .filter((row) => r.amounts[row.id] > 0)
            .map((row) => (
              <CaddiePayRow key={row.id} player={who(row.id)} amount={r.amounts[row.id]} />
            ))}
          {total === 0 && (
            <div className="card">
              <div className="empty-note">낼 돈이 없어요.</div>
            </div>
          )}
        </>
      )}

      {r.rules.prize === "exchange" && (
        <>
          <div className="section-title" style={{ marginTop: 20 }}>
            송금 · {PAYMENT_LABEL[config.payment]}
          </div>
          {r.unbalanced ? (
            <div className="card">
              <div className="empty-note">
                등수 금액의 합이 {wonSigned(total)}이라 송금을 계산하지 않았어요. 방장이 정산 설정 수정에서 합이
                0원이 되게 고쳐 주세요.
              </div>
            </div>
          ) : (
            renderTransfers(r.transfers, isTransfer && !savingNow)
          )}
        </>
      )}

      {method !== "net" && <HoleLog config={config} holes={holes} />}
    </>
  );
}

/** 등수 내기 홀별 기록: 포인트는 홀마다 사람별 포인트, 스킨스는 누가 가져갔는지 */
function HoleLog({ config, holes }: { config: GameConfig; holes: HoleScore[] }) {
  const r = config.rules.rank!;
  const name = (id: string) => config.players.find((p) => p.id === id)?.name || "?";
  if (r.method === "skins") {
    const sk = skinsResult({ ...config, unit: 1 }, holes);
    return (
      <>
        <div className="section-title" style={{ marginTop: 20 }}>
          홀별 스킨
        </div>
        <div className="card sg-log">
          {sk.holes.map((h, i) => (
            <div className={`sg-row ${h.status === "won" || h.status === "split" ? "" : "muted"}`} key={i}>
              <span className="sg-hole">{i + 1}번</span>
              <span className="sg-what">
                {h.status === "won"
                  ? name(h.winnerIds[0])
                  : h.status === "split"
                  ? `${h.winnerIds.map(name).join("·")} 나눔`
                  : h.status === "carried"
                  ? "최저 동타 → 넘김"
                  : "저장 전"}
              </span>
              <span className="sg-amt">{h.status === "pending" ? "–" : `스킨 ${h.skins}`}</span>
            </div>
          ))}
        </div>
      </>
    );
  }
  const bd = holeBreakdowns(pointsConfig(config), holes);
  return (
    <>
      <div className="section-title" style={{ marginTop: 20 }}>
        홀별 포인트
      </div>
      <div className="card sg-table-wrap">
        <table className="sg-table">
          <thead>
            <tr>
              <th>홀</th>
              {config.players.map((p) => (
                <th key={p.id}>{p.name || "?"}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bd.map((b, i) => (
              <tr key={i} className={b.multiplier > 1 ? "bae" : ""}>
                <td>
                  {i + 1}
                  {b.multiplier > 1 && <small>×{b.multiplier}</small>}
                </td>
                {config.players.map((p) => {
                  const v = holes[i].scores[p.id] == null ? null : b.game[p.id] + (r.multipliers ? b.birdie[p.id] : 0);
                  return (
                    <td key={p.id} className={v == null ? "" : tone(v)}>
                      {v == null ? "–" : v > 0 ? `+${v}` : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 결과 이미지(캐디피·등수 내기): 순위 칸·송금 칸 내용 */
export function sideSettlement(
  config: GameConfig,
  holes: HoleScore[],
  finished: boolean,
  savingNow: boolean,
  savedLabel: string
): Pick<SettlementData, "title" | "chips" | "players" | "transfers" | "listTitle" | "transfersTitle" | "hideTransfers"> {
  const base = (p: Player) => {
    const played = playedBy(holes, p.id);
    return {
      id: p.id,
      name: p.name || "?",
      gross: played ? grossOf(holes, p.id) : null,
      rel: played ? grossOf(holes, p.id) - parOf(holes, p.id) : null,
    };
  };
  if (config.gameMode === "caddie") {
    const cd = caddieResult(config, holes, finished);
    const ranks = caddieRanks(cd);
    const order = [...config.players].sort((a, b) => cd.paid[a.id] - cd.paid[b.id]);
    return {
      title: savingNow ? "중간 캐디피" : "캐디피 정산",
      chips: [savedLabel, caddieSummary(config.rules.caddie?.fee ?? 0, holes.length), "타수 보정"],
      listTitle: "사람별 낸 캐디피",
      transfersTitle: `캐디피 ${won(cd.target)}`,
      players: order.map((p) => ({
        ...base(p),
        rank: ranks[p.id],
        net: -cd.paid[p.id],
        parts: [],
        note: `꼴찌 ${lastCount(cd, p.id)}번${cd.restShare[p.id] > 0 ? ` · 나눠 낸 몫 ${won(cd.restShare[p.id])}` : ""}`,
        valueText: won(cd.paid[p.id]),
      })),
      transfers: order
        .filter((p) => cd.paid[p.id] > 0)
        .sort((a, b) => cd.paid[b.id] - cd.paid[a.id])
        .map((p) => ({ from: p.name || "?", to: "캐디피", amount: cd.paid[p.id] })),
    };
  }
  const r = rankResult(config, holes);
  const name = (id: string) => config.players.find((p) => p.id === id)?.name || "?";
  return {
    title: savingNow ? "중간 등수" : "최종 등수",
    chips: [
      savedLabel,
      rankSummary(r.rules, config.handicapMode),
      ...(r.rules.prize === "exchange" ? [PAYMENT_LABEL[config.payment]] : []),
    ],
    listTitle: r.rules.prize === "none" ? "등수" : "등수와 금액",
    transfersTitle: r.rules.prize === "pay" ? "등수별로 낸 돈" : "송금",
    hideTransfers: r.rules.prize === "none",
    players: r.order.map((row) => ({
      ...base(config.players.find((p) => p.id === row.id)!),
      rank: row.rank,
      net: r.rules.prize === "pay" ? -r.amounts[row.id] : r.amounts[row.id],
      parts: [],
      note: rankScoreText(r.rules.method, row.score),
      ...(r.rules.prize === "none" && { valueText: rankScoreText(r.rules.method, row.score) }),
      ...(r.rules.prize === "pay" && { valueText: r.amounts[row.id] > 0 ? `${won(r.amounts[row.id])} 냄` : "안 냄" }),
    })),
    transfers:
      r.rules.prize === "pay"
        ? r.order
            .filter((row) => r.amounts[row.id] > 0)
            .map((row) => ({ from: name(row.id), to: "모으는 돈", amount: r.amounts[row.id] }))
        : r.transfers.map((t) => ({ from: name(t.fromId), to: name(t.toId), amount: t.amount })),
  };
}
