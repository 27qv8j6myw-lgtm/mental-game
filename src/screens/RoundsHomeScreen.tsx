import { Fragment, useEffect, useRef, useState } from "react";
import { useAuth, type OAuthProvider } from "../auth";
import { useRound } from "../round";
import { useBack } from "../back";
import { takeInvite } from "../invite";
import { joinRoundByCode, leaveOrDeleteRound, listMyRounds, subscribeRoundScores } from "../rounds";
import { Avatar, GoogleLogo, Icon, KakaoLogo } from "../icons";
import type { RoundListItem, RoundRow } from "../types";
import { GAME_MODE_LABEL, relLabel, teeLabel } from "../util";
import { fetchUserRounds, isAdmin, type UserRound } from "../admin";
import { loadStats } from "../stats";
import NameDialog from "./NameDialog";
import { cachedScoreLines, fetchScoreLines, storeScoreLines, type RoundScoreLine } from "../roundScores";

const STATUS_LABEL: Record<string, string> = {
  lobby: "대기중",
  playing: "진행중",
  done: "완료",
};

const LINKABLE: { id: OAuthProvider; label: string }[] = [
  { id: "kakao", label: "카카오" },
  { id: "google", label: "Google" },
];

/** 마지막으로 받은 내 라운드 목록 (사용자별). 통신이 없을 때 홈에 보여준다 */
const LIST_KEY = "mentalgame-rounds-cache";
function readListCache(uid: string | undefined): RoundListItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(LIST_KEY) ?? "null") as { uid: string; list: RoundListItem[] } | null;
    return v && v.uid === uid && Array.isArray(v.list) ? v.list : [];
  } catch {
    return [];
  }
}
function writeListCache(uid: string | undefined, list: RoundListItem[]) {
  try {
    if (uid) localStorage.setItem(LIST_KEY, JSON.stringify({ uid, list }));
  } catch {
    /* 저장소를 쓸 수 없으면 보관하지 않는다 */
  }
}

/** 홈에 보여줄 끝난 라운드 수 (나머지는 전체 보기) */
const RECENT = 5;

/** 관리자: 진행 중·최근 라운드를 본인 것 / 다른 사용자 것 중 무엇으로 볼지 (탭을 오가도 유지) */
type ActiveScope = "mine" | "users";
let lastScope: ActiveScope = "mine";
/** 관리자 사용자 보기를 다시 받는 간격 (다른 사람 라운드는 실시간 구독이 안 된다) */
const USERS_REFRESH_MS = 30_000;

/** 함께 친 사람 (자리 순) */
const seated = (r: RoundListItem) => [...r.round_players].sort((a, b) => a.seat_order - b.seat_order);
/** 이름 (방장이 고친 이름 우선) */
const nameOf = (r: RoundListItem, p: RoundListItem["round_players"][number]) =>
  r.rules.nameOverrides?.[p.user_uid] ?? (p.name || "이름 미정");
const playerNames = (r: RoundListItem) =>
  seated(r)
    .map((p) => nameOf(r, p))
    .join(", ");

/** 함께 친 사람 이름 + 타수. 진행 중이면 지금까지의 파 대비 타수 (+5, E, -1) */
function PlayersLine({ r, line }: { r: RoundListItem; line?: RoundScoreLine }) {
  return (
    <div className="ri-players">
      {seated(r).map((p, i) => {
        const s = line?.players[p.user_uid];
        return (
          <Fragment key={p.user_uid}>
            {i > 0 && ", "}
            <span className="ri-p">
              {nameOf(r, p)}
              {s && line && (
                <b className="ri-score">
                  {line.live ? relLabel(s.toPar) : s.strokes}
                  {/* 일찍 끝낸 라운드: 친 홀까지의 타수 */}
                  {!line.live && s.played < line.holeCount && <small>({s.played}홀)</small>}
                </b>
              )}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

type RoundFilter = "all" | "stroke" | "skins" | "record" | "host";
const FILTERS: [RoundFilter, string][] = [
  ["all", "전체"],
  ["stroke", "타당"],
  ["skins", "스킨스"],
  ["record", "기록"],
  ["host", "내가 방장"],
];

/** 전체 라운드: 골프장·함께 친 사람으로 찾고, 종류로 거르고, 달마다 묶어 보여준다 */
function AllRounds({
  rounds,
  myUid,
  item,
  onClose,
}: {
  rounds: RoundListItem[];
  myUid: string;
  item: (r: RoundListItem) => JSX.Element;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<RoundFilter>("all");
  const query = q.trim().replace(/\s+/g, "").toLowerCase();
  const shown = rounds.filter((r) => {
    if (filter === "host" ? r.host_uid !== myUid : filter !== "all" && (r.rules.gameMode ?? "stroke") !== filter)
      return false;
    if (!query) return true;
    const hay = `${r.course_name} ${playerNames(r)}`.replace(/\s+/g, "").toLowerCase();
    return hay.includes(query);
  });
  // 달마다 묶기 (라운드 날짜, 없으면 만든 날). 최근 날짜가 위로
  const dayOf = (r: RoundListItem) => `${r.date || r.created_at.slice(0, 10)} ${r.tee_time ?? ""}`;
  const sorted = [...shown].sort((a, b) => dayOf(b).localeCompare(dayOf(a)));
  const groups: { key: string; label: string; list: RoundListItem[] }[] = [];
  for (const r of sorted) {
    const d = r.date || r.created_at.slice(0, 10);
    const key = d.slice(0, 7);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const [y, m] = key.split("-");
      g = { key, label: `${y}년 ${Number(m)}월`, list: [] };
      groups.push(g);
    }
    g.list.push(r);
  }
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="flag" size={18} />
          </span>
          전체 라운드
        </div>
        <button className="icon-btn" aria-label="닫기" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="sheet">
        <input
          className="input"
          placeholder="골프장·함께 친 사람 찾기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="round-filters">
          {FILTERS.map(([f, label]) => (
            <button key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
        {groups.length === 0 ? (
          <div className="card">
            <div className="empty-note">{query ? "찾는 라운드가 없어요." : "라운드가 없어요."}</div>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="section-title">
                {g.label} · {g.list.length}라운드
              </div>
              {g.list.map(item)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** 홈 (라운드 탭): 새 라운드·코드로 참여·진행 중·최근 라운드. 전적·기록은 하단 탭 */
export default function RoundsHomeScreen({
  onCreate,
  onAdmin,
}: {
  onCreate: () => void;
  onAdmin: () => void;
}) {
  const { user, signOutUser, linkProvider, unlinkProvider, error, clearError } =
    useAuth();
  const { openRound, exitNotice, clearExitNotice } = useRound();
  // 마지막으로 받은 목록을 먼저 보여준다 (통신이 없어도 라운드를 다시 열 수 있게)
  const [rounds, setRounds] = useState<RoundListItem[]>(() => readListCache(user?.uid));
  const [loading, setLoading] = useState(true);
  /** 목록을 서버에서 받지 못함 (보이는 건 마지막으로 받은 목록) */
  const [loadFailed, setLoadFailed] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /** 전체 라운드 보기 (월별·검색·종류) */
  const [showAll, setShowAll] = useState(false);
  useBack(showAll, () => setShowAll(false));
  // 기기 뒤로가기: 프로필 메뉴 닫기
  useBack(menuOpen, () => setMenuOpen(false));
  // 기기 뒤로가기: 내보내짐 안내 닫기
  useBack(!!exitNotice, clearExitNotice);
  const [linkBusy, setLinkBusy] = useState<OAuthProvider | null>(null);
  // 관리자 계정이면 프로필 메뉴에 대시보드 버튼을 보여준다
  const [admin, setAdmin] = useState(false);
  /** 프로필 메뉴: 내 이름 바꾸기 */
  const [nameOpen, setNameOpen] = useState(false);
  useBack(nameOpen, () => setNameOpen(false));
  /** 라운드별 이름 옆 타수 (보관해 둔 것을 먼저 보여 준다) */
  const uid = user?.uid ?? "";
  const [lines, setLines] = useState<Record<string, RoundScoreLine>>(
    () => cachedScoreLines(uid, rounds).lines
  );
  const roundsRef = useRef(rounds);
  roundsRef.current = rounds;

  const refreshLines = async (targets: RoundListItem[]) => {
    if (!uid || targets.length === 0) return;
    try {
      const got = await fetchScoreLines(targets);
      setLines((prev) => ({ ...prev, ...got }));
      storeScoreLines(uid, roundsRef.current, got);
    } catch (e) {
      console.error("타수 불러오기 실패", e);
    }
  };

  // 목록을 받으면 보이는 라운드의 타수: 홈(진행 중 + 최근 5개)은 늘 새로, 전체 보기는 바뀐 라운드만
  useEffect(() => {
    if (loading || rounds.length === 0) return;
    const done = rounds.filter((r) => r.status === "done");
    const { fresh } = cachedScoreLines(uid, rounds);
    void refreshLines([
      ...rounds.filter((r) => r.status !== "done"),
      ...done.slice(0, RECENT),
      ...(showAll ? done.slice(RECENT).filter((r) => !fresh.has(r.id)) : []),
    ]);
  }, [rounds, loading, showAll]);

  // 진행 중 라운드: 누가 스코어를 넣으면 타수를 바로 고친다 (앱으로 돌아왔을 때도 다시 받는다)
  const liveIds = rounds
    .filter((r) => r.status === "playing")
    .map((r) => r.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!liveIds) return;
    const ids = liveIds.split(",");
    const refresh = () => void refreshLines(roundsRef.current.filter((r) => ids.includes(r.id)));
    let timer: number | undefined;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 400);
    };
    let off = () => {};
    try {
      off = subscribeRoundScores(ids, later);
    } catch (e) {
      console.error(e);
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      off();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [liveIds]);

  const load = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const list = await listMyRounds();
      setRounds(list);
      writeListCache(user?.uid, list);
      // 전적 탭을 바로 열 수 있게 미리 계산해 둔다 (결과는 stats.ts 가 보관)
      if (user?.uid)
        void loadStats(user.uid, list).catch((e) => console.error("전적 불러오기 실패", e));
    } catch (e) {
      console.error(e);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void isAdmin().then(setAdmin);
    // 초대 링크로 들어왔으면 그 라운드에 바로 참여 (로그인을 마친 뒤 홈이 처음 열릴 때)
    const invited = takeInvite();
    if (invited) {
      setCode(invited);
      void join(invited);
    }
  }, []);

  const isAnon = !!user?.isAnonymous;
  const providers = user?.providers ?? [];

  const link = async (p: OAuthProvider) => {
    setLinkBusy(p);
    await linkProvider(p);
    setLinkBusy(null);
  };

  const unlink = async (p: OAuthProvider, label: string) => {
    if (
      !window.confirm(
        `${label} 연결을 해제할까요? 해제하면 ${label}로는 이 계정에 로그인할 수 없어요.`
      )
    )
      return;
    setLinkBusy(p);
    await unlinkProvider(p);
    setLinkBusy(null);
  };

  // 라운드 삭제는 방장만. (참여자가 빠지면 끝난 라운드의 정산이 바뀌므로 참여자용 삭제는 두지 않는다)
  const removeRound = async (r: RoundRow) => {
    if (r.host_uid !== user?.uid) return;
    if (!window.confirm("이 라운드를 삭제할까요? 참여자 모두의 기록이 사라져요.")) return;
    try {
      await leaveOrDeleteRound(r.id, user.uid, true);
      setRounds((rs) => {
        const next = rs.filter((x) => x.id !== r.id);
        writeListCache(user?.uid, next);
        return next;
      });
    } catch (e) {
      console.error(e);
      alert("삭제에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const join = async (c: string = code) => {
    if (c.length !== 4 || joining) return;
    setJoining(true);
    setErr(null);
    try {
      const round = await joinRoundByCode(c, {
        name: user?.displayName?.trim() || "나",
        gender: user?.gender ?? "male",
        avgScore: null,
        handicap: 0,
      });
      openRound(round.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      // 통신 오류는 원문(Failed to fetch 등) 대신 알아볼 수 있게
      setErr(
        !navigator.onLine || /fetch|network|timeout/i.test(msg)
          ? "연결이 안 돼서 참여하지 못했어요. 연결을 확인하고 다시 시도해 주세요."
          : msg || "참여하지 못했어요. 잠시 후 다시 시도해 주세요."
      );
      setJoining(false);
    }
  };

  /** 라운드 한 줄의 내용: 이름·게임 방식·진행 홀 / 날짜·티 / 함께 친 사람과 타수 */
  const itemBody = (r: RoundListItem, line: RoundScoreLine | undefined, hostName?: string) => (
    <>
      <div className="ri-name">
        <span className="ri-title">{r.course_name || "이름 없는 라운드"}</span>
        {/* 게임 방식: 값이 없는 예전 라운드는 타당 */}
        <span className={`mode-tag ${r.rules.gameMode ?? "stroke"}`}>
          {GAME_MODE_LABEL[r.rules.gameMode ?? "stroke"]}
        </span>
        {/* 진행 중: 몇 홀까지 쳤는지 (이름 옆 타수는 파 대비) */}
        {line?.live && <span className="ri-live">{line.played}홀 진행</span>}
      </div>
      <div className="ri-sub">
        {r.date}
        {r.tee_time && ` · ${r.tee_time}`}
        {teeLabel(r.course_tee) && ` · ${teeLabel(r.course_tee)}`}
        {hostName != null ? ` · 방장 ${hostName}` : r.host_uid === user?.uid ? " · 방장" : ""}
      </div>
      {r.round_players.length > 0 && <PlayersLine r={r} line={line} />}
    </>
  );
  /** 관리자 사용자 보기: 다른 사람 라운드 (참여자가 아니어서 열 수 없고 보기만) */
  const otherItem = (r: RoundListItem, line: RoundScoreLine) => {
    const host = r.round_players.find((p) => p.user_uid === r.host_uid);
    return (
      <div key={r.id} className="round-item">
        <div className="ri-open ri-static">{itemBody(r, line, host ? nameOf(r, host) : "")}</div>
        <div className="ri-right">
          <span className={`badge st-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
        </div>
      </div>
    );
  };
  /** 라운드 한 줄 (홈·전체 보기 공용) */
  const item = (r: RoundListItem) => (
    <div key={r.id} className="round-item">
      <button className="ri-open" onClick={() => openRound(r.id)}>
        {itemBody(r, lines[r.id])}
      </button>
      <div className="ri-right">
        <span className={`badge st-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
        {r.host_uid === user?.uid && (
          <button className="ri-del" aria-label="라운드 삭제" onClick={() => void removeRound(r)}>
            <Icon name="trash" size={18} />
          </button>
        )}
      </div>
    </div>
  );
  const activeRounds = rounds.filter((r) => r.status !== "done");
  const doneRounds = rounds.filter((r) => r.status === "done");

  // 관리자: 진행 중·최근 라운드 본인 / 사용자 보기. 사용자 보기는 고를 때·앱으로 돌아올 때·30초마다 다시 받는다
  const [scope, setScopeState] = useState<ActiveScope>(lastScope);
  const setScope = (v: ActiveScope) => {
    lastScope = v;
    setScopeState(v);
  };
  const [userRounds, setUserRounds] = useState<{ active: UserRound[]; recent: UserRound[] } | null>(null);
  const [userErr, setUserErr] = useState(false);
  const showUsers = admin && scope === "users";
  useEffect(() => {
    if (!showUsers) return;
    let alive = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetchUserRounds(RECENT * 2)
        .then((list) => {
          if (!alive) return;
          setUserRounds(list);
          setUserErr(false);
        })
        .catch((e) => {
          console.error(e);
          if (alive) setUserErr(true);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, USERS_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [showUsers]);

  if (showAll) {
    return (
      <AllRounds
        rounds={rounds}
        myUid={user?.uid ?? ""}
        item={item}
        onClose={() => setShowAll(false)}
      />
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="flag" size={18} />
          </span>
          멘탈게임
        </div>
        <div style={{ position: "relative" }}>
          <button className="avatar-btn" onClick={() => setMenuOpen((v) => !v)}>
            <Avatar
              photoUrl={isAnon ? null : user?.photoURL}
              fallback="user"
              size={34}
            />
          </button>
          {menuOpen && (
            <div className="menu">
              <div className="menu-head">
                <div className="mn">{isAnon ? "게스트" : user?.displayName ?? "사용자"}</div>
                <div className="me">{isAnon ? "로그인 없이 참여 중" : user?.email}</div>
              </div>
              {!isAnon && (
                <div className="menu-links">
                  <div className="ml-title">로그인 계정 연결</div>
                  {LINKABLE.map(({ id, label }) => {
                    const linked = providers.includes(id);
                    return (
                      <div className="ml-row" key={id}>
                        <span className={`ml-ic ${id}`}>
                          {id === "kakao" ? <KakaoLogo size={14} /> : <GoogleLogo size={14} />}
                        </span>
                        <span className="ml-name">{label}</span>
                        {linked && <span className="ml-on">연결됨</span>}
                        {linked ? (
                          providers.length > 1 && (
                            <button
                              className="ml-btn ghost"
                              disabled={linkBusy !== null}
                              onClick={() => void unlink(id, label)}
                            >
                              해제
                            </button>
                          )
                        ) : (
                          <button
                            className="ml-btn"
                            disabled={linkBusy !== null}
                            onClick={() => void link(id)}
                          >
                            {linkBusy === id ? "…" : "연결"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!isAnon && (
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setNameOpen(true);
                  }}
                >
                  <Icon name="user" size={17} className="inline-ic" />
                  내 이름 바꾸기
                </button>
              )}
              {admin && (
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onAdmin();
                  }}
                >
                  <Icon name="chart" size={17} className="inline-ic" />
                  관리자 대시보드
                </button>
              )}
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  void signOutUser();
                }}
              >
                <Icon name="logout" size={17} className="inline-ic" />
                {isAnon ? "나가기 / 로그인 화면" : "로그아웃"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="sheet">

        {error && (
          <div className="notice-err" role="alert">
            <span>{error}</span>
            <button aria-label="닫기" onClick={clearError}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        <button className="big-cta" onClick={onCreate}>
          <span className="ic">
            <Icon name="plus" size={24} />
          </span>
          <span className="tx">
            <b>새 라운드 만들기</b>
            <small>방장이 되어 코드를 발급해요</small>
          </span>
        </button>

        <div className="section-title">코드로 참여하기</div>
        <div className="card">
          <div className="join-row">
            <input
              className="input code-input"
              placeholder="초대 코드 4자리"
              inputMode="numeric"
              // (maxLength 를 두면 "…코드: 1234" 를 붙여 넣을 때 앞 4글자만 남아 빈칸이 된다)
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
            <button
              className="btn-primary sm"
              disabled={code.length !== 4 || joining}
              onClick={() => void join()}
            >
              {joining ? "…" : "참여"}
            </button>
          </div>
          {err && (
            <p className="hint" style={{ color: "var(--loss)", marginTop: 8 }}>
              {err}
            </p>
          )}
        </div>

        {loadFailed && (
          <div className="list-offline">
            <span>
              {rounds.length > 0
                ? "연결이 안 돼서 마지막으로 받은 목록이에요."
                : "라운드 목록을 불러오지 못했어요."}
            </span>
            <button onClick={() => void load()}>다시 시도</button>
          </div>
        )}
        {loading && rounds.length === 0 ? (
          <>
            <div className="section-title">내 라운드</div>
            <div className="card">
              <div className="empty-note">불러오는 중…</div>
            </div>
          </>
        ) : rounds.length === 0 ? (
          loadFailed ? null : (
            <>
              <div className="section-title">내 라운드</div>
              <div className="card">
                <div className="empty-note">아직 참여한 라운드가 없어요.</div>
              </div>
            </>
          )
        ) : (
          <>
            {/* 진행 중(대기·진행)은 늘 위에, 끝난 라운드는 최근 5개만 (나머지는 전체 보기) */}
            {(activeRounds.length > 0 || admin) && (
              <>
                <div className="section-title">진행 중</div>
                {/* 관리자: 내 라운드 / 다른 사용자들의 라운드 */}
                {admin && (
                  <div className="segmented home-scope">
                    <button className={scope === "mine" ? "active" : ""} onClick={() => setScope("mine")}>
                      본인
                    </button>
                    <button className={scope === "users" ? "active" : ""} onClick={() => setScope("users")}>
                      사용자{userRounds && userRounds.active.length > 0 ? ` ${userRounds.active.length}` : ""}
                    </button>
                  </div>
                )}
                {!showUsers &&
                  (activeRounds.length > 0 ? (
                    activeRounds.map(item)
                  ) : (
                    <div className="card">
                      <div className="empty-note">진행 중인 내 라운드가 없어요.</div>
                    </div>
                  ))}
                {showUsers &&
                  (userErr && !userRounds ? (
                    <div className="card">
                      <div className="empty-note">
                        불러오지 못했어요. 처음이면 Supabase 에서 admin.sql 을 다시 실행해 주세요.
                      </div>
                    </div>
                  ) : !userRounds ? (
                    <div className="card">
                      <div className="empty-note">불러오는 중…</div>
                    </div>
                  ) : userRounds.active.length === 0 ? (
                    <div className="card">
                      <div className="empty-note">지금 진행 중인 다른 사용자 라운드가 없어요.</div>
                    </div>
                  ) : (
                    <>
                      {userRounds.active.map((u) => otherItem(u.round, u.line))}
                      <p className="hint home-scope-hint">
                        어제부터의 대기·진행 중 라운드예요 (내가 참여한 라운드 빼고). 30초마다 새로 받아요.
                      </p>
                    </>
                  ))}
              </>
            )}
            {/* 관리자 사용자 보기: 다른 사용자들의 최근 끝난 라운드 */}
            {showUsers && userRounds && (
              <>
                <div className="section-title">최근 라운드 · 사용자</div>
                {userRounds.recent.length === 0 ? (
                  <div className="card">
                    <div className="empty-note">다른 사용자의 끝난 라운드가 없어요.</div>
                  </div>
                ) : (
                  userRounds.recent.map((u) => otherItem(u.round, u.line))
                )}
              </>
            )}
            {doneRounds.length > 0 && !showUsers && (
              <>
                <div className="section-title">최근 라운드</div>
                {doneRounds.slice(0, RECENT).map(item)}
                {doneRounds.length > RECENT && (
                  <button className="btn-line wide all-rounds-btn" onClick={() => setShowAll(true)}>
                    전체 라운드 보기 ({rounds.length}개)
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {nameOpen && <NameDialog initial={user?.displayName ?? ""} onClose={() => setNameOpen(false)} />}

      {/* 방장이 나를 내보냈거나 라운드를 지워서 라운드 화면이 닫혔을 때: 가운데 팝업 */}
      {exitNotice && (
        <div className="alert-backdrop" onClick={clearExitNotice}>
          <div className="alert-box" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>{exitNotice}</p>
            <button className="btn-primary" onClick={clearExitNotice}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
