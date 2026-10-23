import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";
import { useRound } from "./round";
import GameScreen from "./screens/GameScreen";
import ResultsScreen from "./screens/ResultsScreen";
import RecordGameScreen from "./screens/RecordGameScreen";
import RecordResultsScreen from "./screens/RecordResultsScreen";
import RecordStatsScreen from "./screens/RecordStatsScreen";
import LoginScreen from "./screens/LoginScreen";
import RoundsHomeScreen from "./screens/RoundsHomeScreen";
import CreateRoundScreen from "./screens/CreateRoundScreen";
import LobbyScreen from "./screens/LobbyScreen";
import AdminScreen from "./screens/AdminScreen";
import StatsScreen from "./screens/StatsScreen";
import NameDialog from "./screens/NameDialog";
import RankingScreen from "./screens/RankingScreen";
import ProfileScreen from "./screens/ProfileScreen";
import TopBar, { BackButton } from "./screens/TopBar";
import { LogoHead } from "./screens/PaneHead";
import { DockButton } from "./screens/PlayBar";
import { Avatar, Icon } from "./icons";
import { useBack } from "./back";
import { useOnline } from "./online";
import { useUnfolded } from "./rail";
import type { Session } from "./types";

export default function App() {
  const { mode, user } = useAuth();

  if (mode === "loading") {
    return (
      <div className="app">
        <div className="sheet center-col" style={{ justifyContent: "center" }}>
          <div className="empty-note">불러오는 중…</div>
        </div>
      </div>
    );
  }

  // 예전 게스트(로그인 없이 참여) 세션이 남은 폰도 로그인하게 한다 (로그인하면 게스트 기록이 옮겨진다)
  if (mode === "signed-out" || user?.isAnonymous) return <LoginScreen />;
  return (
    <>
      <MemberFlow />
      <NamePrompt />
    </>
  );
}

/** 처음 로그인했을 때: 앱에서 쓸 이름(실명)·성별을 정하기 전까지 띄운다 (게스트는 묻지 않는다) */
function NamePrompt() {
  const { user } = useAuth();
  // 이름이나 성별을 아직 안 정했으면 (예전에 이름만 정한 사람도 성별을 한 번 묻는다)
  if (!user || user.isAnonymous || (user.nameSet && user.gender)) return null;
  // Apple 로그인은 이름을 로그인 직후에 따로 저장해서, 이름이 들어오면 다시 그려 미리 채운다
  return (
    <NameDialog
      key={user.providerName ?? ""}
      initial={user.nameSet ? user.displayName ?? "" : user.providerName ?? ""}
    />
  );
}

/* ============================ 로그인 사용자: 멀티플레이어 ============================ */

function MemberFlow() {
  const round = useRound();
  const { user } = useAuth();
  const [view, setView] = useState<"home" | "create" | "admin" | "stats" | "records" | "ranking" | "profile">("home");
  /** 내 정보 → 랭킹 공개 범위로 연 랭킹 관리 (닫으면 내 정보로 돌아간다) */
  const [rankingManage, setRankingManage] = useState(false);
  // 펼친 iPhone Duo: 라운드 만들기·대기실은 라운드 탭 왼쪽 칸에 (오른쪽은 진행 중 목록 그대로)
  const split = useUnfolded();

  // 라운드를 만들어 들어갔으면, 라운드를 닫을 때 만들기 화면이 아니라 홈으로 돌아온다
  // (전적·라운드 기록에서 연 라운드는 닫으면 그 화면으로 돌아온다)
  useEffect(() => {
    if (round.activeRoundId && view === "create") setView("home");
  }, [round.activeRoundId, view]);

  // 기기 뒤로가기: 라운드 → (전적·기록 등) 화면 → 홈 순서로 닫는다
  // (관리자 대시보드는 내 정보에서 여니 내 정보로)
  useBack(view !== "home", () => setView((v) => (v === "admin" ? "profile" : "home")));
  useBack(!!round.activeRoundId, () => round.closeRound());

  if (round.activeRoundId) {
    if (round.loading || !round.session) {
      return (
        <div className="app">
          <TopBar left={<BackButton label="라운드 목록으로" onClick={() => round.closeRound()} />} />
          <div className="sheet center-col" style={{ justifyContent: "center" }}>
            {round.loading ? (
              <div className="empty-note">라운드 불러오는 중…</div>
            ) : (
              // 처음 여는 라운드인데 통신이 안 됨 (한 번 연 라운드는 기기에 보관한 화면으로 바로 열린다)
              <div className="load-fail">
                <div className="empty-note">라운드를 불러오지 못했어요.<br />연결을 확인하고 다시 시도해 주세요.</div>
                <button className="btn-line wide" onClick={() => void round.refresh()}>
                  다시 시도
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }
    if (round.status === "lobby")
      return split ? (
        <RoundsHomeScreen onCreate={() => setView("create")} side={<LobbyScreen embedded />} />
      ) : (
        <LobbyScreen />
      );
    return <RoundPlay session={round.session} />;
  }

  if (view === "create")
    return split ? (
      <RoundsHomeScreen
        onCreate={() => setView("create")}
        side={<CreateRoundScreen embedded onCancel={() => setView("home")} />}
      />
    ) : (
      <CreateRoundScreen onCancel={() => setView("home")} />
    );
  if (view === "admin") return <AdminScreen onClose={() => setView("profile")} />;
  // 홈·전적·기록·랭킹은 하단 탭으로 오간다 (아이콘만, 떠 있는 유리 바). 오른쪽 끝은 프로필
  // 내 정보에서 연 랭킹 관리는 내 정보 탭에 불을 켠다
  const tab = rankingManage ? "profile" : view;
  const tabs = (
    <>
      <nav className="tabbar" aria-label="메뉴">
        {(
          [
            ["home", "flag", "라운드"],
            ["stats", "trophy", "전적"],
            ["ranking", "medal", "랭킹"],
            ["records", "graph", "기록"],
          ] as const
        ).map(([v, icon, label]) => (
          <button
            key={v}
            className={tab === v ? "active" : ""}
            aria-pressed={tab === v}
            aria-label={label}
            onClick={() => {
              setRankingManage(false);
              setView(v);
              window.scrollTo(0, 0);
            }}
          >
            <Icon name={icon} size={24} />
          </button>
        ))}
        <button
          className={`tab-profile${tab === "profile" ? " active" : ""}`}
          aria-label="내 정보"
          aria-pressed={tab === "profile"}
          onClick={() => {
            setRankingManage(false);
            setView("profile");
            window.scrollTo(0, 0);
          }}
        >
          <Avatar photoUrl={user?.photoURL} fallback="user" size={28} />
        </button>
      </nav>
    </>
  );
  return (
    <>
      {view === "stats" ? (
        <StatsScreen onClose={() => setView("home")} />
      ) : view === "records" ? (
        <RecordStatsScreen onClose={() => setView("home")} />
      ) : view === "ranking" ? (
        <RankingScreen
          key={rankingManage ? "manage" : "ranking"}
          manageOnly={rankingManage}
          onClose={() => {
            setView(rankingManage ? "profile" : "home");
            setRankingManage(false);
          }}
        />
      ) : view === "profile" ? (
        <ProfileScreen
          onClose={() => setView("home")}
          onAdmin={() => setView("admin")}
          onRankingManage={() => {
            setRankingManage(true);
            setView("ranking");
            window.scrollTo(0, 0);
          }}
        />
      ) : (
        <RoundsHomeScreen onCreate={() => setView("create")} />
      )}
      {tabs}
    </>
  );
}

function RoundPlay({ session }: { session: Session }) {
  const round = useRound();
  const [firstTab] = useState<"game" | "result">(session.status === "done" ? "result" : "game");
  const [tab, setTab] = useState<"game" | "result">(firstTab);
  /** 펼친 iPhone Duo: 왼쪽 정산 결과(기록 분석) · 오른쪽 홀 진행을 함께 보여 준다 */
  const split = useUnfolded();
  const showTab = (t: "game" | "result") => {
    // 두 칸이 다 보이면 탭을 바꾸지 않고 그 칸을 맨 위로
    if (split) {
      document.querySelector(`.split-pane.${t}`)?.scrollTo(0, 0);
      return;
    }
    setTab(t);
    window.scrollTo(0, 0);
  };
  // 기기 뒤로가기: 다른 탭에 있으면 처음 탭으로
  // 기록 모드: 정산 대신 기록 분석
  const isRecord = session.config.gameMode === "record";

  // 홀 수정·내 기록 초안이 열려 있는 동안: 상단 버튼·탭바를 잠가(숨기지 않고: 화면이 밀리지 않게) 저장/취소로 끝내게 한다
  const [busy, setBusy] = useState(false);
  const onBusyChange = useCallback((b: boolean) => setBusy(b), []);
  const online = useOnline();
  useBack(tab !== firstTab, () => showTab(firstTab));
  // 초안이 열려 있으면 뒤로가기로 나가지 않는다 (저장/취소로 끝낸다)
  useBack(busy, () => false);

  // 홀 저장 방식: 저장 안 된 홀
  const unsaved = session.holeSave ? session.holes.filter((h) => h.saved === false).length : 0;

  /** 방장: 최종 확정 (확정하면 방장만 고칠 수 있다) */
  const finishing = useRef(false);
  /** 종료(확정)를 보낸다. 통신 실패면 알려 주고 다시 누를 수 있게 둔다 */
  const doFinish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      await round.finish();
    } catch (e) {
      console.error(e);
      session.setNotice(
        isRecord
          ? "라운드를 종료하지 못했어요. 연결을 확인하고 다시 눌러 주세요"
          : "최종 확정을 하지 못했어요. 연결을 확인하고 다시 눌러 주세요"
      );
    } finally {
      finishing.current = false;
    }
  };
  /** 라운드 종료(최종 확정): 방장만, 늘 확인 창으로 한 번 더 묻는다 */
  const finalize = () => {
    if (!round.isHost || session.status !== "playing") return;
    const msg = isRecord
      ? "라운드를 종료할까요?\n종료 뒤에도 내 기록은 고칠 수 있어요."
      : session.holeSave && unsaved > 0
        ? `라운드를 종료할까요?\n저장 안 된 홀이 ${unsaved}개 있어요.\n저장한 ${session.holes.length - unsaved}개 홀만 정산해요.`
        : "라운드를 종료할까요?\n종료하면 정산이 확정돼요.\n이후엔 방장만 스코어를 고쳐요.";
    if (window.confirm(msg)) void doFinish();
  };

  // 방장이 최종 확정하면 참여자 화면도 정산 결과로
  const prevStatus = useRef(session.status);
  useEffect(() => {
    if (prevStatus.current === "playing" && session.status === "done") showTab("result");
    prevStatus.current = session.status;
  }, [session.status]);

  return (
    <div className="app">
      {/* 왼쪽 정산 결과(기록 분석) ↔ 오른쪽 홀 진행 (펼친 화면의 두 칸과 같은 쪽). 라운드 목록으로는 아래 홈.
          펼친 화면은 두 칸이 다 보여서 위 바 없이 왼쪽 칸 머리에 로고 */}
      {!split && (
        <TopBar
          className="round-top"
          locked={busy}
          left={
            <button
              className={`icon-btn ${tab === "result" ? "on" : ""}`}
              aria-label={isRecord ? "기록 분석" : "정산 결과"}
              aria-pressed={tab === "result"}
              disabled={busy}
              onClick={() => showTab("result")}
            >
              <Icon name={isRecord ? "graph" : "trophy"} size={24} />
            </button>
          }
          right={
            <button
              className={`icon-btn ${tab === "game" ? "on" : ""}`}
              aria-label="홀 진행"
              aria-pressed={tab === "game"}
              disabled={busy}
              onClick={() => showTab("game")}
            >
              <Icon name="flag" size={24} />
            </button>
          }
        />
      )}

      {/* 홀 진행 칸은 접든 펴든 늘 같은 자리에 둬서, 입력하던 점수가 화면을 접고 펼 때 사라지지 않게 한다.
          접힌 화면에서는 칸 상자가 없는 것처럼(display: contents) 지금 탭 하나만 보인다 */}
      <div className={`round-panes ${split ? "split split-view" : ""}`}>
        {(split || tab === "result") && (
          <div className="split-pane result">
            {split && <LogoHead />}
            {isRecord ? (
              <RecordResultsScreen session={session} />
            ) : (
              <ResultsScreen
                session={session}
                onEditScores={() => showTab("game")}
              />
            )}
          </div>
        )}
        {(split || tab === "game") && (
          <div className="split-pane game">
            {isRecord ? (
              <RecordGameScreen session={session} onBusyChange={onBusyChange} />
            ) : (
              <GameScreen
                session={session}
                onFinish={finalize}
                onShowResult={() => showTab("result")}
                onBusyChange={onBusyChange}
              />
            )}
          </div>
        )}
      </div>

      {/* 아래 줄 왼쪽: 라운드 목록으로(홈) · 방장의 라운드 종료(빨강). 홀 진행·정산 결과 어디서든 같은 자리.
          저장 안 된 홀이 있으면 종료할 때 알려 준다 (finalize) */}
      <button
        className="round-exit"
        aria-label="라운드 목록으로"
        disabled={busy}
        onClick={() => round.closeRound()}
      >
        <Icon name="home" size={26} />
      </button>
      {round.isHost && session.status === "playing" && (
        <DockButton tone="danger" className="round-end" label="종료" disabled={busy} onClick={finalize} />
      )}
      {/* 통신이 끊겼거나 저장이 밀려 있으면: 입력은 이 폰에 보관했다가 연결되면 올린다 */}
      {(!online || !!session.pendingSaves) && (
        <span className="offline-pill round-net">{online ? "저장 대기" : "오프라인"}</span>
      )}

    </div>
  );
}
