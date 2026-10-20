import { useEffect, useState } from "react";
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
import { appendEditLog, scoreText } from "./util";
import type { HoleScore, Session } from "./types";

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
  // 기록 모드: 정산 대신 기록 분석, 각자 자기 기록을 고치므로 '스코어 수정' 초안이 없다
  const isRecord = session.config.gameMode === "record";

  // 정산 확정 후 스코어 수정: 초안에만 반영하고 '수정 완료' 때 바뀐 것만 저장, '취소'면 버린다
  const [draft, setDraft] = useState<HoleScore[] | null>(null);
  const editing = draft !== null;
  const view: Session = draft
    ? {
        ...session,
        holes: draft,
        editing: true,
        // PAR 를 낮추면 더블파를 넘는 스코어는 더블파로 맞춘다
        setPar: (i, par) =>
          setDraft(
            (d) =>
              d &&
              d.map((h, j) =>
                j === i
                  ? {
                      par,
                      scores: Object.fromEntries(
                        Object.entries(h.scores).map(([k, v]) => [k, v == null ? v : Math.min(v, par)])
                      ),
                    }
                  : h
              )
          ),
        setScore: (i, pid, v) =>
          setDraft(
            (d) => d && d.map((h, j) => (j === i ? { ...h, scores: { ...h.scores, [pid]: v } } : h))
          ),
      }
    : session;

  const startEdit = () => {
    setDraft(session.holes.map((h) => ({ par: h.par, scores: { ...h.scores } })));
    showTab("game");
  };
  const commitEdit = () => {
    const nameOf = (id: string) =>
      session.config.players.find((p) => p.id === id)?.name || "?";
    const items: string[] = [];
    draft?.forEach((h, i) => {
      const orig = session.holes[i];
      if (h.par !== orig.par) {
        session.setPar(i, h.par);
        items.push(`${i + 1}번 홀 PAR ${orig.par} → ${h.par}`);
      }
      for (const pid of Object.keys(h.scores)) {
        if (h.scores[pid] !== orig.scores[pid]) {
          session.setScore(i, pid, h.scores[pid]);
          items.push(
            `${i + 1}번 홀 ${nameOf(pid)}: ${scoreText(orig.par, orig.scores[pid])} → ${scoreText(h.par, h.scores[pid])}`
          );
        }
      }
    });
    if (items.length > 0 && round.bundle) {
      const by = round.myUid ? nameOf(round.myUid) : "방장";
      void round.updateRound({ rules: appendEditLog(round.bundle.round.rules, by, items) });
    }
    setDraft(null);
    showTab("result");
  };
  const cancelEdit = () => {
    setDraft(null);
    showTab("result");
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="flag" size={18} />
          </span>
          {editing ? "스코어 수정" : session.config.courseName || "멘탈게임"}
        </div>
        {!editing && (
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
        )}
      </div>

      {tab === "game" ? (
        isRecord ? (
          <RecordGameScreen session={session} />
        ) : (
          <GameScreen session={view} />
        )
      ) : isRecord ? (
        <RecordResultsScreen session={session} />
      ) : (
        <ResultsScreen session={session} onEditScores={startEdit} />
      )}

      {editing ? (
        <div className="edit-bar">
          <button className="btn-ghost" onClick={cancelEdit}>
            취소
          </button>
          <button className="btn-primary" onClick={commitEdit}>
            수정 완료
          </button>
        </div>
      ) : (
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

      {round.isHost &&
        session.status === "playing" &&
        (tab === "result" ||
          (tab === "game" &&
            session.currentHole === session.holes.length - 1)) && (
          <div className="floating-finish">
            <button className="btn-primary" onClick={() => void round.finish()}>
              <Icon name="finish" size={18} className="inline-ic" />{" "}
              {isRecord ? "라운드 종료" : "라운드 종료하고 정산 확정"}
            </button>
          </div>
        )}
    </div>
  );
}
