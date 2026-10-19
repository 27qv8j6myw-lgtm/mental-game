import { useEffect, useState } from "react";
import { useAuth, type OAuthProvider } from "../auth";
import { useRound } from "../round";
import { joinRoundByCode, leaveOrDeleteRound, listMyRounds } from "../rounds";
import { Avatar, GoogleLogo, Icon, KakaoLogo } from "../icons";
import type { RoundRow } from "../types";

const STATUS_LABEL: Record<string, string> = {
  lobby: "대기중",
  playing: "진행중",
  done: "완료",
};

const LINKABLE: { id: OAuthProvider; label: string }[] = [
  { id: "kakao", label: "카카오" },
  { id: "google", label: "Google" },
];

export default function RoundsHomeScreen({ onCreate }: { onCreate: () => void }) {
  const { user, signOutUser, linkProvider, unlinkProvider, error, clearError } =
    useAuth();
  const { openRound } = useRound();
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkBusy, setLinkBusy] = useState<OAuthProvider | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRounds(await listMyRounds());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
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

  const removeRound = async (r: RoundRow) => {
    const iAmHost = r.host_uid === user?.uid;
    const msg = iAmHost
      ? "이 라운드를 삭제할까요? 참여자 전원의 기록이 사라집니다."
      : "이 라운드를 목록에서 제거할까요? (참여 취소)";
    if (!window.confirm(msg)) return;
    try {
      await leaveOrDeleteRound(r.id, user!.uid, iAmHost);
      setRounds((rs) => rs.filter((x) => x.id !== r.id));
    } catch (e) {
      console.error(e);
      alert("삭제에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const join = async () => {
    if (code.length !== 4 || joining) return;
    setJoining(true);
    setErr(null);
    try {
      const firstName = (user?.displayName ?? "").split(" ")[0] || "나";
      const round = await joinRoundByCode(code, {
        name: firstName,
        gender: "male",
        avgScore: null,
        handicap: 0,
      });
      openRound(round.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "참여에 실패했어요.");
      setJoining(false);
    }
  };

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
              maxLength={4}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
            <button
              className="btn-primary sm"
              disabled={code.length !== 4 || joining}
              onClick={join}
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

        <div className="section-title">내 라운드</div>
        {loading ? (
          <div className="card">
            <div className="empty-note">불러오는 중…</div>
          </div>
        ) : rounds.length === 0 ? (
          <div className="card">
            <div className="empty-note">아직 참여한 라운드가 없어요.</div>
          </div>
        ) : (
          rounds.map((r) => (
            <div key={r.id} className="round-item">
              <button className="ri-open" onClick={() => openRound(r.id)}>
                <div className="ri-name">{r.course_name || "이름 없는 라운드"}</div>
                <div className="ri-sub">
                  {r.date} · {r.tee_time}
                  {r.host_uid === user?.uid ? " · 방장" : ""}
                </div>
              </button>
              <div className="ri-right">
                <span className={`badge st-${r.status}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
                <button
                  className="ri-del"
                  aria-label="라운드 삭제"
                  onClick={() => void removeRound(r)}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
