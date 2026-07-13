import { useEffect, useRef, useState } from "react";
import { useApp } from "./store";
import { useAuth } from "./auth";
import SetupScreen from "./screens/SetupScreen";
import GameScreen from "./screens/GameScreen";
import ResultsScreen from "./screens/ResultsScreen";
import LoginScreen from "./screens/LoginScreen";
import ArchiveScreen from "./screens/ArchiveScreen";
import { saveGame } from "./archive";
import { genderEmoji, won } from "./util";

export default function App() {
  const { state, startGame, resetAll, setArchiveId } = useApp();
  const { mode, user, signOutUser } = useAuth();
  const [editing, setEditing] = useState(!state.config);
  const [tab, setTab] = useState<"game" | "result">("game");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // 로그인 사용자: 게임 진행 중 자동 저장(디바운스)
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== "signed-in" || !user || !state.config || !state.started) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const id = await saveGame(
          user.uid,
          state.config!,
          state.holes,
          state.archiveId
        );
        if (!state.archiveId) setArchiveId(id);
      } catch (e) {
        console.error("자동 저장 실패", e);
      }
    }, 1200);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [state.config, state.holes, state.started, mode, user]);

  if (mode === "loading") {
    return (
      <div className="app">
        <div className="sheet center-col" style={{ justifyContent: "center" }}>
          <div className="empty-note">불러오는 중…</div>
        </div>
      </div>
    );
  }

  if (mode === "signed-out") {
    return <LoginScreen />;
  }

  if (archiveOpen) {
    return <ArchiveScreen onClose={() => setArchiveOpen(false)} />;
  }

  const showSetup = editing || !state.config;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">⛳</span>
          멘탈게임
        </div>
        <div className="actions">
          {mode === "signed-in" && user && (
            <div className="user-chip">
              {user.photoURL && (
                <img className="avatar" src={user.photoURL} alt="" />
              )}
            </div>
          )}
          <button className="icon-btn" onClick={() => setArchiveOpen(true)}>
            🗂
          </button>
          {showSetup ? (
            state.config && (
              <button className="icon-btn" onClick={() => setEditing(false)}>
                ✕
              </button>
            )
          ) : state.started ? (
            <button className="icon-btn" onClick={() => setMenuOpen(true)}>
              ⚙︎
            </button>
          ) : (
            <button className="icon-btn" onClick={() => setEditing(true)}>
              ⚙︎
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
        <>
          {tab === "game" ? <GameScreen /> : <ResultsScreen />}
          <div className="tabbar">
            <button
              className={tab === "game" ? "active" : ""}
              onClick={() => setTab("game")}
            >
              <span className="ic">⛳</span>홀 진행
            </button>
            <button
              className={tab === "result" ? "active" : ""}
              onClick={() => setTab("result")}
            >
              <span className="ic">🏆</span>정산 결과
            </button>
            <button onClick={() => setArchiveOpen(true)}>
              <span className="ic">🗂</span>기록
            </button>
          </div>
        </>
      )}

      {menuOpen && (
        <div className="modal-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>게임 진행 중</h3>
            <p className="hint" style={{ marginBottom: 4 }}>
              게임이 시작되어 세팅은 수정할 수 없어요. 처음부터 다시 하려면 새
              게임을 시작하세요.
            </p>
            {mode === "signed-in" && (
              <button
                className="btn-ghost"
                style={{ width: "100%", marginTop: 12 }}
                onClick={() => {
                  setMenuOpen(false);
                  signOutUser();
                }}
              >
                로그아웃
              </button>
            )}
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
            <p className="hint">
              현재 화면의 라운드 진행 내용이 초기화됩니다. (저장된 기록은
              그대로 남아요)
            </p>
            <div className="modal-actions">
              <button
                className="btn-ghost"
                onClick={() => setConfirmReset(false)}
              >
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
    config.rules.tie && "동타 배판",
    "버디 추가정산",
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
            <span>
              {genderEmoji(p.gender)}{" "}
              <b style={{ marginLeft: 4 }}>{p.name || "?"}</b>
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
          게임 시작 🏌️
        </button>
        <button
          onClick={onEdit}
          style={{
            width: "100%",
            marginTop: 10,
            padding: 12,
            color: "var(--ink-soft)",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          ⚙︎ 세팅 수정하기
        </button>
      </div>
    </div>
  );
}
