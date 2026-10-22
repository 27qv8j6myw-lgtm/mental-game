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
import { Icon } from "./icons";
import { firstUnsaved } from "./model";
import { useBack } from "./back";
import { useOnline } from "./online";
import type { Session } from "./types";

export default function App() {
  const { mode } = useAuth();

  if (mode === "loading") {
    return (
      <div className="app">
        <div className="sheet center-col" style={{ justifyContent: "center" }}>
          <div className="empty-note">불러오는 중…</div>
        </div>
      </div>
    );
  }

  if (mode === "signed-out") return <LoginScreen />;
  return (
    <>
      <MemberFlow />
      <NamePrompt />
    </>
  );
}

/** 처음 로그인했을 때: 앱에서 쓸 이름(실명)을 정하기 전까지 띄운다 (게스트는 묻지 않는다) */
function NamePrompt() {
  const { user } = useAuth();
  if (!user || user.isAnonymous || user.nameSet) return null;
  return <NameDialog initial={user.providerName ?? ""} />;
}

/* ============================ 로그인 사용자: 멀티플레이어 ============================ */

function MemberFlow() {
  const round = useRound();
  const [view, setView] = useState<"home" | "create" | "admin" | "stats" | "records" | "ranking">("home");

  // 라운드를 만들어 들어갔으면, 라운드를 닫을 때 만들기 화면이 아니라 홈으로 돌아온다
  // (전적·라운드 기록에서 연 라운드는 닫으면 그 화면으로 돌아온다)
  useEffect(() => {
    if (round.activeRoundId && view === "create") setView("home");
  }, [round.activeRoundId, view]);

  // 기기 뒤로가기: 라운드 → (전적·기록 등) 화면 → 홈 순서로 닫는다
  useBack(view !== "home", () => setView("home"));
  useBack(!!round.activeRoundId, () => round.closeRound());

  if (round.activeRoundId) {
    if (round.loading || !round.session) {
      return (
        <div className="app">
          <div className="topbar">
            <div className="brand">
              <span className="dot">
                <Icon name="flag" size={18} />
              </span>
              멘탈게임
            </div>
            <button className="icon-btn" aria-label="닫기" onClick={() => round.closeRound()}>
              <Icon name="close" size={20} />
            </button>
          </div>
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
    if (round.status === "lobby") return <LobbyScreen />;
    return <RoundPlay session={round.session} />;
  }

  if (view === "create") return <CreateRoundScreen onCancel={() => setView("home")} />;
  if (view === "admin") return <AdminScreen onClose={() => setView("home")} />;
  // 홈·전적·기록·랭킹은 하단 탭으로 오간다
  const tabs = (
    <div className="tabbar">
      {(
        [
          ["home", "flag", "라운드"],
          ["stats", "trophy", "전적"],
          ["ranking", "podium", "랭킹"],
          ["records", "chart", "기록"],
        ] as const
      ).map(([v, icon, label]) => (
        <button
          key={v}
          className={view === v ? "active" : ""}
          aria-pressed={view === v}
          onClick={() => {
            setView(v);
            window.scrollTo(0, 0);
          }}
        >
          <span className="ic">
            <Icon name={icon} size={20} />
          </span>
          {label}
        </button>
      ))}
    </div>
  );
  return (
    <>
      {view === "stats" ? (
        <StatsScreen onClose={() => setView("home")} />
      ) : view === "records" ? (
        <RecordStatsScreen onClose={() => setView("home")} />
      ) : view === "ranking" ? (
        <RankingScreen onClose={() => setView("home")} />
      ) : (
        <RoundsHomeScreen onCreate={() => setView("create")} onAdmin={() => setView("admin")} />
      )}
      {tabs}
    </>
  );
}

function RoundPlay({ session }: { session: Session }) {
  const round = useRound();
  const [firstTab] = useState<"game" | "result">(session.status === "done" ? "result" : "game");
  const [tab, setTab] = useState<"game" | "result">(firstTab);
  const showTab = (t: "game" | "result") => {
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
  const allSaved = session.holeSave && firstUnsaved(session.holes) < 0;

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
  const finalize = () => {
    if (isRecord) {
      if (window.confirm("라운드를 종료할까요?\n종료해도 내 기록은 계속 고칠 수 있어요.")) void doFinish();
      return;
    }
    if (!session.holeSave) {
      if (window.confirm("최종 확정할까요?\n확정하면 정산이 끝나고 방장만 스코어를 고칠 수 있어요.")) void doFinish();
      return;
    }
    const msg =
      unsaved > 0
        ? `아직 저장 안 된 홀이 ${unsaved}개 있어요.\n지금 종료하면 저장된 ${session.holes.length - unsaved}개 홀만 정산돼요. 최종 확정할까요?`
        : "최종 확정할까요?\n확정하면 정산이 끝나고 방장만 스코어를 고칠 수 있어요.";
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
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="flag" size={18} />
          </span>
          <span className="brand-name">{session.config.courseName || "멘탈게임"}</span>
          {/* 통신이 끊겼거나 저장이 밀려 있으면: 입력은 이 폰에 보관했다가 연결되면 올린다 */}
          {(!online || !!session.pendingSaves) && (
            <span className="offline-pill">{online ? "저장 대기" : "오프라인"}</span>
          )}
        </div>
        {/* 홀 진행 ↔ 정산 결과(기록 분석)는 아이콘으로, X 는 라운드 목록으로 */}
        <div className={`actions ${busy ? "locked" : ""}`}>
          <button
            className={`icon-btn ${tab === "game" ? "on" : ""}`}
            aria-label="홀 진행"
            aria-pressed={tab === "game"}
            disabled={busy}
            onClick={() => showTab("game")}
          >
            <Icon name="flag" size={20} />
          </button>
          <button
            className={`icon-btn ${tab === "result" ? "on" : ""}`}
            aria-label={isRecord ? "기록 분석" : "정산 결과"}
            aria-pressed={tab === "result"}
            disabled={busy}
            onClick={() => showTab("result")}
          >
            <Icon name={isRecord ? "chart" : "trophy"} size={20} />
          </button>
          <button className="icon-btn" aria-label="라운드 목록으로" disabled={busy} onClick={() => round.closeRound()}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>

      {tab === "game" ? (
        isRecord ? (
          <RecordGameScreen session={session} onFinish={finalize} onBusyChange={onBusyChange} />
        ) : (
          <GameScreen
            session={session}
            onFinish={finalize}
            onShowResult={() => showTab("result")}
            onBusyChange={onBusyChange}
          />
        )
      ) : isRecord ? (
        <RecordResultsScreen session={session} />
      ) : (
        <ResultsScreen
          session={session}
          onEditScores={() => showTab("game")}
          // 홀을 다 저장하기 전에 끝내기 (방장, 비·시간 문제로 일찍 마칠 때). 다 저장했으면 아래 '최종 확정'
          onFinishEarly={round.isHost && session.status === "playing" && unsaved > 0 ? finalize : undefined}
        />
      )}

      {/* 정산 결과·기록 분석 화면의 라운드 종료 (홀 진행에서는 아래 버튼 줄에 있다).
          내기 라운드는 모든 홀을 저장한 뒤에만 */}
      {round.isHost &&
        session.status === "playing" &&
        tab === "result" &&
        (isRecord || allSaved || !session.holeSave) && (
          <div className="floating-finish">
            <button className="btn-primary" onClick={finalize}>
              <Icon name="finish" size={18} className="inline-ic" />{" "}
              {isRecord ? "라운드 종료" : "최종 확정"}
            </button>
          </div>
        )}
    </div>
  );
}
