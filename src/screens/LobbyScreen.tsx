import { useEffect, useMemo, useRef, useState } from "react";
import { useRound } from "../round";
import { useAuth } from "../auth";
import { handicapNet } from "../betting";
import { Avatar, Icon } from "../icons";
import { won } from "../util";
import type { GameConfig, Gender, Player } from "../types";

/**
 * 이름 입력칸. 로컬 상태로 값을 관리해 한글 IME 조합 중 리렌더로 값이
 * 초기화(자모 분리/삭제)되는 문제를 방지한다. 외부 값은 편집 중이 아닐 때만 반영.
 */
function NameField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  return (
    <input
      className="input lp-name"
      value={local}
      placeholder="이름"
      onFocus={() => (focused.current = true)}
      onBlur={() => (focused.current = false)}
      onChange={(e) => {
        setLocal(e.target.value);
        onCommit(e.target.value);
      }}
    />
  );
}

export default function LobbyScreen() {
  const { bundle, myUid, isHost, updateMe, start, leave, closeRound } = useRound();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const players: Player[] = useMemo(
    () =>
      (bundle?.players ?? []).map((p) => ({
        id: p.user_uid,
        name: p.name,
        gender: p.gender,
        avgScore: p.avg_score ?? 0,
        handicap: p.handicap,
        photoUrl: p.photo_url,
      })),
    [bundle]
  );

  const hcConfig = useMemo<GameConfig | null>(() => {
    if (!bundle) return null;
    return {
      courseName: bundle.round.course_name,
      courseTee: bundle.round.course_tee,
      date: bundle.round.date,
      teeTime: bundle.round.tee_time,
      unit: bundle.round.unit,
      players,
      handicapSettle: bundle.round.handicap_settle,
      handicapOverrides: {},
      rules: bundle.round.rules,
    };
  }, [bundle, players]);

  const hcPreview = useMemo(
    () => (hcConfig ? handicapNet(hcConfig) : null),
    [hcConfig]
  );

  if (!bundle) return null;
  const round = bundle.round;
  const me = bundle.players.find((p) => p.user_uid === myUid);
  const iAmLoggedIn = !!user && !user.isAnonymous;
  const nameOf = (id: string) => players.find((p) => p.id === id)!;

  const share = async () => {
    const text = `멘탈게임 라운드 초대 코드: ${round.join_code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "멘탈게임", text });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(round.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const setGender = (g: Gender) => void updateMe({ gender: g });
  const onAvgChange = (val: string) => {
    if (val.trim() === "") {
      void updateMe({ avg_score: null });
      return;
    }
    const n = Number(val);
    if (Number.isNaN(n)) return;
    const v = Math.max(0, Math.min(200, Math.round(n)));
    void updateMe({ avg_score: v, handicap: Math.max(0, v - 72) });
  };
  const setHandicap = (h: number) =>
    void updateMe({ handicap: Math.max(0, Math.min(54, h)) });

  const doStart = async () => {
    setStarting(true);
    try {
      await start();
    } catch (e) {
      console.error(e);
      setStarting(false);
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="flag" size={18} />
          </span>
          대기실
        </div>
        <button className="icon-btn" onClick={closeRound}>
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="sheet with-actionbar">
        <div className="code-card">
          <div className="cc-label">초대 코드</div>
          <div className="cc-code">{round.join_code}</div>
          <button className="btn-line" onClick={share}>
            <Icon name="share" size={15} className="inline-ic" />
            {copied ? "복사됨!" : "코드 공유하기"}
          </button>
          <div className="cc-course">
            {round.course_name || "이름 없는 라운드"}
            {round.course_tee ? ` · ${round.course_tee}` : ""}
          </div>
          <div className="cc-meta">
            {round.date} · {round.tee_time} · {round.hole_count}홀 · 타당{" "}
            {round.unit.toLocaleString()}원
          </div>
        </div>

        <div className="section-title">참여자 {bundle.players.length}명</div>
        {bundle.players.map((p) => {
          const mine = p.user_uid === myUid;
          const canEditGender = mine && !iAmLoggedIn;
          return (
            <div className={`card lobby-player ${mine ? "mine" : ""}`} key={p.id}>
              <div className="lp-head">
                <Avatar photoUrl={p.photo_url} gender={p.gender} size={34} />
                {mine ? (
                  <NameField
                    value={p.name}
                    onCommit={(v) => updateMe({ name: v })}
                  />
                ) : (
                  <span className="lp-name-static">{p.name || "이름 미정"}</span>
                )}
                {round.host_uid === p.user_uid && <span className="host-tag">방장</span>}
                {mine && <span className="me-tag">나</span>}
                {!p.photo_url && p.is_guest && !mine && (
                  <span className="guest-tag">게스트</span>
                )}
              </div>

              {mine ? (
                <>
                  {canEditGender ? (
                    <div className="segmented sm" style={{ marginTop: 10 }}>
                      <button
                        className={p.gender === "male" ? "active" : ""}
                        onClick={() => setGender("male")}
                      >
                        <Icon name="male" size={15} className="inline-ic" /> 남성
                      </button>
                      <button
                        className={p.gender === "female" ? "active" : ""}
                        onClick={() => setGender("female")}
                      >
                        <Icon name="female" size={15} className="inline-ic" /> 여성
                      </button>
                    </div>
                  ) : (
                    <p className="hint" style={{ marginTop: 8 }}>
                      프로필 사진은 로그인 계정을 사용하고, 이름은 수정할 수 있어요.
                    </p>
                  )}
                  <div className="row2" style={{ marginTop: 10 }}>
                    <div className="stepper-field">
                      <label>평균 타수</label>
                      <input
                        className="input avg-input"
                        type="number"
                        inputMode="numeric"
                        placeholder="예: 90"
                        value={p.avg_score ?? ""}
                        onChange={(e) => onAvgChange(e.target.value)}
                      />
                    </div>
                    <div className="stepper-field">
                      <label>핸디캡</label>
                      <div className="stepper">
                        <button onClick={() => setHandicap(p.handicap - 1)}>−</button>
                        <span>{p.handicap}</span>
                        <button onClick={() => setHandicap(p.handicap + 1)}>＋</button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="lp-stats">
                  {p.avg_score != null ? `평균 ${p.avg_score}타 · ` : ""}핸디 {p.handicap}
                </div>
              )}
            </div>
          );
        })}

        {!me && (
          <div className="card">
            <div className="empty-note">참여 정보를 불러오는 중…</div>
          </div>
        )}

        <div className="section-title">
          핸디캡 정산 미리보기 {round.handicap_settle === "pre" ? "(사전)" : "(사후)"}
        </div>
        <p className="hint" style={{ margin: "0 2px 10px" }}>
          각자 핸디캡을 조정하면 아래 정산이 실시간으로 갱신됩니다. 핸디가 낮은(잘 치는)
          사람이 주는 쪽입니다.
        </p>
        {!hcPreview || hcPreview.transfers.length === 0 ? (
          <div className="card">
            <div className="empty-note">주고받을 핸디 정산이 없습니다.</div>
          </div>
        ) : (
          hcPreview.transfers.map((t, i) => {
            const from = nameOf(t.fromId);
            const to = nameOf(t.toId);
            return (
              <div className="transfer" key={i}>
                <span className="from">
                  <Avatar photoUrl={from.photoUrl} gender={from.gender} size={22} />
                  {from.name || "?"}
                </span>
                <span className="arrow">
                  <Icon name="chevronRight" size={16} />
                </span>
                <span className="to">
                  <Avatar photoUrl={to.photoUrl} gender={to.gender} size={22} />
                  {to.name || "?"}
                </span>
                <span className="amt">{won(t.amount)}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="actionbar">
        {isHost ? (
          <button
            className="btn-primary"
            disabled={bundle.players.length < 2 || starting}
            onClick={doStart}
          >
            {starting
              ? "시작 중…"
              : bundle.players.length < 2
              ? "참여자를 기다리는 중…"
              : "게임 시작"}
          </button>
        ) : (
          <button className="btn-line wide" disabled>
            방장이 시작하기를 기다리는 중…
          </button>
        )}
        <button className="btn-ghost" onClick={() => void leave()}>
          {isHost ? "라운드 삭제" : "나가기"}
        </button>
      </div>
    </div>
  );
}
