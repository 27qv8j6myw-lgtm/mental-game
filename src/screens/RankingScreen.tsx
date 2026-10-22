import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { useBack } from "../back";
import { Avatar, Icon } from "../icons";
import TopBar, { BackButton, NoticeButton } from "./TopBar";
import PaneHead, { LogoHead } from "./PaneHead";
import Highlights, { computeHighlights } from "./Highlights";
import { useUnfolded } from "../rail";
import {
  cachedRanking,
  excludeFromRanking,
  includeInRanking,
  loadProfile,
  loadRanking,
  overall,
  periodLabel,
  periodsOf,
  ranking,
  RankingSetupError,
  setRankingVisibility,
  withoutExcluded,
  type PeriodKind,
  type RankingData,
  type RankRow,
  type Visibility,
} from "../ranking";
import type { RecordRound } from "../recordStats";

/** 오늘 (한국 시간) YYYY-MM-DD */
const todaySeoul = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

const KINDS: [PeriodKind, string][] = [
  ["month", "월별"],
  ["year", "연도별"],
];

/** 내 공개 범위 고르기 (랭킹 관리). 내가 보는 랭킹도 이 범위를 따른다 */
const VISIBILITY: [Visibility, string, string][] = [
  [
    "played",
    "함께 친 사람만 (기본)",
    "함께 친 사람끼리만 서로 순위·기록을 봐요. 내 랭킹에도 함께 친 사람만 나와요.",
  ],
  [
    "all",
    "전체 공개",
    "전체 공개한 사람끼리 서로 봐요. 내 랭킹에 함께 친 사람과 전체 공개한 사람이 나와요. 함께 친 사람만 고른 사람은 함께 친 적이 없으면 안 보여요.",
  ],
  ["hidden", "숨기기", "내 기록이 안 보이고, 다른 사람 랭킹도 못 봐요."],
];

/** 랭킹 위 한 줄: 지금 보고 있는 범위 (내 공개 범위를 따른다) */
const SCOPE_CAPTION: Record<Visibility, string> = {
  played: "함께 친 사람 순위",
  all: "전체 순위 (함께 친 사람 + 전체 공개한 사람)",
  hidden: "",
};

/** 순위 변화: ▲2 / ▼1 / – / NEW (비교할 순위가 없으면 비움) */
function Change({ c }: { c: RankRow["change"] }) {
  if (c == null) return null;
  if (c === "new") return <span className="rk-chg new">NEW</span>;
  if (c === 0) return <span className="rk-chg same">–</span>;
  return (
    <span className={`rk-chg ${c > 0 ? "up" : "down"}`}>
      {c > 0 ? "▲" : "▼"}
      {Math.abs(c)}
    </span>
  );
}

/** 이용자 기록은 한 번 받으면 탭을 닫을 때까지 다시 받지 않는다 */
const profiles = new Map<string, RecordRound[]>();
/** 사람을 보고 돌아왔을 때 보던 기간을 그대로 */
let lastView: { kind: PeriodKind; key: string | null; selected: string | null } = {
  kind: "month",
  key: null,
  selected: null,
};

/** 랭킹: 모든 이용자의 18홀 평균 타수 순위 (월별·연도별, 전월 대비 순위 변화). 누르면 그 사람 기록 */
export default function RankingScreen({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const myUid = user?.uid ?? "";
  const [data, setData] = useState<RankingData | null>(cachedRanking);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKindState] = useState<PeriodKind>(lastView.kind);
  const [key, setKeyState] = useState<string | null>(lastView.key);
  const [selected, setSelectedState] = useState<string | null>(lastView.selected);
  const setKind = (v: PeriodKind) => {
    lastView = { ...lastView, kind: v, key: null, selected: null };
    setKindState(v);
    setKeyState(null);
  };
  const setKey = (v: string) => {
    lastView = { ...lastView, key: v };
    setKeyState(v);
  };
  const setSelected = (uid: string | null) => {
    lastView = { ...lastView, selected: uid };
    setSelectedState(uid);
    window.scrollTo(0, 0);
    document.querySelector(".split-pane.rk-left")?.scrollTo(0, 0);
  };
  const close = () => {
    lastView = { kind: "month", key: null, selected: null };
    profiles.clear();
    onClose();
  };
  /** 랭킹 관리 (숨기기 · 제외한 사람) */
  const [managing, setManaging] = useState(false);
  const openManage = () => {
    setManaging(true);
    window.scrollTo(0, 0);
  };
  // 기기 뒤로가기: 랭킹 관리 → 순위, 사람 → 순위
  useBack(managing, () => setManaging(false));
  useBack(!!selected && !managing, () => setSelected(null));

  const load = () =>
    loadRanking()
      .then((d) => {
        setErr(null);
        setData(d);
      })
      .catch((e) => {
        console.error(e);
        setErr(
          e instanceof RankingSetupError
            ? "랭킹을 쓰려면 Supabase 에서 ranking.sql 을 실행해야 해요."
            : "랭킹을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        );
      });
  useEffect(() => {
    void load();
  }, []);

  // 내 공개 범위 (숨기면 다른 사람 랭킹도 볼 수 없다)
  const [busy, setBusy] = useState(false);
  const setVisibility = async (v: Visibility) => {
    if (busy || !data || data.visibility === v) return;
    if (v === "hidden" && !window.confirm("랭킹에서 숨길까요?\n숨기면 다른 사람 랭킹도 못 봐요.")) return;
    setBusy(true);
    try {
      await setRankingVisibility(v);
      await load();
    } catch (e) {
      console.error(e);
      alert("바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  // 모르는 사람 제외 / 다시 넣기 (내 랭킹에서만)
  const exclude = async (uid: string, name: string) => {
    if (busy) return;
    if (!window.confirm(`${name || "이 사람"}님을 빼고 순위를 매길까요?\n내 랭킹에서만 빠져요.\n랭킹 관리에서 다시 넣을 수 있어요.`))
      return;
    setBusy(true);
    try {
      await excludeFromRanking(uid, name);
      setData((d) => d && { ...d, excluded: new Map(d.excluded).set(uid, name) });
      setSelected(null);
    } catch (e) {
      console.error(e);
      alert("제외하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  const include = async (uid: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await includeInRanking(uid);
      setData((d) => {
        if (!d) return d;
        const excluded = new Map(d.excluded);
        excluded.delete(uid);
        return { ...d, excluded };
      });
    } catch (e) {
      console.error(e);
      alert("다시 넣지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  // 순위는 제외한 사람을 빼고 매긴다 (누가 보이는지는 서버가 내 공개 범위대로 정한다)
  const shown = useMemo(() => (data ? withoutExcluded(data) : null), [data]);
  // 순위가 있는 기간 (최근 순). 고른 기간이 없으면 가장 최근
  const periods = useMemo(() => (shown ? periodsOf(shown, kind) : []), [shown, kind]);
  const activeKey = key && periods.includes(key) ? key : periods[0] ?? null;
  const idx = activeKey ? periods.indexOf(activeKey) : -1;
  const today = todaySeoul();
  const result = useMemo(
    () => (shown && activeKey ? ranking(shown, kind, activeKey, today) : null),
    [shown, kind, activeKey, today]
  );
  const rows = result?.rows ?? [];
  const who = (uid: string) => data?.players.get(uid);
  // 펼친 iPhone Duo: 오른쪽 순위 · 왼쪽 고른 사람 (고르기 전에는 1위)
  const split = useUnfolded();
  const focus = split ? selected ?? rows[0]?.uid ?? null : selected;

  // 고른 사람의 기록 라운드 (하이라이트)
  const [profile, setProfile] = useState<{ uid: string; rounds: RecordRound[] } | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  useEffect(() => {
    setProfileErr(null);
    if (!focus) return;
    const saved = profiles.get(focus);
    if (saved) {
      setProfile({ uid: focus, rounds: saved });
      return;
    }
    let alive = true;
    loadProfile(focus)
      .then((rs) => {
        profiles.set(focus, rs);
        if (alive) setProfile({ uid: focus, rounds: rs });
      })
      .catch((e) => {
        console.error(e);
        if (alive) setProfileErr("기록을 불러오지 못했어요.");
      });
    return () => {
      alive = false;
    };
  }, [focus]);

  const person = focus && (split || !managing) ? who(focus) : null;
  const personRow = focus ? rows.find((r) => r.uid === focus) : undefined;
  // 18홀 베스트 스코어 (기록 없이 친 라운드 포함)
  const best = (data && focus && overall(data, focus)?.best) || null;
  const highlights = useMemo(
    () => (profile && profile.uid === focus ? computeHighlights(profile.rounds, best) : null),
    [profile, focus, best]
  );

  // 시상대: 2위 · 1위 · 3위 순으로 놓는다
  const podium = [rows[1], rows[0], rows[2]].filter((r): r is RankRow => !!r);

  const statusBlock = (
    <>
      {err && (
        <div className="card">
          <div className="empty-note" style={{ color: "var(--loss)" }}>
            {err}
          </div>
        </div>
      )}
      {!data && !err && (
        <div className="card">
          <div className="empty-note">불러오는 중…</div>
        </div>
      )}
    </>
  );
  const manageBlock = (
    <>
      {/* 랭킹 관리: 숨기기 · 제외한 사람 */}
      {data && managing && (
        <>
          <div className="rk-notice">
            <Icon name="info" size={18} />
            <div>
              <b>랭킹 화면은 내 공개 범위를 따라가요</b>
              <span>
                함께 친 사람만이면 그 사람들 순위만 보여요. 전체 공개면 전체 순위가 보여요. '함께 친 사람만'인
                사람은 나와 친 적이 있어야 보여요. 순위는 18홀을 끝까지 친 라운드의 평균 타수예요. 모르는 사람은
                이름을 눌러 '제외'할 수 있어요.
              </span>
            </div>
          </div>

          <div className="section-title">내 공개 범위</div>
          <div className="card rk-vis" role="radiogroup" aria-label="내 공개 범위">
            {VISIBILITY.map(([v, title, desc]) => (
              <button
                key={v}
                className={`rk-vis-row ${data.visibility === v ? "on" : ""}`}
                role="radio"
                aria-checked={data.visibility === v}
                disabled={busy}
                onClick={() => void setVisibility(v)}
              >
                <span className="rk-radio" aria-hidden="true" />
                <span className="tinfo">
                  <span className="t">{title}</span>
                  <span className="s">{desc}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="section-title">제외한 사람 {data.excluded.size}명</div>
          {data.excluded.size === 0 ? (
            <div className="card">
              <div className="empty-note">
                제외한 사람이 없어요. 랭킹에서 이름을 눌러 '제외'할 수 있어요.
              </div>
            </div>
          ) : (
            <div className="card st-list">
              {[...data.excluded.entries()].map(([uid, name]) => {
                const p = who(uid);
                return (
                  <div className="st-row rk-ex-row" key={uid}>
                    <Avatar photoUrl={p?.photoUrl} gender={p?.gender} size={30} />
                    <span className="st-row-main">
                      <span className="st-row-name">{p?.name || name || "?"}</span>
                    </span>
                    <button className="rk-ex-btn" disabled={busy} onClick={() => void include(uid)}>
                      다시 넣기
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="hint" style={{ margin: "8px 2px 0" }}>
            제외는 내 랭킹에서만 빠지고, 그 사람에게는 알리지 않아요.
          </p>
        </>
      )}

      {/* 랭킹에서 숨긴 사람: 순위를 보여 주지 않는다 */}
    </>
  );
  const hiddenBlock = (
    <>
      {data?.hidden && !managing && (
        <div className="rk-hidden">
          <Icon name="podium" size={34} />
          <b>랭킹을 숨겨서 다른 사람 랭킹도 볼 수 없어요</b>
          <span>위의 랭킹 관리에서 공개 범위를 바꾸면 다시 볼 수 있어요.</span>
        </div>
      )}
    </>
  );
  const listBlock = (
    <>
      {data && !data.hidden && !managing && (split || !person) && (
        <>
          {/* 범위는 제목 줄 '랭킹 관리'에서 바꾼다 */}
          <div className="rk-scope">
            <span>{SCOPE_CAPTION[data.visibility]}</span>
          </div>

          <div className="segmented" style={{ marginBottom: 12 }}>
            {KINDS.map(([k, label]) => (
              <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>

          {activeKey ? (
            <div className="rk-period">
              <button
                className="icon-btn"
                aria-label="이전 기간"
                disabled={idx >= periods.length - 1}
                onClick={() => setKey(periods[idx + 1])}
              >
                <Icon name="chevronLeft" size={20} />
              </button>
              <b>{periodLabel(activeKey)}</b>
              <button
                className="icon-btn"
                aria-label="다음 기간"
                disabled={idx <= 0}
                onClick={() => setKey(periods[idx - 1])}
              >
                <Icon name="chevronRight" size={20} />
              </button>
            </div>
          ) : (
            <div className="card">
              <div className="empty-note">
                {data.visibility === "played"
                  ? "함께 친 사람 중 18홀을 끝까지 친 라운드가 아직 없어요."
                  : "아직 18홀을 끝까지 친 라운드가 없어요."}
              </div>
            </div>
          )}

          {podium.length > 0 && (
            <div className="card rk-podium">
              {podium.map((r) => {
                const p = who(r.uid);
                const place = Math.min(r.rank, 3);
                return (
                  <button key={r.uid} className={`rk-pod p${rows.indexOf(r) + 1}`} onClick={() => setSelected(r.uid)}>
                    <span className={`rk-pod-face m${place}`}>
                      <Avatar photoUrl={p?.photoUrl} gender={p?.gender} size={rows.indexOf(r) === 0 ? 56 : 46} />
                      <span className="rk-medal">{r.rank}</span>
                    </span>
                    <span className="rk-pod-name">
                      {p?.name || "?"}
                      {r.uid === myUid && <span className="me-tag">나</span>}
                    </span>
                    <span className="rk-pod-avg">
                      {r.avg.toFixed(1)}
                      <small>타</small>
                    </span>
                    <span className="rk-pod-sub">
                      {r.rounds}라운드 <Change c={r.change} />
                    </span>
                    <span className={`rk-pod-base m${place}`} />
                  </button>
                );
              })}
            </div>
          )}

          {rows.length > 3 && (
            <>
              <div className="section-title rk-title">
                <span>순위</span>
                {result?.compare && <span className="rk-compare">순위 변화 · {result.compare}</span>}
              </div>
              <div className="card st-list">
                {rows.slice(3).map((r) => {
                  const p = who(r.uid);
                  const me = r.uid === myUid;
                  return (
                    <button
                      className={`st-row ${me ? "st-row-me" : ""} ${split && r.uid === focus ? "rr-on" : ""}`}
                      key={r.uid}
                      onClick={() => setSelected(r.uid)}
                    >
                      <span className="rank">{r.rank}</span>
                      <Avatar photoUrl={p?.photoUrl} gender={p?.gender} size={30} />
                      <span className="st-row-main">
                        <span className="st-row-name">
                          {p?.name || "?"}
                          {me && <span className="me-tag">나</span>}
                        </span>
                        <span className="st-row-sub">
                          {r.rounds}라운드 · 베스트 {r.best}타
                        </span>
                      </span>
                      <span className="st-row-amt">{r.avg.toFixed(1)}타</span>
                      <span className="rk-chg-col">
                        <Change c={r.change} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {rows.length > 0 && (
            <p className="hint" style={{ margin: "8px 2px 0" }}>
              18홀을 끝까지 친 라운드의 평균 타수 순위예요. 로그인한 이용자만 들어가요.
              {data.excluded.size > 0 && ` 제외한 ${data.excluded.size}명은 빼고 매겼어요.`}
              {rows.length <= 3 && result?.compare && ` 순위 변화는 ${result.compare}예요.`}
            </p>
          )}
        </>
      )}
    </>
  );
  const profileBlock = (
    <>
      {data && !data.hidden && (split || !managing) && person && focus && (
        <>
          <div className="card st-hero">
            <div className="st-hero-top">
              <Avatar photoUrl={person.photoUrl} gender={person.gender} size={40} />
              <div className="st-hero-name">
                <span>
                  {activeKey && periodLabel(activeKey)} {personRow ? `${personRow.rank}위` : "순위 없음"}
                </span>
                <span className="rk-hero-name">
                  <b>{person.name || "?"}</b>
                  {/* 모르는 사람: 내 랭킹에서 빼고 순위를 매긴다 */}
                  {focus !== myUid && (
                    <button
                      className="rk-ex-pill"
                      disabled={busy}
                      onClick={() => void exclude(focus, person.name)}
                    >
                      제외
                    </button>
                  )}
                </span>
              </div>
              <div className="st-hero-amt">
                {personRow ? personRow.avg.toFixed(1) : "–"}
                {personRow && <small>타</small>}
              </div>
            </div>
            {personRow && (
              <div className="st-golf">
                <span>
                  <b>{personRow.rounds}</b>라운드
                </span>
                <span>
                  베스트 <b>{personRow.best}</b>타
                </span>
                {personRow.change != null && (
                  <span>
                    {result?.compare} <Change c={personRow.change} />
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 하이라이트: 가장 좋았던 기록들 (명예의 전당) */}
          <div className="section-title">하이라이트</div>
          {profileErr ? (
            <div className="card">
              <div className="empty-note" style={{ color: "var(--loss)" }}>
                {profileErr}
              </div>
            </div>
          ) : highlights ? (
            <Highlights items={highlights} />
          ) : (
            <div className="card">
              <div className="empty-note">불러오는 중…</div>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="app">
      {/* 뒤로가기: 랭킹 관리·사람 프로필 → 랭킹, 랭킹 → 홈 */}
      <TopBar
        left={
          <BackButton
            onClick={() => (managing ? setManaging(false) : selected ? setSelected(null) : close())}
          />
        }
        right={<NoticeButton />}
      />

      {split ? (
        <div className="split-view">
          <div className="split-pane rk-left">
            <LogoHead />
            <div className="sheet">
              {profileBlock}
              {data && !data.hidden && !person && rows.length > 0 && (
                <div className="card">
                  <div className="empty-note">순위에서 사람을 누르면 기록이 여기에 나와요.</div>
                </div>
              )}
            </div>
          </div>
          <div className="split-pane rk-right">
            <PaneHead
              title={managing ? "랭킹 관리" : "랭킹"}
              onBack={managing ? () => setManaging(false) : undefined}
              right={
                data && !managing ? (
                  <button className="rk-manage-btn" onClick={openManage}>
                    랭킹 관리
                  </button>
                ) : undefined
              }
            />
            <div className="sheet">
              {statusBlock}
              {manageBlock}
              {hiddenBlock}
              {listBlock}
            </div>
          </div>
        </div>
      ) : (
        <div className="sheet">
          <div className="page-title-row">
            <h2 className="page-title">{managing ? "랭킹 관리" : person ? person.name || "랭킹" : "랭킹"}</h2>
            {data && !managing && (
              <button className="rk-manage-btn" onClick={openManage}>
                랭킹 관리
              </button>
            )}
          </div>
          {statusBlock}
          {manageBlock}
          {hiddenBlock}
          {listBlock}
          {profileBlock}
        </div>
      )}
    </div>
  );
}
