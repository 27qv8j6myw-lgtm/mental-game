import { useState } from "react";
import { useAuth } from "./auth";
import { useRound } from "./round";
import GameScreen from "./screens/GameScreen";
import ResultsScreen from "./screens/ResultsScreen";
import LoginScreen from "./screens/LoginScreen";
import RoundsHomeScreen from "./screens/RoundsHomeScreen";
import CreateRoundScreen from "./screens/CreateRoundScreen";
import LobbyScreen from "./screens/LobbyScreen";
import { Icon } from "./icons";
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
  const [view, setView] = useState<"home" | "create">("home");

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
  return <RoundsHomeScreen onCreate={() => setView("create")} />;
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

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="flag" size={18} />
          </span>
          {session.config.courseName || "멘탈게임"}
        </div>
        <div className="actions">
          {round.isHost && session.status === "playing" && (
            <button className="icon-btn" onClick={() => void round.finish()}>
              <Icon name="finish" size={20} />
            </button>
          )}
          <button className="icon-btn" onClick={round.closeRound}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>

      {tab === "game" ? (
        <GameScreen session={session} />
      ) : (
        <ResultsScreen session={session} onEditScores={() => showTab("game")} />
      )}

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
          정산 결과
        </button>
        <button onClick={round.closeRound}>
          <span className="ic">
            <Icon name="layers" size={20} />
          </span>
          라운드
        </button>
      </div>

      {round.isHost &&
        session.status === "playing" &&
        (tab === "result" ||
          (tab === "game" &&
            session.currentHole === session.holes.length - 1)) && (
          <div className="floating-finish">
            <button className="btn-primary" onClick={() => void round.finish()}>
              <Icon name="finish" size={18} className="inline-ic" /> 라운드 종료하고 정산
              확정
            </button>
          </div>
        )}

      {round.isHost && session.status === "done" && tab === "game" && (
        <div className="floating-finish">
          <button className="btn-primary" onClick={() => showTab("result")}>
            <Icon name="trophy" size={18} className="inline-ic" /> 수정 완료 · 최종 정산 보기
          </button>
        </div>
      )}
    </div>
  );
}
