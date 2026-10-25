import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth";
import { useRound } from "../round";
import { useBack } from "../back";
import { loadStats, type PersonStats, type StatsResult } from "../stats";
import { Avatar, Icon } from "../icons";
import TopBar, { BackButton, NoticeButton } from "./TopBar";
import PaneHead from "./PaneHead";
import { useUnfolded } from "../rail";
import RecDate from "./RecDate";
import { GAME_MODE_LABEL, wonSigned } from "../util";
import { cachedRanking, loadRanking, overall, type RankingData } from "../ranking";

const tone = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const money = (n: number) => (n === 0 ? "±0원" : wonSigned(n));

/** 승·패·무 표기: 돈을 딴 라운드는 승, 잃은 라운드는 패, 본전은 무 */
const record = (p: PersonStats) =>
  `${p.wins}승 ${p.losses}패${p.draws > 0 ? ` ${p.draws}무` : ""}`;

/** 금액 (딴 돈 초록, 잃은 돈 빨강) */
const Amt = ({ v }: { v: number }) => <b className={tone(v)}>{money(v)}</b>;

/** 승·무·패 막대. 위에는 승패 수, 막대 아래에는 양쪽 값 (금액 또는 평균 타수) */
function WinLossBar({
  win,
  draw,
  loss,
  winLabel,
  middle,
  lossLabel,
  left,
  right,
  footer,
}: {
  win: number;
  draw: number;
  loss: number;
  winLabel: string;
  middle: string;
  lossLabel: string;
  left?: ReactNode;
  right?: ReactNode;
  /** 막대 아래를 양쪽 값 대신 따로 채운다 (타수 맞대결의 평균 비교) */
  footer?: ReactNode;
}) {
  return (
    <div className="card st-vs">
      <div className="st-vs-score">
        <span>
          {winLabel} <b className="pos">{win}승</b>
        </span>
        <span className="st-vs-mid">{middle}</span>
        <span>
          <b className="neg">{loss}패</b> {lossLabel}
        </span>
      </div>
      <div className="st-vs-bar">
        {win > 0 && <span className="w" style={{ flexGrow: win }} />}
        {draw > 0 && <span className="d" style={{ flexGrow: draw }} />}
        {loss > 0 && <span className="l" style={{ flexGrow: loss }} />}
      </div>
      {footer ?? (
        <div className="st-vs-amt">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}

/** 사람 요약 카드: 누적 금액 + 라운드·1위·승패 + 타수. onOpen 이 있으면 눌러서 상세로 */
function PersonHero({
  p,
  label,
  onOpen,
}: {
  p: PersonStats;
  /** 사진 옆 이름 위 설명 (내 카드는 없음) */
  label?: string;
  onOpen?: () => void;
}) {
  return (
    <div
      className={`card st-hero ${onOpen ? "st-hero-btn" : ""}`}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => e.key === "Enter" && onOpen() : undefined}
    >
      <div className="st-hero-top">
        <Avatar photoUrl={p.photoUrl} size={56} />
        <div className="st-hero-name">
          {label && <span>{label}</span>}
          <b>{p.name || "?"}</b>
        </div>
        <div className={`st-hero-amt ${tone(p.total)}`}>{money(p.total)}</div>
        {onOpen && <Icon name="chevronRight" size={18} className="st-row-go" />}
      </div>
      <div className="st-chips">
        <span>
          <b>{p.rounds}</b>라운드
        </span>
        <span>
          1위 <b>{p.firsts}</b>번
        </span>
        {/* 승패(돈을 딴·잃은 라운드)는 내 카드에만. 다른 사람은 아래 '나와 맞대결'과 헷갈리지 않게 뺀다 */}
        {!p.vsMe && (
          <span>
            <b>{p.wins}</b>승 <b>{p.losses}</b>패
            {p.draws > 0 && (
              <>
                {" "}
                <b>{p.draws}</b>무
              </>
            )}
          </span>
        )}
      </div>
      <div className="st-golf">
        <span>
          평균 <b>{p.avg18 ?? "-"}</b>
          {p.avg18 != null && "타"}
        </span>
        <span>
          베스트 <b>{p.best18 ?? "-"}</b>
          {p.best18 != null && "타"}
        </span>
        <span>
          버디 <b>{p.birdies}</b>
        </span>
        {p.eagles > 0 && (
          <span>
            이글 <b>{p.eagles}</b>
          </span>
        )}
      </div>
    </div>
  );
}

/** 타수 요약 카드: 18홀 평균 + 라운드·베스트·버디. onOpen 이 있으면 눌러서 상세로 */
function StrokeHero({ p, label, onOpen }: { p: PersonStats; label: string; onOpen?: () => void }) {
  return (
    <div
      className={`card st-hero ${onOpen ? "st-hero-btn" : ""}`}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => e.key === "Enter" && onOpen() : undefined}
    >
      <div className="st-hero-top">
        <Avatar photoUrl={p.photoUrl} size={56} />
        <div className="st-hero-name">
          <span>{label}</span>
          <b>{p.name || "?"}</b>
        </div>
        <div className="st-hero-amt">
          {p.avg18 ?? "–"}
          {p.avg18 != null && <small>타</small>}
        </div>
        {onOpen && <Icon name="chevronRight" size={18} className="st-row-go" />}
      </div>
      <div className="st-golf">
        <span>
          <b>{p.rounds}</b>라운드
        </span>
        <span>
          베스트 <b>{p.best18 ?? "-"}</b>
          {p.best18 != null && "타"}
        </span>
        <span>
          버디 <b>{p.birdies}</b>
        </span>
        {p.eagles > 0 && (
          <span>
            이글 <b>{p.eagles}</b>
          </span>
        )}
      </div>
    </div>
  );
}

/** 나와의 평균 타수 차이: −3.2타 / +1.5타 / ±0타 */
const diffLabel = (d: number) => (d === 0 ? "±0타" : `${d > 0 ? "+" : "−"}${Math.abs(d)}타`);
const avgText = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(1));
/** 함께 친 라운드 평균 − 전체 평균 (소수 첫째 자리) */
const gap = (together: number | null, all: number | null | undefined) =>
  together == null || all == null ? "–" : diffLabel(Math.round((together - all) * 10) / 10);

/** 타수 맞대결 아래: 나와 친 라운드 평균 · 전체 라운드 평균 · 그 차이 (나 / 그 사람) */
function AvgCompare({
  name,
  together,
  all,
}: {
  name: string;
  together: [number | null, number | null];
  all: [number | null | undefined, number | null | undefined];
}) {
  return (
    <div className="st-vs-avg">
      <span />
      <span className="h">나</span>
      <span className="h">{name}</span>
      <span>나와 친 라운드</span>
      <b>{avgText(together[0])}</b>
      <b>{avgText(together[1])}</b>
      <span>전체 라운드</span>
      <b>{avgText(all[0])}</b>
      <b>{avgText(all[1])}</b>
      <span>함께 칠 때</span>
      <em>{gap(together[0], all[0])}</em>
      <em>{gap(together[1], all[1])}</em>
    </div>
  );
}

/**
 * 라운드 정산 결과를 보고 돌아왔을 때 보던 사람 화면을 그대로 보여주려고 기억해 둔다.
 * 전적 화면을 닫으면 지운다.
 */
let lastSelected: string | null = null;
/** 순위 기준: 금액(누적 금액) / 타수(18홀 평균). 화면을 다시 열어도 마지막에 고른 기준으로 */
type RankBy = "money" | "strokes";
let lastBy: RankBy = "money";

/** 전적: 나와 함께한 정산 확정 라운드 기준, 사람마다 기록과 누적 금액 */
export default function StatsScreen({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { openRound } = useRound();
  const myUid = user?.uid ?? "";
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelectedState] = useState<string | null>(() => lastSelected);
  const [by, setByState] = useState<RankBy>(() => lastBy);
  const setBy = (v: RankBy) => {
    lastBy = v;
    setByState(v);
  };
  const setSelected = (uid: string | null) => {
    lastSelected = uid;
    setSelectedState(uid);
  };
  const close = () => {
    lastSelected = null;
    onClose();
  };
  // 기기 뒤로가기: 사람 상세 → 전체 보기
  useBack(!!selected, () => setSelected(null));
  // 펼친 iPhone Duo: 왼쪽 금액 · 오른쪽 타수. 칸마다 사람을 따로 고른다
  const split = useUnfolded();
  const [splitSel, setSplitSel] = useState<Record<RankBy, string | null>>({ money: null, strokes: null });
  const pick = (k: RankBy, uid: string | null) => {
    setSplitSel((v) => ({ ...v, [k]: uid }));
    document.querySelector(`.split-pane.st-${k}`)?.scrollTo(0, 0);
  };

  useEffect(() => {
    if (!myUid) return;
    loadStats(myUid)
      .then(setStats)
      .catch((e) => {
        console.error(e);
        setErr("전적을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      });
  }, [myUid]);

  const person = selected ? stats?.people.find((p) => p.uid === selected) ?? null : null;
  const splitPerson: Record<RankBy, PersonStats | null> = {
    money: splitSel.money ? stats?.people.find((p) => p.uid === splitSel.money) ?? null : null,
    strokes: splitSel.strokes ? stats?.people.find((p) => p.uid === splitSel.strokes) ?? null : null,
  };
  // 함께한 사람들 목록에는 나를 넣지 않는다 (나는 맨 위 카드)
  const others = stats?.people.filter((p) => p.uid !== myUid) ?? [];
  // 타수 순위: 나와 함께 끝까지 친 라운드에서 나와의 평균 타수 차이가 작은(나보다 잘 친) 순.
  // 나는 기준(±0)으로 그 사이에, 함께 끝까지 친 라운드가 없는 사람은 맨 뒤
  const vsOthers = others
    .filter((p) => p.strokesVsMe)
    .sort((a, b) => a.strokesVsMe!.diff - b.strokesVsMe!.diff || b.strokesVsMe!.rounds - a.strokesVsMe!.rounds);
  const strokeRows: PersonStats[] = [
    ...vsOthers.filter((p) => p.strokesVsMe!.diff < 0),
    ...(stats?.me ? [stats.me] : []),
    ...vsOthers.filter((p) => p.strokesVsMe!.diff >= 0),
    ...others.filter((p) => !p.strokesVsMe),
  ];
  // 라운드별 내 기록 (사람 상세의 타수 비교)
  const myRec = new Map((stats?.me?.history ?? []).map((r) => [r.roundId, r]));
  // 전체 라운드 평균 (나와 치지 않은 라운드 포함): 랭킹 자료로. 랭킹에서 숨긴 사람·폰 없는 동반자는 없음
  const [rank, setRank] = useState<RankingData | null>(cachedRanking);
  useEffect(() => {
    if (!(split ? splitSel.strokes : by === "strokes" && selected)) return;
    loadRanking()
      .then(setRank)
      .catch((e) => console.warn("전체 평균(랭킹)을 불러오지 못함", e));
  }, [by, selected, split, splitSel.strokes]);
  const open = (uid: string) => {
    setSelected(uid);
    window.scrollTo(0, 0);
  };

  const status = (
    <>
      {err && (
        <div className="card">
          <div className="empty-note" style={{ color: "var(--loss)" }}>
            {err}
          </div>
        </div>
      )}
      {!stats && !err && (
        <div className="card">
          <div className="empty-note">불러오는 중…</div>
        </div>
      )}

      {stats && stats.roundCount === 0 && (
        <div className="card">
          <div className="empty-note">
            아직 최종 확정한 라운드가 없어요. 라운드를 끝내고 최종 확정하면 전적이 쌓여요.
          </div>
        </div>
      )}
    </>
  );
  /** 금액·타수 한쪽 화면 (펼친 화면에서는 두 칸에 하나씩) */
  const body = (by: RankBy, person: PersonStats | null, open: (uid: string) => void) => (
    <>
      {stats && stats.roundCount > 0 && !person && by === "strokes" && (
        <>
          {stats.me && <StrokeHero p={stats.me} label="내 평균 타수 (18홀)" onOpen={() => open(myUid)} />}

          <div className="section-title">함께한 사람들 {others.length}명</div>
          <div className="card st-list">
            {strokeRows.map((p, i) => {
              const vs = p.strokesVsMe;
              const me = p.uid === myUid;
              return (
                <button className={`st-row ${me ? "st-row-me" : ""}`} key={p.uid} onClick={() => open(p.uid)}>
                  <span className={`rank ${i === 0 && vs && vs.diff < 0 ? "top" : ""}`}>
                    {me || vs ? i + 1 : "–"}
                  </span>
                  <Avatar photoUrl={p.photoUrl} size={30} />
                  <span className="st-row-main">
                    <span className="st-row-name">
                      {p.name || "?"}
                      {me && <span className="me-tag">나</span>}
                    </span>
                    <span className="st-row-sub">
                      {me
                        ? `평균 ${p.avg18 ?? "–"}${p.avg18 != null ? "타" : ""}`
                        : vs
                          ? `${vs.rounds}라운드 · ${vs.win}승 ${vs.loss}패${vs.draw > 0 ? ` ${vs.draw}무` : ""}`
                          : "함께 끝까지 친 라운드 없음"}
                    </span>
                  </span>
                  <span className="st-row-amt">{me ? "기준" : vs ? diffLabel(vs.diff) : "–"}</span>
                  <Icon name="chevronRight" size={16} className="st-row-go" />
                </button>
              );
            })}
          </div>
          <p className="hint" style={{ margin: "8px 2px 0" }}>
            나와 함께 끝까지 친 라운드에서 나와의 평균 타수 차이예요. −는 나보다 적게 친 거예요.
          </p>
        </>
      )}

      {stats && stats.roundCount > 0 && !person && by === "money" && (
        <>
          {stats.me && (
            <PersonHero p={stats.me} onOpen={() => open(myUid)} />
          )}

          <div className="section-title">함께한 사람들 {others.length}명</div>
          <div className="card st-list">
            {others.map((p, i) => (
              <button className="st-row" key={p.uid} onClick={() => open(p.uid)}>
                <span className={`rank ${i === 0 && p.total > 0 ? "top" : ""}`}>{i + 1}</span>
                <Avatar photoUrl={p.photoUrl} size={30} />
                <span className="st-row-main">
                  <span className="st-row-name">{p.name || "?"}</span>
                  {/* 누르면 나오는 '나와 맞대결'과 같은 기준: 내 승수 먼저 */}
                  <span className="st-row-sub">
                    {p.vsMe
                      ? `${p.vsMe.win + p.vsMe.loss + p.vsMe.draw}라운드 · ${p.vsMe.win}승 ${p.vsMe.loss}패${p.vsMe.draw > 0 ? ` ${p.vsMe.draw}무` : ""}`
                      : `${p.rounds}라운드 · ${record(p)}`}
                  </span>
                </span>
                <span className={`st-row-amt ${tone(p.total)}`}>{money(p.total)}</span>
                <Icon name="chevronRight" size={16} className="st-row-go" />
              </button>
            ))}
          </div>
        </>
      )}

      {person && by === "strokes" && (
        <>
          <StrokeHero
            p={person}
            label={person.uid === myUid ? "내 평균 타수 (18홀)" : "함께한 라운드 평균 (18홀)"}
          />

          {person.strokesVsMe && (
            <>
              <div className="section-title">나와 타수 맞대결</div>
              <WinLossBar
                win={person.strokesVsMe.win}
                draw={person.strokesVsMe.draw}
                loss={person.strokesVsMe.loss}
                winLabel="나"
                middle={`${person.strokesVsMe.draw}무`}
                lossLabel={person.name || "?"}
                footer={
                  <AvgCompare
                    name={person.name || "?"}
                    together={[person.strokesVsMe.myAvg18, person.strokesVsMe.theirAvg18]}
                    all={[
                      rank ? overall(rank, myUid)?.avg : undefined,
                      rank ? overall(rank, person.uid)?.avg : undefined,
                    ]}
                  />
                }
              />
              <p className="hint" style={{ margin: "8px 2px 0" }}>
                둘 다 끝까지 친 {person.strokesVsMe.rounds}라운드에서 타수가 적은 쪽이 이겨요. 평균은 18홀 라운드
                기준이에요. 전체 라운드는 나와 안 친 라운드도 포함해요. 함께 칠 때 +면 나와 칠 때 더 많이 쳐요.
              </p>
            </>
          )}

          <div className="section-title">라운드별 타수 {person.history.length}개</div>
          <div className="card st-list">
            {person.history.map((r) => {
              const m = person.uid === myUid ? null : myRec.get(r.roundId);
              // 내 기준 승패 (둘 다 끝까지 친 라운드만)
              const res =
                m?.gross != null && r.gross != null
                  ? m.gross < r.gross
                    ? "win"
                    : m.gross > r.gross
                      ? "loss"
                      : "draw"
                  : null;
              return (
                <button className="st-rec st-rec-btn" key={r.roundId} onClick={() => openRound(r.roundId)}>
                  <RecDate date={r.date} />
                  <span className="st-row-main">
                    <span className="st-row-name">
                      <span className="ri-title">{r.courseName || "이름 없는 라운드"}</span>
                      <span className={`mode-tag ${r.gameMode}`}>{GAME_MODE_LABEL[r.gameMode]}</span>
                    </span>
                    {/* 다른 사람: 그 라운드 내 타수와 비교 / 나: 인원·버디 */}
                    <span className="st-row-sub">
                      {m ? (
                        `나 ${m.gross ?? "–"}${m.gross != null ? "타" : ""}`
                      ) : (
                        <>
                          {r.playerCount}명{r.birdies > 0 && ` · 버디 ${r.birdies}`}
                          {r.eagles > 0 && ` · 이글 ${r.eagles}`}
                        </>
                      )}
                      {r.holeCount !== 18 && ` · ${r.holeCount}홀`}
                    </span>
                  </span>
                  <span className="st-row-amt">
                    {r.gross ?? "–"}
                    {r.gross != null && "타"}
                  </span>
                  {res && (
                    <span className={`st-res ${res}`}>{res === "win" ? "승" : res === "loss" ? "패" : "무"}</span>
                  )}
                  <Icon name="chevronRight" size={16} className="st-row-go" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {person && by === "money" && (
        <>
          <PersonHero
            p={person}
            label={person.uid === myUid ? undefined : "나와 누적"}
          />

          {person.vsMe ? (
            <>
              <div className="section-title">나와 맞대결</div>
              <WinLossBar
                win={person.vsMe.win}
                draw={person.vsMe.draw}
                loss={person.vsMe.loss}
                winLabel="나"
                middle={`${person.vsMe.draw}무`}
                lossLabel={person.name || "?"}
                left={<Amt v={person.vsMe.myTotal} />}
                right={<Amt v={person.vsMe.theirTotal} />}
              />
            </>
          ) : (
            <>
              <div className="section-title">내 승패</div>
              <WinLossBar
                win={person.wins}
                draw={person.draws}
                loss={person.losses}
                winLabel=""
                middle={`${person.draws}무 · 승률 ${Math.round((person.wins / Math.max(1, person.rounds)) * 100)}%`}
                lossLabel=""
                left={<Amt v={person.history.reduce((t, r) => t + Math.max(0, r.net), 0)} />}
                right={<Amt v={person.history.reduce((t, r) => t + Math.min(0, r.net), 0)} />}
              />
            </>
          )}

          <div className="section-title">라운드별 기록 {person.history.length}개</div>
          <div className="card st-list">
            {person.history.map((r) => (
              // 누르면 그 라운드의 정산 결과 화면으로 (닫으면 다시 이 화면)
              <button className="st-rec st-rec-btn" key={r.roundId} onClick={() => openRound(r.roundId)}>
                <RecDate date={r.date} />
                <span className="st-row-main">
                  <span className="st-row-name">
                    <span className="ri-title">{r.courseName || "이름 없는 라운드"}</span>
                    <span className={`mode-tag ${r.gameMode}`}>{GAME_MODE_LABEL[r.gameMode]}</span>
                  </span>
                  <span className="st-row-sub">
                    {r.playerCount}명 중 {r.rank}위
                    {r.gross != null && ` · ${r.gross}타`}
                    {r.birdies > 0 && ` · 버디 ${r.birdies}`}
                    {r.eagles > 0 && ` · 이글 ${r.eagles}`}
                  </span>
                </span>
                {/* 캐디피·등수 내기(내는 돈·금액 없음)는 주고받은 돈 대신 낸 캐디피·점수 */}
                {r.money ? (
                  <span className={`st-row-amt ${tone(r.net)}`}>{money(r.net)}</span>
                ) : (
                  <span className="st-row-amt st-row-detail">{r.detail ?? "–"}</span>
                )}
                <Icon name="chevronRight" size={16} className="st-row-go" />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="app">
      {/* 뒤로가기: 사람 상세 → 전체, 전체 → 홈 */}
      <TopBar
        left={<BackButton onClick={() => (selected ? setSelected(null) : close())} />}
        right={<NoticeButton />}
      />

      {split ? (
        <div className="split-view">
          {(["money", "strokes"] as const).map((k) => {
            const p = splitPerson[k];
            return (
              <div className={`split-pane st-${k}`} key={k}>
                <PaneHead
                  title={p ? p.name || "?" : k === "money" ? "금액" : "타수"}
                  sub={
                    p
                      ? k === "money"
                        ? p.uid === myUid ? "내 누적 금액" : "함께한 라운드 누적"
                        : p.uid === myUid ? "내 평균 타수 (18홀)" : "함께한 라운드 평균"
                      : k === "money"
                        ? "누적 금액 순"
                        : "나와의 평균 타수 차이 순"
                  }
                  onBack={p ? () => pick(k, null) : undefined}
                />
                <div className="sheet">
                  {status}
                  {body(k, p, (uid) => pick(k, uid))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sheet">
          <h2 className="page-title">{person ? person.name || "전적" : "전적"}</h2>
          {status}
          {stats && stats.roundCount > 0 && !person && (
            <div className="segmented st-by">
              {(
                [
                  ["money", "금액"],
                  ["strokes", "타수"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={by === k ? "active" : ""} onClick={() => setBy(k)}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {body(by, person, open)}
        </div>
      )}
    </div>
  );
}
