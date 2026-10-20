import { useEffect, useMemo, useRef, useState } from "react";
import { useRound } from "../round";
import { useAuth } from "../auth";
import { handicapNet } from "../betting";
import { Avatar, Icon } from "../icons";
import { adjLabel, hcLabel, PAYMENT_LABEL, settleNote, won } from "../util";
import AccountField from "./AccountField";
import { StrokeAdjField } from "./RoundFields";
import type { Gender } from "../types";

const STROKE_PRESETS = [5, 10];

/**
 * 이름 입력칸. 입력 중에는 로컬 상태만 바꾸고, 포커스를 잃거나 저장/엔터를 누를 때
 * 한 번만 저장한다. 글자마다 저장하면 요청 순서가 뒤섞여 마지막 글자가 사라질 수 있다.
 */
function NameField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);

  // 한글 조합 중인 마지막 글자까지 포함하도록 DOM 값을 읽는다
  const commit = () => {
    const name = (inputRef.current?.value ?? local).trim();
    if (name && name !== value) onCommit(name);
  };

  return (
    <>
      <input
        ref={inputRef}
        className="input lp-name"
        value={local}
        placeholder="이름"
        enterKeyHint="done"
        onFocus={() => setEditing(true)}
        onBlur={() => {
          commit();
          setEditing(false);
        }}
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
        }}
      />
      {editing && (
        <button
          className="btn-primary sm name-save"
          onClick={() => {
            commit();
            inputRef.current?.blur();
          }}
        >
          저장
        </button>
      )}
    </>
  );
}

export default function LobbyScreen() {
  const {
    bundle,
    session,
    myUid,
    isHost,
    updateMe,
    updateRound,
    start,
    leave,
    closeRound,
  } = useRound();
  const { user, saveBankAccount } = useAuth();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const hcPreview = useMemo(
    () => (session ? handicapNet(session.config) : null),
    [session]
  );

  if (!bundle || !session) return null;
  const round = bundle.round;
  const { players, handicapMode, payment, baseUid, gameMode } = session.config;
  const needBase = handicapMode === "stroke" && !baseUid;
  const setBase = (uid: string) =>
    void updateRound({ rules: { ...round.rules, baseUid: uid } });
  const isAdjust = handicapMode === "adjust";
  const adjOf = (uid: string) => round.rules.strokeAdj?.[uid] ?? 0;
  const setAdj = (uid: string, v: number) =>
    void updateRound({
      rules: { ...round.rules, strokeAdj: { ...(round.rules.strokeAdj ?? {}), [uid]: v } },
    });
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
          <div className="cc-course">{round.course_name || "이름 없는 라운드"}</div>
          <div className="cc-meta">
            {round.date} · {round.tee_time} · {round.hole_count}홀 ·{" "}
            {gameMode === "skins" ? "스킨스 · 스킨 1개 " : "타당 "}
            {round.unit.toLocaleString()}원 · {PAYMENT_LABEL[payment]}
          </div>
        </div>

        <div className="section-title">참여자 {bundle.players.length}명</div>
        {isAdjust && (
          <div className="card base-pick">
            <div className="bp-title">타수 보정</div>
            <p className="hint" style={{ marginTop: 6 }}>
              {isHost
                ? "사람마다 파4·파5 홀에서 잡아줄 타수를 골라 주세요. "
                : "방장이 사람마다 파4·파5 홀에서 잡아줄 타수를 정해요. "}
              보기 이상일 때만 빼주고 파 아래로는 내려가지 않아요. 핸디캡 금액 정산은 없어요.
            </p>
          </div>
        )}
        {handicapMode === "stroke" && (
          <div className={`card base-pick ${needBase ? "missing" : ""}`}>
            <div className="bp-title">최저핸디 인원</div>
            {isHost ? (
              <>
                <div className="chips">
                  {bundle.players.map((p) => (
                    <button
                      key={p.user_uid}
                      className={`chip ${baseUid === p.user_uid ? "active" : ""}`}
                      onClick={() => setBase(p.user_uid)}
                    >
                      {p.name || "이름 미정"}
                    </button>
                  ))}
                </div>
                <p className="hint" style={{ marginTop: 8 }}>
                  {needBase
                    ? "최저핸디 인원을 정해야 게임을 시작할 수 있어요."
                    : "나머지는 최저핸디 인원보다 몇 타를 더 받을지 각자 고릅니다."}
                </p>
              </>
            ) : (
              <p className="hint">
                {baseUid
                  ? `${nameOf(baseUid).name || "이름 미정"} 님이 최저핸디예요. 그보다 몇 타를 더 받을지 고르세요.`
                  : "방장이 최저핸디 인원을 정하면 게임을 시작할 수 있어요."}
              </p>
            )}
          </div>
        )}
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
                {baseUid === p.user_uid && <span className="base-tag">최저핸디</span>}
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
                  {isAdjust ? null : handicapMode === "avg" ? (
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
                  ) : baseUid === p.user_uid ? (
                    <p className="hint" style={{ marginTop: 8 }}>
                      최저핸디 인원이에요. 다른 사람들이 나보다 몇 타를 더 받을지 정해요.
                    </p>
                  ) : (
                    <div className="stroke-hc">
                      <label>최저핸디 대비 받을 타수</label>
                      <div className="stroke-row">
                        {STROKE_PRESETS.map((v) => (
                          <button
                            key={v}
                            className={`chip ${p.handicap === v ? "active" : ""}`}
                            onClick={() => setHandicap(v)}
                          >
                            +{v}타
                          </button>
                        ))}
                        <div className="stepper">
                          <button onClick={() => setHandicap(p.handicap - 1)}>−</button>
                          <span>{hcLabel(p.handicap)}</span>
                          <button onClick={() => setHandicap(p.handicap + 1)}>＋</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {payment === "transfer" && (
                    <div className="lp-account">
                      <AccountField
                        label="받을 계좌"
                        bank={p.bank_name}
                        account={p.bank_account}
                        onSave={async (bank, account) => {
                          await updateMe({ bank_name: bank, bank_account: account });
                          await saveBankAccount(bank, account);
                        }}
                      />
                      <p className="hint" style={{ marginTop: 6 }}>
                        정산 때 보내는 사람이 바로 복사할 수 있어요. 이 라운드 참여자에게만
                        보이고, 다음 라운드에는 자동으로 채워져요.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="lp-stats">
                  {isAdjust
                    ? `파4·파5 ${adjLabel(adjOf(p.user_uid))}`
                    : handicapMode === "avg"
                    ? `${p.avg_score != null ? `평균 ${p.avg_score}타 · ` : ""}핸디 ${p.handicap}`
                    : baseUid === p.user_uid
                    ? "최저핸디 인원"
                    : `최저핸디 대비 ${hcLabel(p.handicap)}타`}
                  {payment === "transfer" && (
                    <span className={`acct-state ${p.bank_account ? "ok" : ""}`}>
                      {p.bank_account ? "계좌 입력됨" : "계좌 미입력"}
                    </span>
                  )}
                </div>
              )}

              {isAdjust && (mine || isHost) && (
                <div className="lp-adj">
                  <label>파4·파5 홀당 잡아줄 타수</label>
                  {isHost ? (
                    <StrokeAdjField
                      label={`${p.name} 타수 보정`}
                      value={adjOf(p.user_uid)}
                      onChange={(v) => setAdj(p.user_uid, v)}
                    />
                  ) : (
                    <b>{adjLabel(adjOf(p.user_uid))}</b>
                  )}
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

        {!isAdjust && (
          <>
          <div className="section-title">
            핸디캡 정산 미리보기 {round.handicap_settle === "pre" ? "(사전)" : "(사후)"}
          </div>
          <p className="hint" style={{ margin: "0 2px 10px" }}>
            <b>{settleNote(round.handicap_settle)}</b> 각자 핸디캡을 조정하면 아래 정산이
            실시간으로 갱신됩니다. 핸디가 낮은(잘 치는) 사람이 주는 쪽입니다.
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
          </>
        )}
      </div>

      <div className="actionbar">
        {isHost ? (
          <button
            className="btn-primary"
            disabled={bundle.players.length < 2 || needBase || starting}
            onClick={doStart}
          >
            {starting
              ? "시작 중…"
              : bundle.players.length < 2
              ? "참여자를 기다리는 중…"
              : needBase
              ? "최저핸디 인원을 정해 주세요"
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
