import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { loadStats, type PersonStats, type RoundRecord, type StatsResult } from "../stats";
import { Avatar, Icon } from "../icons";
import { GAME_MODE_LABEL, wonSigned } from "../util";

const tone = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const money = (n: number) => (n === 0 ? "±0원" : wonSigned(n));
/** 2026-10-20 → 10/20 */
const md = (d: string) => {
  const [, m, day] = d.split("-");
  return m && day ? `${Number(m)}/${Number(day)}` : d;
};

/** 라운드별 금액 막대 (오래된 → 최근, 최근 20라운드) */
function NetBars({ history }: { history: RoundRecord[] }) {
  const recent = history.slice(0, 20).reverse();
  const max = Math.max(1, ...recent.map((r) => Math.abs(r.net)));
  if (recent.length === 0) return null;
  return (
    <div className="st-bars" aria-label="라운드별 금액">
      {recent.map((r) => (
        <div className="st-bar" key={r.roundId} title={`${md(r.date)} ${money(r.net)}`}>
          <div className="st-up">
            {r.net > 0 && <span className="pos" style={{ height: `${(r.net / max) * 100}%` }} />}
          </div>
          <div className="st-down">
            {r.net < 0 && <span className="neg" style={{ height: `${(-r.net / max) * 100}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 사람 요약 카드: 누적 금액 + 라운드·1위·딴/잃은 + 타수 */
function PersonHero({ p, label }: { p: PersonStats; label: string }) {
  return (
    <div className="card st-hero">
      <div className="st-hero-top">
        <Avatar photoUrl={p.photoUrl} gender={p.gender} size={40} />
        <div className="st-hero-name">
          <span>{label}</span>
          <b>{p.name || "?"}</b>
        </div>
        <div className={`st-hero-amt ${tone(p.total)}`}>{money(p.total)}</div>
      </div>
      <div className="st-chips">
        <span>
          <b>{p.rounds}</b>라운드
        </span>
        <span>
          1위 <b>{p.firsts}</b>번
        </span>
        <span>
          딴 <b>{p.wins}</b> · 잃은 <b>{p.losses}</b>
          {p.draws > 0 && (
            <>
              {" "}
              · 본전 <b>{p.draws}</b>
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
      <NetBars history={p.history} />
      <p className="hint" style={{ marginTop: 8 }}>
        막대는 최근 {Math.min(20, p.history.length)}라운드 금액이에요. 평균·베스트는 18홀을 다 친
        라운드 기준이에요.
      </p>
    </div>
  );
}

/** 전적: 나와 함께한 정산 확정 라운드 기준, 사람마다 기록과 누적 금액 */
export default function StatsScreen({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const myUid = user?.uid ?? "";
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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
        <button className="icon-btn" aria-label="닫기" onClick={onClose}>
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
              아직 정산 확정된 라운드가 없어요. 라운드를 끝내고 정산을 확정하면 전적이 쌓여요.
            </div>
          </div>
        )}

        {stats && stats.roundCount > 0 && !person && (
          <>
            <p className="hint" style={{ margin: "0 2px 12px" }}>
              나와 함께한 정산 확정 라운드 {stats.roundCount}개 기준이에요. 금액은 핸디캡까지 실제로
              주고받은 돈이에요.
            </p>
            {stats.me && <PersonHero p={stats.me} label="내 누적 금액" />}

            <div className="section-title">함께한 사람들 {stats.people.length}명</div>
            <div className="card st-list">
              {stats.people.map((p, i) => (
                <button className="st-row" key={p.uid} onClick={() => open(p.uid)}>
                  <span className={`rank ${i === 0 && p.total > 0 ? "top" : ""}`}>{i + 1}</span>
                  <Avatar photoUrl={p.photoUrl} gender={p.gender} size={30} />
                  <span className="st-row-main">
                    <span className="st-row-name">
                      {p.name || "?"}
                      {p.uid === myUid && <span className="me-tag">나</span>}
                    </span>
                    <span className="st-row-sub">
                      {p.rounds}라운드 · 1위 {p.firsts}번
                      {p.vsMe && (
                        <span className="nw">
                          {" "}
                          · 내가 {p.vsMe.win}승 {p.vsMe.loss}패
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={`st-row-amt ${tone(p.total)}`}>{money(p.total)}</span>
                  <Icon name="chevronRight" size={16} className="st-row-go" />
                </button>
              ))}
            </div>
            <p className="hint" style={{ margin: "2px 2px 0" }}>
              다른 사람의 금액도 나와 함께한 라운드만 합친 거예요. 이름을 누르면 라운드별 기록을 볼
              수 있어요.
            </p>
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

            {person.vsMe && (
              <>
                <div className="section-title">나와 맞대결</div>
                <div className="card st-vs">
                  <div className="st-vs-score">
                    <span>
                      나 <b className="pos">{person.vsMe.win}승</b>
                    </span>
                    <span className="st-vs-mid">{person.vsMe.draw}무</span>
                    <span>
                      <b className="neg">{person.vsMe.loss}패</b> {person.name || "?"}
                    </span>
                  </div>
                  <div className="st-vs-bar">
                    {person.vsMe.win > 0 && (
                      <span className="w" style={{ flexGrow: person.vsMe.win }} />
                    )}
                    {person.vsMe.draw > 0 && (
                      <span className="d" style={{ flexGrow: person.vsMe.draw }} />
                    )}
                    {person.vsMe.loss > 0 && (
                      <span className="l" style={{ flexGrow: person.vsMe.loss }} />
                    )}
                  </div>
                  <p className="hint" style={{ marginTop: 8 }}>
                    함께한 {person.rounds}라운드에서 금액을 더 딴 쪽이 이긴 걸로 셌어요. 같은
                    라운드 합계는 나 {money(person.vsMe.myTotal)}, {person.name || "?"}{" "}
                    {money(person.vsMe.theirTotal)}이에요.
                  </p>
                </div>
              </>
            )}

            <div className="section-title">라운드별 기록 {person.history.length}개</div>
            <div className="card st-list">
              {person.history.map((r) => (
                <div className="st-rec" key={r.roundId}>
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
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
