import { useEffect, useMemo, useRef, useState } from "react";
import { useRound } from "../round";
import { inviteLink } from "../invite";
import { useAuth } from "../auth";
import { handicapNet } from "../betting";
import { Avatar, Icon } from "../icons";
import TopBar, { BackButton } from "./TopBar";
import { LogoHead } from "./PaneHead";
import { adjLabel, hcLabel, PAYMENT_LABEL, settleNote, TEE_BOXES, teeLabel, won } from "../util";
import AccountField from "./AccountField";
import { StrokeAdjField } from "./RoundFields";
import { caddieSummary } from "../caddie";
import { rankPrizeBalanced, rankRules, rankSummary } from "../rankGame";
import RoundSettingsSheet from "./RoundSettingsSheet";
import type { RoundPlayerRow, TeeBox } from "../types";
import { playerRating } from "../model";
import { ratingFor, teeSex } from "../kga";
import { BogeyExpect, DifficultyChip } from "./CourseDifficulty";

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

/** embedded: 펼친 iPhone Duo 라운드 탭 왼쪽 칸 안에 (위 바 대신 로고 머리, 아래 버튼은 칸 아래에) */
export default function LobbyScreen({ embedded = false }: { embedded?: boolean }) {
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
    kickPlayer,
    addOfflinePlayer,
    updateOffline,
  } = useRound();
  const { saveBankAccount } = useAuth();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  /** 시작·삭제·나가기·내보내기가 통신 문제로 안 됐을 때 안내 */
  const [actionErr, setActionErr] = useState<string | null>(null);
  /** 방장: 라운드 설정 수정 시트 (금액·홀 수·게임 방식·지불·배판) */
  const [editing, setEditing] = useState(false);

  const hcPreview = useMemo(
    () => (session ? handicapNet(session.config) : null),
    [session]
  );

  if (!bundle || !session) return null;
  const round = bundle.round;
  const { players, handicapMode: hm, payment: pay, baseUid, gameMode } = session.config;
  // 기록 모드: 내기가 없어 핸디캡·계좌가 필요 없고 혼자서도 시작할 수 있다
  const isRecord = gameMode === "record";
  const handicapMode = isRecord ? null : hm;
  const payment = isRecord ? null : pay;
  const minPlayers = isRecord ? 1 : 2;
  // 캐디피·등수 내기: 핸디 금액을 주고받지 않는다
  const isSide = gameMode === "caddie" || gameMode === "rank";
  const rank = gameMode === "rank" ? rankRules(session.config) : null;
  const needBase = handicapMode === "stroke" && !baseUid;
  const setBase = (uid: string) =>
    void updateRound({ rules: { ...round.rules, baseUid: uid } });
  const isAdjust = handicapMode === "adjust";
  // 초대 코드 카드의 코스 난이도: 내가 칠 티의 레이팅 (레드 티면 여성 레이팅, KGA 목록에서 고른 골프장일 때만)
  const meRow = bundle.players.find((p) => p.user_uid === myUid);
  const myTee = meRow?.tee ?? undefined;
  const myRating = ratingFor(
    playerRating(round.rules.rating, round.rules.teeRatings, myTee),
    teeSex(myTee || round.course_tee)
  );
  const adjOf = (uid: string) => round.rules.strokeAdj?.[uid] ?? 0;
  const setAdj = (uid: string, v: number) =>
    void updateRound({
      rules: { ...round.rules, strokeAdj: { ...(round.rules.strokeAdj ?? {}), [uid]: v } },
    });
  const me = bundle.players.find((p) => p.user_uid === myUid);
  const nameOf = (id: string) => players.find((p) => p.id === id)!;

  const share = async () => {
    // 링크를 누르면 로그인 뒤 바로 이 라운드에 참여된다 (앱 안에서 코드를 입력해도 된다)
    const link = inviteLink(round.join_code);
    const text =
      `멘탈게임 라운드에 초대해요 (${round.course_name || "골프"})\n` +
      `링크를 누르면 앱 설치 없이 바로 참여할 수 있어요. 아이폰에 앱이 있으면 앱에서 열려요.\n` +
      `초대 코드: ${round.join_code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "멘탈게임", text, url: link });
        return;
      }
    } catch (e) {
      // 공유 창에서 취소했으면 그대로 끝
      if ((e as { name?: string } | null)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  /**
   * 참여자 정보 고치기: 나는 내 참가자 행을, 방장은 폰 없는 동반자 행을 고친다
   * (폰 없는 동반자는 스스로 입력할 수 없어서 방장이 대신 정한다)
   */
  const patchPlayer = (uid: string, patch: Parameters<typeof updateMe>[0]) =>
    uid === myUid ? void updateMe(patch) : void updateOffline(uid, patch);
  // 사람별 티 박스 (남녀 혼성): 라운드 티와 같으면 비워 둔다. 티 칸이 없는 DB(lobby.sql 실행 전)는 고르지 않는다
  const roundTee = bundle.round.course_tee as TeeBox | "";
  const hasTee = (p: RoundPlayerRow) => "tee" in p;
  const teeOf = (p: RoundPlayerRow) => p.tee ?? roundTee;
  const setTee = (p: RoundPlayerRow, t: TeeBox) => patchPlayer(p.user_uid, { tee: t === roundTee ? null : t });
  const onAvgChange = (uid: string, val: string) => {
    if (val.trim() === "") {
      patchPlayer(uid, { avg_score: null });
      return;
    }
    const n = Number(val);
    if (Number.isNaN(n)) return;
    const v = Math.max(0, Math.min(200, Math.round(n)));
    patchPlayer(uid, { avg_score: v, handicap: Math.max(0, v - 72) });
  };
  const setHandicap = (uid: string, h: number) =>
    patchPlayer(uid, { handicap: Math.max(0, Math.min(54, h)) });

  /** 방장: 참여자 내보내기 */
  const doKick = async (uid: string, name: string) => {
    if (!window.confirm(`${name || "이 참여자"} 님을 내보낼까요?\n다시 들어오려면 코드가 필요해요.`)) return;
    setActionErr(null);
    try {
      await kickPlayer(uid);
    } catch (e) {
      console.error(e);
      setActionErr("내보내지 못했어요. 연결을 확인하고 다시 눌러 주세요.");
    }
  };
  /** 방장: 폰 없는 동반자 넣기 */
  const [offlineName, setOfflineName] = useState("");
  const [addingOffline, setAddingOffline] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const doAddOffline = async () => {
    const name = offlineName.trim();
    if (!name || addingOffline) return;
    setAddingOffline(true);
    setActionErr(null);
    try {
      await addOfflinePlayer(name);
      setOfflineName("");
      setOfflineOpen(false);
    } catch (e) {
      console.error(e);
      setActionErr("동반자를 넣지 못했어요. 연결을 확인하고 다시 눌러 주세요.");
    } finally {
      setAddingOffline(false);
    }
  };

  const doStart = async () => {
    setStarting(true);
    setActionErr(null);
    try {
      await start();
    } catch (e) {
      console.error(e);
      setActionErr("게임을 시작하지 못했어요. 연결을 확인하고 다시 눌러 주세요.");
      setStarting(false);
    }
  };
  const doLeave = async () => {
    setActionErr(null);
    try {
      await leave();
    } catch (e) {
      console.error(e);
      setActionErr(
        isHost
          ? "라운드를 삭제하지 못했어요. 연결을 확인하고 다시 눌러 주세요."
          : "라운드에서 나가지 못했어요. 연결을 확인하고 다시 눌러 주세요."
      );
    }
  };

  return (
    <div className={embedded ? "pane-screen" : "app"}>
      {embedded ? (
        <LogoHead onBack={() => closeRound()} />
      ) : (
        <TopBar left={<BackButton label="홈으로" onClick={() => closeRound()} />} />
      )}

      <div className="sheet with-actionbar">
        <h2 className="page-title">대기실</h2>
        <div className="code-card">
          <div className="cc-label">초대 코드</div>
          <div className="cc-code">{round.join_code}</div>
          <div className="cc-actions">
            <button className="btn-line" onClick={share}>
              <Icon name="share" size={15} className="inline-ic" />
              {copied ? "복사됨!" : "코드 공유하기"}
            </button>
            {/* 시작 전에 금액·홀 수·규칙이 틀렸으면 다시 만들지 않고 고친다 */}
            {isHost && !isRecord && session && (
              <button className="btn-line" onClick={() => setEditing(true)}>
                설정 수정
              </button>
            )}
          </div>
          <div className="cc-course">{round.course_name || "이름 없는 라운드"}</div>
          {/* 날짜·시간·홀 (티는 사람마다 달라서 뺀다) / 내 티 기준 코스 난이도 / 내기 방식 */}
          <div className="cc-meta">
            {[round.date, round.tee_time, `${round.hole_count}홀`].filter(Boolean).join(" · ")}
          </div>
          {myRating && (
            <div className="cc-meta cc-diff">
              <DifficultyChip slope={myRating.slope} />
              <BogeyExpect cr={myRating.cr} slope={myRating.slope} par={myRating.par} />
            </div>
          )}
          <div className="cc-meta">
            {isRecord ? (
              "기록 모드 (내기 없음)"
            ) : gameMode === "caddie" ? (
              caddieSummary(round.rules.caddie?.fee ?? 0, round.hole_count)
            ) : rank ? (
              <>
                {rankSummary(rank, hm)}
                {rank.prize === "exchange" && ` · ${PAYMENT_LABEL[pay]}`}
              </>
            ) : (
              <>
                {gameMode === "skins" ? "스킨스 · 스킨 1개 " : "타당 "}
                {round.unit.toLocaleString()}원 · {PAYMENT_LABEL[pay]}
              </>
            )}
          </div>
        </div>

        <div className="section-title">
          참여자 {bundle.players.length}
          {!isRecord && round.rules.playerCount ? `/${round.rules.playerCount}` : ""}명
        </div>
        {/* 등수 내기 주고받는 돈: 지금 인원으로 합이 0원이어야 송금을 계산한다 */}
        {rank && !rankPrizeBalanced(rank, bundle.players.length) && (
          <div className="card base-pick missing">
            <div className="bp-title">등수 금액 합이 0원이 아니에요</div>
            <p className="hint" style={{ marginTop: 6 }}>
              {bundle.players.length}명 기준으로 받는 돈과 내는 돈의 합이 0원이어야 송금을 계산해요.
              {isHost ? " 설정 수정에서 고쳐 주세요." : " 방장이 설정에서 고칠 수 있어요."}
            </p>
          </div>
        )}
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
                    : "나머지는 최저핸디 인원보다 몇 타를 더 받을지 각자 골라요."}
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
          const offline = !!p.offline_player;
          // 내 카드, 또는 방장이 대신 정하는 폰 없는 동반자 카드
          const editable = mine || (isHost && offline);
          return (
            <div className={`card lobby-player ${mine ? "mine" : ""}`} key={p.id}>
              <div className="lp-head">
                <Avatar photoUrl={p.photo_url} size={34} />
                {editable ? (
                  <NameField value={p.name} onCommit={(v) => patchPlayer(p.user_uid, { name: v })} />
                ) : (
                  <span className="lp-name-static">{p.name || "이름 미정"}</span>
                )}
                {round.host_uid === p.user_uid && <span className="host-tag">방장</span>}
                {baseUid === p.user_uid && <span className="base-tag">최저핸디</span>}
                {mine && <span className="me-tag">나</span>}
                {offline && <span className="guest-tag">폰 없음</span>}
                {!offline && !p.photo_url && p.is_guest && !mine && (
                  <span className="guest-tag">게스트</span>
                )}
                {/* 방장: 잘못 들어온 사람·폰 없는 동반자 내보내기 */}
                {isHost && !mine && (
                  <button
                    className="lp-kick"
                    aria-label={`${p.name || "참여자"} 내보내기`}
                    onClick={() => void doKick(p.user_uid, p.name)}
                  >
                    내보내기
                  </button>
                )}
              </div>

              {editable ? (
                <>
                  {offline && (
                    <p className="hint" style={{ marginTop: 8 }}>
                      폰이 없는 동반자예요. 정보는 방장이 정하고, 스코어는 다른 사람이 대신 입력해요.
                    </p>
                  )}
                  {/* 티 박스: 비워 두면 라운드 티. 레드 티면 코스레이팅·보정타수를 여성 레이팅으로 */}
                  {hasTee(p) && (
                    <div className="lp-tee">
                      <span className="lp-tee-label">티 박스</span>
                      <div className="segmented sm tee-seg">
                        {TEE_BOXES.map(([t, label]) => (
                          <button
                            key={t}
                            className={teeOf(p) === t ? `active ${t}` : ""}
                            onClick={() => setTee(p, t)}
                          >
                            <span className={`tee-dot ${t}`} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {isAdjust || isRecord ? null : handicapMode === "avg" ? (
                    <div className="row2" style={{ marginTop: 10 }}>
                      <div className="stepper-field">
                        <label>평균 타수</label>
                        <input
                          className="input avg-input"
                          type="number"
                          inputMode="numeric"
                          placeholder="예: 90"
                          value={p.avg_score ?? ""}
                          onChange={(e) => onAvgChange(p.user_uid, e.target.value)}
                        />
                      </div>
                      <div className="stepper-field">
                        <label>핸디캡</label>
                        <div className="stepper">
                          <button onClick={() => setHandicap(p.user_uid, p.handicap - 1)}>−</button>
                          <span>{p.handicap}</span>
                          <button onClick={() => setHandicap(p.user_uid, p.handicap + 1)}>＋</button>
                        </div>
                      </div>
                    </div>
                  ) : baseUid === p.user_uid ? (
                    <p className="hint" style={{ marginTop: 8 }}>
                      {mine
                        ? "최저핸디 인원이에요. 다른 사람들이 나보다 몇 타를 더 받을지 정해요."
                        : "최저핸디 인원이에요."}
                    </p>
                  ) : (
                    <div className="stroke-hc">
                      <label>최저핸디 대비 받을 타수</label>
                      <div className="stroke-row">
                        {STROKE_PRESETS.map((v) => (
                          <button
                            key={v}
                            className={`chip ${p.handicap === v ? "active" : ""}`}
                            onClick={() => setHandicap(p.user_uid, v)}
                          >
                            +{v}타
                          </button>
                        ))}
                        <div className="stepper">
                          <button onClick={() => setHandicap(p.user_uid, p.handicap - 1)}>−</button>
                          <span>{hcLabel(p.handicap)}</span>
                          <button onClick={() => setHandicap(p.user_uid, p.handicap + 1)}>＋</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {mine && payment === "transfer" && (
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
              ) : isRecord ? null : (
                <div className="lp-stats">
                  {isAdjust
                    ? `파4·파5 ${adjLabel(adjOf(p.user_uid))}`
                    : handicapMode === "avg"
                    ? `${p.avg_score != null ? `평균 ${p.avg_score}타 · ` : ""}핸디 ${p.handicap}`
                    : baseUid === p.user_uid
                    ? "최저핸디 인원"
                    : `최저핸디 대비 ${hcLabel(p.handicap)}타`}
                  {/* 라운드 티와 다른 티를 친다 */}
                  {p.tee && p.tee !== roundTee && ` · ${teeLabel(p.tee)}`}
                  {payment === "transfer" && !offline && (
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

        {/* 방장: 폰이 없는(앱을 못 쓰는) 동반자를 이름만으로 넣기 */}
        {isHost && !isRecord && (
          offlineOpen ? (
            <div className="card offline-add">
              <label>폰 없는 동반자 이름</label>
              <div className="join-row">
                <input
                  className="input"
                  placeholder="예) 김철수"
                  value={offlineName}
                  enterKeyHint="done"
                  onChange={(e) => setOfflineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void doAddOffline();
                  }}
                />
                <button
                  className="btn-primary sm"
                  disabled={!offlineName.trim() || addingOffline}
                  onClick={() => void doAddOffline()}
                >
                  {addingOffline ? "…" : "추가"}
                </button>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                앱 없이도 함께 내기를 할 수 있어요. 스코어는 다른 사람이 대신 입력해요.
              </p>
              <button className="offline-cancel" onClick={() => setOfflineOpen(false)}>
                취소
              </button>
            </div>
          ) : (
            <button className="btn-line wide add-offline-btn" onClick={() => setOfflineOpen(true)}>
              ＋ 폰 없는 동반자 추가
            </button>
          )
        )}

        {!me && (
          <div className="card">
            <div className="empty-note">참여 정보를 불러오는 중…</div>
          </div>
        )}

        {!isAdjust && !isRecord && !isSide && (
          <>
          <div className="section-title">
            핸디캡 정산 미리보기 {round.handicap_settle === "pre" ? "(사전)" : "(사후)"}
          </div>
          <p className="hint" style={{ margin: "0 2px 10px" }}>
            <b>{settleNote(round.handicap_settle)}</b> 각자 핸디캡을 조정하면 아래 정산이
            실시간으로 바뀌어요. 핸디가 낮은(잘 치는) 사람이 주는 쪽이에요.
          </p>
          {!hcPreview || hcPreview.transfers.length === 0 ? (
            <div className="card">
              <div className="empty-note">주고받을 핸디 정산이 없어요.</div>
            </div>
          ) : (
            hcPreview.transfers.map((t, i) => {
              const from = nameOf(t.fromId);
              const to = nameOf(t.toId);
              return (
                <div className="transfer" key={i}>
                  <span className="from">
                    <Avatar photoUrl={from.photoUrl} size={22} />
                    {from.name || "?"}
                  </span>
                  <span className="arrow">
                    <Icon name="chevronRight" size={16} />
                  </span>
                  <span className="to">
                    <Avatar photoUrl={to.photoUrl} size={22} />
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
        {actionErr && <div className="action-err">{actionErr}</div>}
        {isHost ? (
          <button
            className="btn-primary"
            disabled={bundle.players.length < minPlayers || needBase || starting}
            onClick={doStart}
          >
            {starting
              ? "시작 중…"
              : bundle.players.length < minPlayers
              ? "참여자를 기다리는 중…"
              : needBase
              ? "최저핸디 인원을 정해 주세요"
              : isRecord
              ? "기록 시작"
              : "게임 시작"}
          </button>
        ) : (
          <button className="btn-line wide" disabled>
            방장이 시작하기를 기다리는 중…
          </button>
        )}
        <button
          className={`btn-ghost ${isHost ? "del" : ""}`}
          onClick={() => {
            const msg = isHost
              ? "라운드를 삭제할까요?\n참여한 사람 모두 라운드에서 나가요."
              : "이 라운드에서 나갈까요?\n다시 들어오려면 코드가 필요해요.";
            if (window.confirm(msg)) void doLeave();
          }}
        >
          {isHost ? "라운드 삭제" : "나가기"}
        </button>
      </div>
      {editing && session && <RoundSettingsSheet session={session} onClose={() => setEditing(false)} />}
    </div>
  );
}
