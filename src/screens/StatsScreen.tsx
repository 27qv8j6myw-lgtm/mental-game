import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { useRound } from "../round";
import { useBack } from "../back";
import { loadStats, type PersonStats, type StatsResult } from "../stats";
import { Avatar, Icon } from "../icons";
import { GAME_MODE_LABEL, wonSigned } from "../util";

const tone = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const money = (n: number) => (n === 0 ? "±0원" : wonSigned(n));
/** 2026-10-20 → 10/20 */
const md = (d: string) => {
  const [, m, day] = d.split("-");
  return m && day ? `${Number(m)}/${Number(day)}` : d;
};

/** 승·패·무 표기: 돈을 딴 라운드는 승, 잃은 라운드는 패, 본전은 무 */
const record = (p: PersonStats) =>
  `${p.wins}승 ${p.losses}패${p.draws > 0 ? ` ${p.draws}무` : ""}`;

/** 승·무·패 막대. 위에는 승패 수, 막대 아래에는 양쪽 금액 */
function WinLossBar({
  win,
  draw,
  loss,
  winLabel,
  middle,
  lossLabel,
  leftAmt,
  rightAmt,
}: {
  win: number;
  draw: number;
  loss: number;
  winLabel: string;
  middle: string;
  lossLabel: string;
  leftAmt: { label: string; value: number };
  rightAmt: { label: string; value: number };
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
      <div className="st-vs-amt">
        <span>
          {leftAmt.label && `${leftAmt.label} `}
          <b className={tone(leftAmt.value)}>{money(leftAmt.value)}</b>
        </span>
        <span>
          {rightAmt.label && `${rightAmt.label} `}
          <b className={tone(rightAmt.value)}>{money(rightAmt.value)}</b>
        </span>
      </div>
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
  label: string;
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
        <Avatar photoUrl={p.photoUrl} gender={p.gender} size={40} />
        <div className="st-hero-name">
          <span>{label}</span>
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
        <span>
          <b>{p.wins}</b>승 <b>{p.losses}</b>패
          {p.draws > 0 && (
            <>
              {" "}
              <b>{p.draws}</b>무
            </>
          )}
        </span>
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

/**
 * 라운드 정산 결과를 보고 돌아왔을 때 보던 사람 화면을 그대로 보여주려고 기억해 둔다.
 * 전적 화면을 닫으면 지운다.
 */
let lastSelected: string | null = null;

/** 전적: 나와 함께한 정산 확정 라운드 기준, 사람마다 기록과 누적 금액 */
export default function StatsScreen({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { openRound } = useRound();
  const myUid = user?.uid ?? "";
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelectedState] = useState<string | null>(() => lastSelected);
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
  // 함께한 사람들 목록에는 나를 넣지 않는다 (나는 맨 위 카드)
  const others = stats?.people.filter((p) => p.uid !== myUid) ?? [];
  const open = (uid: string) => {
    setSelected(uid);
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="trophy" size={18} />
          </span>
          {person ? person.name || "전적" : "전적"}
        </div>
        <button className="icon-btn" aria-label="닫기" onClick={close}>
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="sheet">
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

        {stats && stats.roundCount > 0 && !person && (
          <>
            {stats.me && (
              <PersonHero p={stats.me} label="내 누적 금액" onOpen={() => open(myUid)} />
            )}

            <div className="section-title">함께한 사람들 {others.length}명</div>
            <div className="card st-list">
              {others.map((p, i) => (
                <button className="st-row" key={p.uid} onClick={() => open(p.uid)}>
                  <span className={`rank ${i === 0 && p.total > 0 ? "top" : ""}`}>{i + 1}</span>
                  <Avatar photoUrl={p.photoUrl} gender={p.gender} size={30} />
                  <span className="st-row-main">
                    <span className="st-row-name">{p.name || "?"}</span>
                    <span className="st-row-sub">
                      {p.rounds}라운드 · {record(p)}
                    </span>
                  </span>
                  <span className={`st-row-amt ${tone(p.total)}`}>{money(p.total)}</span>
                  <Icon name="chevronRight" size={16} className="st-row-go" />
                </button>
              ))}
            </div>
          </>
        )}

        {person && (
          <>
            <button className="st-back" onClick={() => setSelected(null)}>
              <Icon name="chevronLeft" size={16} /> 전체 보기
            </button>
            <PersonHero
              p={person}
              label={person.uid === myUid ? "내 누적 금액" : "나와 함께한 라운드 누적"}
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
                  leftAmt={{ label: "", value: person.vsMe.myTotal }}
                  rightAmt={{ label: "", value: person.vsMe.theirTotal }}
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
                  leftAmt={{
                    label: "",
                    value: person.history.reduce((t, r) => t + Math.max(0, r.net), 0),
                  }}
                  rightAmt={{
                    label: "",
                    value: person.history.reduce((t, r) => t + Math.min(0, r.net), 0),
                  }}
                />
              </>
            )}

            <div className="section-title">라운드별 기록 {person.history.length}개</div>
            <div className="card st-list">
              {person.history.map((r) => (
                // 누르면 그 라운드의 정산 결과 화면으로 (닫으면 다시 이 화면)
                <button className="st-rec st-rec-btn" key={r.roundId} onClick={() => openRound(r.roundId)}>
                  <span className="st-rec-date">{md(r.date)}</span>
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
                  <span className={`st-row-amt ${tone(r.net)}`}>{money(r.net)}</span>
                  <Icon name="chevronRight" size={16} className="st-row-go" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
