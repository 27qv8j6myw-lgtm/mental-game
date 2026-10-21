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
import { Icon } from "./icons";
import { firstUnsaved } from "./model";
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
  return <MemberFlow />;
}

/* ============================ 로그인 사용자: 멀티플레이어 ============================ */

function MemberFlow() {
  const round = useRound();
  const [view, setView] = useState<"home" | "create" | "admin" | "stats" | "records">("home");

  // 라운드를 만들어 들어갔으면, 라운드를 닫을 때 만들기 화면이 아니라 홈으로 돌아온다
  // (전적·라운드 기록에서 연 라운드는 닫으면 그 화면으로 돌아온다)
  useEffect(() => {
    if (round.activeRoundId && view === "create") setView("home");
  }, [round.activeRoundId, view]);

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
            <button className="icon-btn" onClick={round.closeRound}>
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="sheet center-col" style={{ justifyContent: "center" }}>
            <div className="empty-note">라운드 불러오는 중…</div>
          </div>
        </div>
      );
    }
    if (round.status === "lobby") return <LobbyScreen />;
    return <RoundPlay session={round.session} />;
  }

  if (view === "create") return <CreateRoundScreen onCancel={() => setView("home")} />;
  if (view === "admin") return <AdminScreen onClose={() => setView("home")} />;
  if (view === "stats") return <StatsScreen onClose={() => setView("home")} />;
  if (view === "records") return <RecordStatsScreen onClose={() => setView("home")} />;
  return (
    <RoundsHomeScreen
      onCreate={() => setView("create")}
      onAdmin={() => setView("admin")}
      onStats={() => setView("stats")}
      onRecords={() => setView("records")}
    />
  );
}

function RoundPlay({ session }: { session: Session }) {
  const round = useRound();
  const [tab, setTab] = useState<"game" | "result">(
    session.status === "done" ? "result" : "game"
  );
  const showTab = (t: "game" | "result") => {
    setTab(t);
    window.scrollTo(0, 0);
  };
  // 기록 모드: 정산 대신 기록 분석
  const isRecord = session.config.gameMode === "record";

  // 홀 수정·내 기록 초안이 열려 있는 동안: 탭바·종료 버튼을 숨겨 저장/취소로 끝내게 한다
  const [busy, setBusy] = useState(false);
  const onBusyChange = useCallback((b: boolean) => setBusy(b), []);

  // 홀 저장 방식: 저장 안 된 홀
  const unsaved = session.holeSave ? session.holes.filter((h) => h.saved === false).length : 0;
  const allSaved = session.holeSave && firstUnsaved(session.holes) < 0;

  /** 방장: 최종 확정 (확정하면 방장만 고칠 수 있다) */
  const finalize = () => {
    if (!session.holeSave) {
      void round.finish();
      return;
    }
    const msg =
      unsaved > 0
        ? `아직 저장 안 된 홀이 ${unsaved}개 있어요.\n지금 종료하면 저장된 ${session.holes.length - unsaved}개 홀만 정산돼요. 최종 확정할까요?`
        : "최종 확정할까요?\n확정하면 정산이 끝나고 방장만 스코어를 고칠 수 있어요.";
    if (window.confirm(msg)) void round.finish();
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
          {session.config.courseName || "멘탈게임"}
        </div>
        {!busy && (
          <div className="actions">
            {round.isHost && session.status === "playing" && (
              <button className="icon-btn" aria-label="라운드 종료" onClick={finalize}>
                <Icon name="finish" size={20} />
              </button>
            )}
            <button className="icon-btn" onClick={round.closeRound}>
              <Icon name="close" size={20} />
            </button>
          </div>
        )}
      </div>

      {tab === "game" ? (
        isRecord ? (
          <RecordGameScreen session={session} onBusyChange={onBusyChange} />
        ) : (
          <GameScreen session={session} onFinish={finalize} onBusyChange={onBusyChange} />
        )
      ) : isRecord ? (
        <RecordResultsScreen session={session} />
      ) : (
        <ResultsScreen session={session} onEditScores={() => showTab("game")} />
      )}

      {!busy && (
        <div className="tabbar">
          <button className={tab === "game" ? "active" : ""} onClick={() => setTab("game")}>
            <span className="ic">
              <Icon name="flag" size={20} />
            </span>
            홀 진행
          </button>
          <button
            className={tab === "result" ? "active" : ""}
            onClick={() => setTab("result")}
          >
            <span className="ic">
              <Icon name="trophy" size={20} />
            </span>
            {isRecord ? "기록 분석" : "정산 결과"}
          </button>
          <button onClick={round.closeRound}>
            <span className="ic">
              <Icon name="layers" size={20} />
            </span>
            라운드
          </button>
        </div>
      )}

      {/* 라운드 종료: 기록 모드는 마지막 홀·기록 분석에서, 내기 라운드는 모든 홀을 저장한 뒤 정산 결과에서
          (홀 진행의 마지막 홀에서는 아래 버튼 줄에 '최종 확정'이 있다) */}
      {round.isHost &&
        session.status === "playing" &&
        !busy &&
        (isRecord
          ? tab === "result" || session.currentHole === session.holes.length - 1
          : tab === "result" && (allSaved || !session.holeSave)) && (
          <div className="floating-finish">
            <button className="btn-primary" onClick={finalize}>
              <Icon name="finish" size={18} className="inline-ic" />{" "}
              {isRecord ? "라운드 종료" : session.holeSave ? "최종 확정" : "라운드 종료하고 정산 확정"}
            </button>
          </div>
        )}
    </div>
  );
}
