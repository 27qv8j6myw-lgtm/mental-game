import { useState } from "react";
import { useApp } from "./store";
import { useAuth } from "./auth";
import { useRound } from "./round";
import SetupScreen from "./screens/SetupScreen";
import GameScreen from "./screens/GameScreen";
import ResultsScreen from "./screens/ResultsScreen";
import LoginScreen from "./screens/LoginScreen";
import RoundsHomeScreen from "./screens/RoundsHomeScreen";
import CreateRoundScreen from "./screens/CreateRoundScreen";
import LobbyScreen from "./screens/LobbyScreen";
import { won } from "./util";
import { Avatar, Icon } from "./icons";
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
  if (mode === "guest") return <GuestFlow />;
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
        <ResultsScreen session={session} />
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
    </div>
  );
}

/* ============================ 게스트: 로컬 단일 기기 ============================ */

function GuestFlow() {
  const { state, startGame, resetAll, setPar, setScore, goHole } = useApp();
  const { signOutUser } = useAuth();
  const [editing, setEditing] = useState(!state.config);
  const [tab, setTab] = useState<"game" | "result">("game");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const showSetup = editing || !state.config;

  const session: Session | null = state.config
    ? {
        config: state.config,
        holes: state.holes,
        currentHole: state.currentHole,
        goHole,
        setPar,
        setScore,
      }
    : null;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="flag" size={18} />
          </span>
          멘탈게임
        </div>
        <div className="actions">
          <button className="icon-btn" onClick={() => void signOutUser()}>
            <Icon name="logout" size={19} />
          </button>
          {showSetup ? (
            state.config && (
              <button className="icon-btn" onClick={() => setEditing(false)}>
                <Icon name="close" size={20} />
              </button>
            )
          ) : state.started ? (
            <button className="icon-btn" onClick={() => setMenuOpen(true)}>
              <Icon name="gear" size={19} />
            </button>
          ) : (
            <button className="icon-btn" onClick={() => setEditing(true)}>
              <Icon name="gear" size={19} />
            </button>
          )}
        </div>
      </div>

      {showSetup ? (
        <SetupScreen
          key={state.config ? "edit" : "new"}
          onSaved={() => setEditing(false)}
        />
      ) : !state.started ? (
        <ReadyScreen onStart={startGame} onEdit={() => setEditing(true)} />
      ) : (
        session && (
          <>
            {tab === "game" ? (
              <GameScreen session={session} />
            ) : (
              <ResultsScreen session={session} />
            )}
            <div className="tabbar">
              <button
                className={tab === "game" ? "active" : ""}
                onClick={() => setTab("game")}
              >
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
            </div>
          </>
        )
      )}

      {menuOpen && (
        <div className="modal-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>게임 진행 중</h3>
            <p className="hint" style={{ marginBottom: 4 }}>
              게임이 시작되어 세팅은 수정할 수 없어요. 처음부터 다시 하려면 새
              게임을 시작하세요.
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setMenuOpen(false)}>
                닫기
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmReset(true);
                }}
              >
                새 게임
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmReset && (
        <div className="modal-backdrop" onClick={() => setConfirmReset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>새 게임을 시작할까요?</h3>
            <p className="hint">현재 라운드 진행 내용이 초기화됩니다.</p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmReset(false)}>
                취소
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  resetAll();
                  setConfirmReset(false);
                  setEditing(true);
                  setTab("game");
                }}
              >
                초기화하고 새로
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadyScreen({
  onStart,
  onEdit,
}: {
  onStart: () => void;
  onEdit: () => void;
}) {
  const { state } = useApp();
  const config = state.config!;
  const activeRules = [
    config.rules.parPenalty && "파 페널티 배판",
    config.rules.birdieDouble ? "버디 배판" : "버디 추가정산",
    config.rules.tie && "동타 배판",
  ].filter(Boolean) as string[];

  return (
    <div className="sheet">
      <div className="section-title">세팅 완료</div>
      <div className="card">
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 2 }}>
          {config.courseName || "골프장"}
        </div>
        <div className="hint" style={{ marginBottom: 12 }}>
          {config.courseTee && `${config.courseTee} · `}
          {config.date} {config.teeTime}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill green">타당 {won(config.unit)}</span>
          <span className="pill gold">
            핸디 {config.handicapSettle === "pre" ? "사전" : "사후"}정산
          </span>
        </div>
      </div>

      <div className="section-title">참여자 {config.players.length}명</div>
      <div className="card">
        {config.players.map((p) => (
          <div
            className="gplayer"
            key={p.id}
            style={{ justifyContent: "space-between" }}
          >
            <span className="gp-name">
              <Avatar photoUrl={p.photoUrl} gender={p.gender} size={22} />
              <b>{p.name || "?"}</b>
            </span>
            <span className="hint">
              평균 {p.avgScore} · 핸디 {p.handicap}
            </span>
          </div>
        ))}
      </div>

      <div className="section-title">적용 규칙</div>
      <div className="card">
        <div className="chips">
          {activeRules.map((r) => (
            <span
              key={r}
              className="chip gold active"
              style={{ pointerEvents: "none" }}
            >
              {r}
            </span>
          ))}
        </div>
      </div>

      <div className="actionbar">
        <button className="btn-primary" onClick={onStart}>
          게임 시작
        </button>
        <button
          onClick={onEdit}
          className="link-edit"
        >
          <Icon name="gear" size={15} className="inline-ic" /> 세팅 수정하기
        </button>
      </div>
    </div>
  );
}
