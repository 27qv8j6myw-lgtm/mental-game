import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { useApp } from "../store";
import { deleteGame, listGames, type ArchivedGame } from "../archive";
import { totalNet } from "../betting";
import { genderEmoji, won, wonSigned } from "../util";

export default function ArchiveScreen({ onClose }: { onClose: () => void }) {
  const { user, mode, signIn, configured } = useAuth();
  const { loadArchived } = useApp();
  const [games, setGames] = useState<ArchivedGame[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      setGames(await listGames(user.uid));
    } catch (e) {
      console.error(e);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) refresh();
  }, [user]);

  const guestOrOut = mode !== "signed-in";

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">🗂</span>
          기록
        </div>
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="sheet">
        {guestOrOut ? (
          <div className="card center-col" style={{ textAlign: "center", gap: 12 }}>
            <div style={{ fontSize: 40 }}>🔒</div>
            <div style={{ fontWeight: 900, fontSize: 17 }}>
              로그인이 필요해요
            </div>
            <p className="hint">
              내가 참여한 라운드 기록은 Google 로그인 후에만 볼 수 있어요.
            </p>
            {configured && (
              <button
                className="btn-primary"
                style={{ marginTop: 4 }}
                onClick={signIn}
              >
                Google 계정으로 로그인
              </button>
            )}
          </div>
        ) : loading || games === null ? (
          <div className="empty-note">불러오는 중…</div>
        ) : games.length === 0 ? (
          <div className="card">
            <div className="empty-note">
              아직 저장된 라운드가 없어요.
              <br />
              게임을 시작하면 자동으로 기록됩니다.
            </div>
          </div>
        ) : (
          games.map((g) => {
            const isPost = g.config.handicapSettle === "post";
            const { net } = totalNet(g.config, g.holes, isPost);
            const played = g.holes.filter((h) =>
              Object.values(h.scores).some((s) => s !== null)
            ).length;
            const winner = [...g.config.players].sort(
              (a, b) => (net[b.id] ?? 0) - (net[a.id] ?? 0)
            )[0];
            return (
              <div className="archive-item" key={g.id}>
                <div className="ai-top">
                  <span className="ai-course">
                    {g.config.courseName || "무제 라운드"}
                  </span>
                  <span className="ai-date">
                    {g.config.date} {g.config.teeTime}
                  </span>
                </div>
                <div className="ai-players">
                  {g.config.players
                    .map((p) => `${genderEmoji(p.gender)}${p.name || "?"}`)
                    .join("  ")}
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="pill green">타당 {won(g.config.unit)}</span>
                  <span className="pill teal">{played}홀</span>
                  {winner && (net[winner.id] ?? 0) > 0 && (
                    <span className="pill gold">
                      🏆 {winner.name} {wonSigned(net[winner.id] ?? 0)}
                    </span>
                  )}
                </div>
                <div className="ai-foot">
                  <button
                    className="chip"
                    onClick={() => {
                      loadArchived({
                        config: g.config,
                        holes: g.holes,
                        archiveId: g.id,
                      });
                      onClose();
                    }}
                  >
                    불러와서 보기
                  </button>
                  <span className="grow" />
                  <button
                    className="link-danger"
                    onClick={async () => {
                      if (confirm("이 기록을 삭제할까요?")) {
                        await deleteGame(g.id);
                        refresh();
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
