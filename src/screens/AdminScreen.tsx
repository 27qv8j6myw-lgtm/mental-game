import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminStats,
  fetchRecentRounds,
  fetchRecentUsers,
  type AdminRound,
  type AdminStats,
  type AdminUser,
} from "../admin";
import { GoogleLogo, Icon, KakaoLogo } from "../icons";
import { GAME_MODE_LABEL } from "../util";
import type { GameMode } from "../types";
import RatioBar from "./RatioBar";

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

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="chart" size={18} />
          </span>
          관리자 대시보드
        </div>
        <div className="actions">
          <button
            className="icon-btn"
            aria-label="새로고침"
            disabled={loading}
            onClick={() => void load()}
          >
            <Icon name="refresh" size={19} />
          </button>
          <button className="icon-btn" aria-label="닫기" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>

      <div className="sheet">
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

        {stats && (
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

            <div className="section-title">최근 라운드 {rounds.length}개</div>
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
                            r.game_mode !== "record" && `${num(r.unit)}원`,
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
                    <span className="ad-count">라운드 {num(u.round_count)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
