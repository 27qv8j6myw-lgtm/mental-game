import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminStats,
  fetchAiGrants,
  fetchGuestPlayers,
  fetchRecentRounds,
  fetchRecentUsers,
  setAiGrant,
  setUserName,
  type AdminRound,
  type AdminStats,
  type AdminUser,
  type AiGrant,
  type GuestPlayer,
} from "../admin";
import { GoogleLogo, Icon, KakaoLogo } from "../icons";
import TopBar, { BackButton } from "./TopBar";
import PaneHead, { LogoHead } from "./PaneHead";
import { useUnfolded } from "../rail";
import { GAME_MODE_LABEL } from "../util";
import type { GameMode, Gender } from "../types";
import RatioBar from "./RatioBar";
import ScorecardImportScreen from "./ScorecardImportScreen";
import NameDialog from "./NameDialog";
import GuestMoveSheet from "./GuestMoveSheet";
import { useBack } from "../back";

const STATUS_LABEL: Record<string, string> = { lobby: "대기중", playing: "진행중", done: "완료" };
const HANDICAP_LABEL: Record<string, string> = {
  avg: "평균 타수",
  stroke: "최저핸디 대비",
  adjust: "타수 보정",
};
const PAYMENT_LABEL: Record<string, string> = { cash: "현금", transfer: "계좌이체" };

/** 2026-10-20 → 10/20 */
const md = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}`;
};

/** 시각(timestamptz) → 휴대폰 로컬 날짜 10/20 */
const mdLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 방금 / 3시간 전 / 2일 전 / 10/3 */
const ago = (iso: string | null) => {
  if (!iso) return "-";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  if (min < 60 * 24 * 7) return `${Math.floor(min / 60 / 24)}일 전`;
  return mdLocal(iso);
};

const num = (n: number) => Number(n).toLocaleString("ko-KR");

/** "a · b · c" 한 줄 정보. 줄이 넘치면 항목 사이에서만 바꾼다 */
function Segs({ items }: { items: (string | false)[] }) {
  const list = items.filter((x): x is string => !!x);
  return (
    <>
      {list.map((t, i) => (
        <span key={i}>
          <span className="seg">{t}</span>
          {i < list.length - 1 ? " · " : ""}
        </span>
      ))}
    </>
  );
}

/** 막대 그래프: 마지막 막대(오늘·이번 주)를 강조하고, 몇 칸마다 날짜를 적는다 */
function BarChart({
  data,
  labelEvery,
}: {
  data: { label: string; count: number }[];
  labelEvery: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="ad-chart">
      <div className="ad-bars">
        {data.map((d, i) => (
          <div
            className={`ad-bar ${i === data.length - 1 ? "now" : ""}`}
            key={d.label}
            title={`${d.label} · ${d.count}`}
          >
            <div className="ad-bar-fill" style={{ height: `${(d.count / max) * 100}%` }}>
              {/* 숫자는 가장 높은 막대와 마지막 막대에만 (막대가 좁아 겹치지 않게) */}
              {d.count > 0 && (d.count === max || i === data.length - 1) && (
                <span className="ad-bar-n">{d.count}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="ad-axis">
        {data.map((d, i) => (
          <span key={d.label}>
            {(data.length - 1 - i) % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      <div className="ad-chart-sum">합계 {num(total)}</div>
    </div>
  );
}

const pick = (src: Record<string, number>, labels: Record<string, string>) =>
  Object.entries(labels).map(([k, label]) => ({ label, count: src[k] ?? 0 }));

/** 관리자 대시보드: 가입자·라운드 통계와 최근 라운드·가입자 목록 */
export default function AdminScreen({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [rounds, setRounds] = useState<AdminRound[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState<"daily" | "weekly">("daily");
  /** AI 분석을 허용한 사람 (null: insight.sql 을 아직 실행하지 않아 권한을 줄 수 없음) */
  const [grants, setGrants] = useState<AiGrant[] | null>([]);
  const [grantBusy, setGrantBusy] = useState<string | null>(null);
  const loadGrants = useCallback(async () => {
    setGrants(await fetchAiGrants().catch(() => null));
  }, []);
  // 게스트로 친 기록 (undefined: 불러오는 중, null: guest.sql 실행 전)
  const [guests, setGuests] = useState<GuestPlayer[] | null | undefined>(undefined);
  const [moving, setMoving] = useState<GuestPlayer | null>(null);
  const loadGuests = useCallback(async () => {
    setGuests(
      await fetchGuestPlayers().catch((e) => {
        console.error(e);
        return [];
      })
    );
  }, []);
  const toggleGrant = async (userId: string, on: boolean) => {
    setGrantBusy(userId);
    try {
      await setAiGrant(userId, on);
      await loadGrants();
    } catch (e) {
      console.error(e);
      setNotice("AI 분석 권한을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setGrantBusy(null);
    }
  };

  // 사용자 실명·성별 고치기 (고르는 중인 사람)
  const [naming, setNaming] = useState<AdminUser | null>(null);
  useBack(!!naming, () => setNaming(null));
  const saveUserName = async (name: string, gender: Gender | null) => {
    if (!naming) return false;
    try {
      // 성별은 바꿨을 때만 보낸다
      await setUserName(naming.user_id, name, gender && gender !== naming.gender ? gender : undefined);
      setUsers((us) =>
        us.map((u) =>
          u.user_id === naming.user_id ? { ...u, real_name: name.trim() || null, gender: gender ?? u.gender } : u
        )
      );
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    void loadGrants();
    void loadGuests();
    try {
      const [s, r, u] = await Promise.all([
        fetchAdminStats(),
        fetchRecentRounds(30),
        fetchRecentUsers(30),
      ]);
      setStats(s);
      setRounds(r);
      setUsers(u);
    } catch (e) {
      console.error(e);
      setErr("통계를 불러오지 못했어요. 관리자 계정인지, admin.sql 을 실행했는지 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [loadGrants, loadGuests]);

  useEffect(() => {
    void load();
  }, [load]);

  // 스코어카드 사진으로 기록 추가 (관리자만, 기기 뒤로가기로 닫힌다)
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useBack(importing, () => setImporting(false));
  const split = useUnfolded();
  if (importing)
    return (
      <ScorecardImportScreen
        onBack={() => setImporting(false)}
        onSaved={() => {
          setImporting(false);
          setNotice("사진으로 기록을 추가했어요. 기록 탭에서 볼 수 있어요.");
          window.scrollTo(0, 0);
          void load();
        }}
      />
    );

  // 펼친 iPhone Duo: 왼쪽 가입자·라운드 통계까지 · 오른쪽 최근 라운드부터
  const head = (
    <>
      <h2 className="page-title">관리자 대시보드</h2>
      {notice && <div className="sc-notice">{notice}</div>}
      <button
        className="btn-line wide sc-add"
        onClick={() => {
          setNotice(null);
          setImporting(true);
        }}
      >
        <Icon name="camera" size={18} />
        스코어카드 사진으로 기록 추가
      </button>
      {err && (
        <div className="card">
          <div className="empty-note" style={{ color: "var(--loss)" }}>
            {err}
          </div>
        </div>
      )}
      {!stats && loading && (
        <div className="card">
          <div className="empty-note">불러오는 중…</div>
        </div>
      )}
    </>
  );
  const statsTop = stats && (
    <>
      <p className="hint" style={{ margin: "0 2px 12px" }}>
        {new Date(stats.generated_at).toLocaleString("ko-KR")} 기준 · 날짜는 한국 시간
      </p>

      <div className="ad-kpis">
        <div className="ad-kpi">
          <span>전체 가입자</span>
          <b>{num(stats.users.total)}</b>
          <small>오늘 +{num(stats.users.today)}</small>
        </div>
        <div className="ad-kpi">
          <span>최근 7일 가입</span>
          <b>{num(stats.users.last7)}</b>
          <small>7일 내 로그인 {num(stats.users.active7)}</small>
        </div>
        <div className="ad-kpi">
          <span>전체 라운드</span>
          <b>{num(stats.rounds.total)}</b>
          <small>오늘 +{num(stats.rounds.today)}</small>
        </div>
        <div className="ad-kpi">
          <span>최근 7일 라운드</span>
          <b>{num(stats.rounds.last7)}</b>
          <small>참여자 {num(stats.activity.players7)}명</small>
        </div>
      </div>

      <div className="section-title">가입자</div>
      <div className="card">
        <div className="ad-sub">일별 신규 가입 (최근 30일)</div>
        <BarChart
          data={stats.users.daily.map((d) => ({ label: md(d.day), count: d.count }))}
          labelEvery={7}
        />
        <RatioBar
          title="로그인 방식"
          items={[
            { label: "구글만", count: stats.users.providers.google },
            { label: "카카오만", count: stats.users.providers.kakao },
            { label: "둘 다", count: stats.users.providers.both },
          ]}
        />
      </div>

      <div className="section-title">라운드</div>
      <div className="card">
        <div className="ad-sub-row">
          <div className="ad-sub">
            {range === "daily" ? "일별 생성 (최근 30일)" : "주별 생성 (최근 12주)"}
          </div>
          <div className="segmented sm ad-range">
            <button
              className={range === "daily" ? "active" : ""}
              onClick={() => setRange("daily")}
            >
              일별
            </button>
            <button
              className={range === "weekly" ? "active" : ""}
              onClick={() => setRange("weekly")}
            >
              주별
            </button>
          </div>
        </div>
        {range === "daily" ? (
          <BarChart
            data={stats.rounds.daily.map((d) => ({ label: md(d.day), count: d.count }))}
            labelEvery={7}
          />
        ) : (
          <BarChart
            data={stats.rounds.weekly.map((w) => ({ label: md(w.week), count: w.count }))}
            labelEvery={3}
          />
        )}
      </div>

      <div className="card">
        <div className="ad-mini">
          <div>
            <span>평균 인원</span>
            <b>{Number(stats.rounds.avg_players).toFixed(1)}명</b>
          </div>
          <div>
            <span>스코어 수정된 라운드</span>
            <b>{num(stats.activity.edited_rounds)}개</b>
          </div>
          <div>
            <span>총 수정 횟수</span>
            <b>{num(stats.activity.edits)}번</b>
          </div>
        </div>
        <RatioBar title="진행 상태" items={pick(stats.rounds.by_status, STATUS_LABEL)} />
        <RatioBar
          title="게임 방식"
          items={pick(stats.rounds.by_game, GAME_MODE_LABEL as Record<GameMode, string>)}
        />
        <RatioBar
          title="핸디캡 방식"
          items={pick(stats.rounds.by_handicap, HANDICAP_LABEL)}
        />
        <RatioBar title="지불 방법" items={pick(stats.rounds.by_payment, PAYMENT_LABEL)} />

        <div className="ad-ratio-title" style={{ marginTop: 16 }}>
          많이 쓰는 타당 금액
        </div>
        {stats.rounds.units.length === 0 ? (
          <div className="empty-note">아직 라운드가 없어요.</div>
        ) : (
          stats.rounds.units.map((u) => (
            <div className="ad-unit" key={u.unit}>
              <span className="ad-unit-l">{num(u.unit)}원</span>
              <div className="ad-unit-bar">
                <div
                  style={{
                    width: `${(u.count / Math.max(1, stats.rounds.units[0].count)) * 100}%`,
                  }}
                />
              </div>
              <span className="ad-unit-n">{num(u.count)}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
  const statsRest = stats && (
    <>
      {rounds.length === 0 ? (
        <div className="card">
          <div className="empty-note">아직 라운드가 없어요.</div>
        </div>
      ) : (
        <div className="card ad-list">
          {rounds.map((r) => (
            <div className="ad-row" key={r.id}>
              <div className="ad-row-main">
                <div className="ri-name">
                  <span className="ri-title">{r.course_name || "이름 없는 라운드"}</span>
                  <span className={`mode-tag ${r.game_mode}`}>
                    {GAME_MODE_LABEL[r.game_mode as GameMode] ?? r.game_mode}
                  </span>
                </div>
                <div className="ri-sub">
                  <Segs
                    items={[
                      `${r.date ? md(r.date) : "-"} ${r.tee_time}`,
                      `방장 ${r.host_name || "?"}`,
                      `${r.player_count}명`,
                      `${r.hole_count}홀`,
                      r.game_mode !== "record" && r.game_mode !== "rank" && `${num(r.unit)}원`,
                      r.edit_count > 0 && `수정 ${r.edit_count}번`,
                    ]}
                  />
                </div>
              </div>
              <span className={`badge st-${r.status}`}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* AI 분석 권한: 관리자는 늘 쓸 수 있고, 여기서 허용한 사람은 내 기록에서 쓸 수 있다 */}
      <div className="section-title">AI 분석 권한 {grants ? `${grants.length}명` : ""}</div>
      <div className="card ad-list">
        {grants === null ? (
          <div className="empty-note">Supabase 에서 insight.sql 을 실행하면 권한을 줄 수 있어요.</div>
        ) : grants.length === 0 ? (
          <div className="empty-note">아직 허용한 사람이 없어요. 아래 최근 가입자에서 'AI 허용'을 눌러 주세요.</div>
        ) : (
          grants.map((g) => (
            <div className="ad-row" key={g.user_id}>
              <div className="ad-row-main">
                <div className="ri-name">
                  <span className="ri-title">{g.name || "이름 없음"}</span>
                </div>
                <div className="ri-sub">
                  <Segs items={[g.email_masked ?? "이메일 없음", `허용 ${mdLocal(g.created_at)}`]} />
                </div>
              </div>
              <button
                className="ad-ai on"
                disabled={grantBusy === g.user_id}
                onClick={() => void toggleGrant(g.user_id, false)}
              >
                해제
              </button>
            </div>
          ))
        )}
      </div>
      <p className="hint" style={{ margin: "6px 2px 0" }}>
        관리자는 늘 쓸 수 있어요. 허용한 사람은 자기 기록에서만 AI 분석을 만들고 볼 수 있어요.
      </p>

      {/* 예전 '로그인 없이 참여하기'(게스트)로 친 라운드: 진짜 계정으로 옮긴다 (있을 때만) */}
      {guests !== undefined && (guests === null || guests.length > 0) && (
        <>
          <div className="section-title">게스트로 친 기록 {guests ? `${guests.length}명` : ""}</div>
          <div className="card ad-list">
            {guests === null ? (
              <div className="empty-note">Supabase 에서 guest.sql 을 실행하면 보여요.</div>
            ) : (
              guests.map((g) => (
                <div className="ad-row" key={g.guest_uid}>
                  <div className="ad-row-main">
                    <div className="ri-name">
                      <span className="ri-title">{g.names.join(", ") || "이름 없음"}</span>
                      <span className="guest-tag">게스트</span>
                    </div>
                    <div className="ri-sub gm-rounds">
                      {g.rounds.map((r) => (
                        <span key={r.round_id}>
                          {md(r.date)} {r.course || "이름 없는 라운드"} · {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ad-row-side">
                    <span className="ad-count">라운드 {g.rounds.length}</span>
                    <button className="ad-ai" onClick={() => setMoving(g)}>
                      계정으로 옮기기
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="hint" style={{ margin: "6px 2px 0" }}>
            예전 '로그인 없이 참여하기'로 친 라운드예요. 계정으로 옮기면 랭킹·전적·기록에 그 사람 라운드로 들어가요.
            게스트가 그 폰에서 로그인해도 저절로 옮겨져요.
          </p>
        </>
      )}

      <div className="section-title">최근 가입자 {users.length}명</div>
      {users.length === 0 ? (
        <div className="card">
          <div className="empty-note">아직 가입자가 없어요.</div>
        </div>
      ) : (
        <div className="card ad-list">
          {users.map((u) => (
            <div className="ad-row" key={u.user_id}>
              <div className="ad-row-main">
                <div className="ri-name">
                  <span className="ri-title">{u.name || "이름 없음"}</span>
                  {/* 앱에서 정한 이름(실명). 누르면 관리자가 고친다 */}
                  <button
                    className={`ad-real ${u.real_name ? "" : "none"}`}
                    onClick={() => setNaming(u)}
                    aria-label={`${u.name || "이름 없음"} 실명·성별 고치기`}
                  >
                    {u.gender && <Icon name={u.gender} size={11} />}
                    {u.real_name ?? "실명 없음"}
                    <Icon name="edit" size={11} />
                  </button>
                  <span className="ad-prov">
                    {u.providers.includes("kakao") && (
                      <span className="ml-ic kakao">
                        <KakaoLogo size={11} />
                      </span>
                    )}
                    {u.providers.includes("google") && (
                      <span className="ml-ic google">
                        <GoogleLogo size={11} />
                      </span>
                    )}
                  </span>
                </div>
                <div className="ri-sub">
                  <Segs
                    items={[
                      u.email_masked ?? "이메일 없음",
                      `가입 ${mdLocal(u.created_at)}`,
                      `최근 로그인 ${ago(u.last_sign_in_at)}`,
                    ]}
                  />
                </div>
              </div>
              <div className="ad-row-side">
                <span className="ad-count">
                  {u.avg_score != null && <b className="ad-avg">평균 {Number(u.avg_score).toFixed(1)}</b>}
                  라운드 {num(u.round_count)}
                </span>
                {grants && (
                  <button
                    className={`ad-ai ${grants.some((g) => g.user_id === u.user_id) ? "on" : ""}`}
                    disabled={grantBusy === u.user_id}
                    onClick={() =>
                      void toggleGrant(u.user_id, !grants.some((g) => g.user_id === u.user_id))
                    }
                  >
                    {grants.some((g) => g.user_id === u.user_id) ? "AI 허용됨" : "AI 허용"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="hint" style={{ margin: "6px 2px 0" }}>
        닉네임 옆은 처음 로그인할 때 적은 실명·성별이에요. 눌러서 고칠 수 있어요.
      </p>
    </>
  );

  return (
    <div className="app">
      <TopBar
        left={<BackButton onClick={onClose} />}
        right={
          <button className="icon-btn" aria-label="새로고침" disabled={loading} onClick={() => void load()}>
            <Icon name="refresh" size={22} />
          </button>
        }
      />

      {split ? (
        <div className="split-view">
          <div className="split-pane">
            <LogoHead />
            <div className="sheet">
              {head}
              {statsTop}
            </div>
          </div>
          <div className="split-pane">
            <PaneHead title="라운드 및 사용자" />
            <div className="sheet">{statsRest}</div>
          </div>
        </div>
      ) : (
        <div className="sheet">
          {head}
          {stats && (
            <>
              {statsTop}
              <div className="section-title">최근 라운드 {rounds.length}개</div>
              {statsRest}
            </>
          )}
        </div>
      )}
      {moving && (
        <GuestMoveSheet
          guest={moving}
          onClose={() => setMoving(null)}
          onMoved={(r, to) => {
            setMoving(null);
            setNotice(
              `${to.real_name ?? to.name} 계정으로 라운드 ${r.moved}개를 옮겼어요.` +
                (r.skipped > 0 ? ` 이미 그 계정이 들어간 라운드 ${r.skipped}개는 그대로 두었어요.` : "")
            );
            window.scrollTo(0, 0);
            void load();
          }}
        />
      )}
      {naming && (
        <NameDialog
          initial={naming.real_name ?? naming.name}
          initialGender={naming.gender}
          title="실명·성별 고치기"
          desc={`${naming.name || "이름 없음"}님의 앱 이름(실명)과 성별이에요. 이름을 비우고 저장하면 다음 로그인 때 다시 물어요. 랭킹에는 바로, 그 사람 앱에는 길어야 1시간 안에 반영돼요.`}
          onSave={saveUserName}
          onClose={() => setNaming(null)}
          allowEmpty
        />
      )}
    </div>
  );
}
