import type { CSSProperties, ReactNode } from "react";
import { Avatar, Icon } from "../icons";
import type { Gender, HoleStat } from "../types";
import { relLabel, TEE_BOXES, won, wonSigned } from "../util";
import HoleStatFields from "../screens/HoleStatFields";
import { BogeyExpect, DifficultyChip } from "../screens/CourseDifficulty";
import { GameModeField } from "../screens/RoundFields";

/*
 * 사용 방법의 '화면 예시': 앱 화면 조각을 같은 클래스로 그린다 (가짜 사람·숫자, 누를 수 없음).
 * 숫자는 본문 계산 예시와 맞춘다 (철수 · 영희 · 민수, 타당 1,000원).
 */

const noop = () => {};
const btn = { tabIndex: -1 } as const;

type Who = { name: string; gender: Gender };
const 철수: Who = { name: "철수", gender: "male" };
const 영희: Who = { name: "영희", gender: "female" };
const 민수: Who = { name: "민수", gender: "male" };
const 지훈: Who = { name: "지훈", gender: "male" };

const face = (w: Who, size = 22) => <Avatar gender={w.gender} size={size} />;
const tone = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

/* ---------- 홈 ---------- */

export function ShotHome() {
  return (
    <>
      <div className="section-title">코드로 참여하기</div>
      <div className="card">
        <div className="join-row">
          <input className="input code-input" value="4827" readOnly {...btn} />
          <button className="btn-primary sm" {...btn}>
            참여
          </button>
        </div>
      </div>
    </>
  );
}

export function ShotRoundItem() {
  return (
    <div className="round-item">
      <div className="ri-open ri-static">
        <div className="ri-name">
          <span className="ri-title">베어크리크 춘천</span>
          <span className="mode-tag stroke">타당</span>
          <span className="ri-live">6홀 진행</span>
        </div>
        <div className="ri-sub">2026-10-25 · 07:30 · 화이트 티 · 방장</div>
        <div className="ri-players">
          <span className="ri-p">
            철수<b className="ri-score">+3</b>
          </span>
          ,{" "}
          <span className="ri-p">
            영희<b className="ri-score">+5</b>
          </span>
          ,{" "}
          <span className="ri-p">
            민수<b className="ri-score">+9</b>
          </span>
        </div>
      </div>
      <div className="ri-right">
        <span className="badge st-playing">진행중</span>
      </div>
    </div>
  );
}

/* ---------- 대기실 ---------- */

export function ShotCode() {
  return (
    <div className="code-card gd-mb0">
      <div className="cc-label">초대 코드</div>
      <div className="cc-code">4827</div>
      <div className="cc-actions">
        <button className="btn-line" {...btn}>
          <Icon name="share" size={15} className="inline-ic" />
          코드 공유하기
        </button>
        <button className="btn-line" {...btn}>
          설정 수정
        </button>
      </div>
      <div className="cc-course">베어크리크 춘천</div>
      <div className="cc-meta">2026-10-25 · 07:30 · 18홀 · 화이트 티 · 타당 1,000원 · 계좌이체</div>
    </div>
  );
}

export function ShotLobbyPlayer() {
  return (
    <div className="card lobby-player mine gd-mb0">
      <div className="lp-head">
        {face(영희, 34)}
        <span className="lp-name-static">영희</span>
        <span className="me-tag">나</span>
      </div>
      <div className="segmented sm" style={{ marginTop: 10 }}>
        <button {...btn}>
          <Icon name="male" size={15} className="inline-ic" /> 남성
        </button>
        <button className="active" {...btn}>
          <Icon name="female" size={15} className="inline-ic" /> 여성
        </button>
      </div>
      <div className="lp-tee">
        <span className="lp-tee-label">티 박스</span>
        <div className="segmented sm tee-seg">
          {TEE_BOXES.map(([t, label]) => (
            <button key={t} className={t === "red" ? `active ${t}` : ""} {...btn}>
              <span className={`tee-dot ${t}`} />
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="row2" style={{ marginTop: 10 }}>
        <div className="stepper-field">
          <label>평균 타수</label>
          <input className="input avg-input" value="95" readOnly {...btn} />
        </div>
        <div className="stepper-field">
          <label>핸디캡</label>
          <div className="stepper">
            <button {...btn}>−</button>
            <span>23</span>
            <button {...btn}>＋</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 홀 진행 ---------- */

const SCORE_OPTS_PAR4 = [-3, -2, -1, 0, 1, 2, 3, 4];
const scoreClass = (rel: number) => (rel < 0 ? "under" : rel > 0 ? "over" : "even");

function ScoreRow({ who, rel, mine, net, note }: { who: Who; rel: number | null; mine?: boolean; net: number; note?: ReactNode }) {
  return (
    <div className="pscore-block">
      <div className="player-head">
        {face(who, 26)}
        {mine ? (
          <span className="pname pname-btn">
            {who.name}
            <span className="my-rec-chip">내 기록 입력</span>
          </span>
        ) : (
          <span className="pname">{who.name}</span>
        )}
        {note}
        {rel == null && <span className="miss-chip">미입력</span>}
        <span className={`pnet ${tone(net)}`}>
          <small>누적</small> {net === 0 ? "±0" : wonSigned(net)}
        </span>
      </div>
      <div className="score-grid main-score" style={{ gridTemplateColumns: `repeat(${SCORE_OPTS_PAR4.length}, 1fr)` }}>
        {SCORE_OPTS_PAR4.map((s) => (
          <button key={s} className={`sbtn ${rel === s ? `active ${scoreClass(s)}` : ""}`} {...btn}>
            {relLabel(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 홀 진행 화면: 홀 이동 · 상태 · PAR · 사람별 스코어 버튼 */
export function ShotHole() {
  return (
    <>
      <div className="hole-nav gd-hole-nav">
        <button className="navbtn" {...btn}>
          <Icon name="chevronLeft" size={22} />
        </button>
        <div className="center">
          <div className="num">3번 홀</div>
          <div className="lbl">PAR 4 · 3 / 18</div>
        </div>
        <button className="navbtn" {...btn}>
          <Icon name="chevronRight" size={22} />
        </button>
      </div>
      <div className="gd-pad">
        <div className="status-slot">
          <div className="hole-status draft">저장 전 · 2/3명 입력</div>
        </div>
        <div className="par-seg">
          {[3, 4, 5].map((p) => (
            <button key={p} className={p === 4 ? "active" : ""} {...btn}>
              PAR {p}
            </button>
          ))}
        </div>
        <div className="section-title">이번 홀 스코어</div>
        <div className="card gd-mb0">
          <ScoreRow who={철수} rel={-1} mine net={8000} />
          <ScoreRow who={영희} rel={0} net={2000} />
          <ScoreRow who={민수} rel={null} net={-10000} />
        </div>
        <button className="btn-primary gd-mt" disabled {...btn}>
          민수 입력하면 저장
        </button>
      </div>
    </>
  );
}

/** 홀 상태 줄 여러 가지 */
export function ShotStatuses() {
  const rows: [string, string][] = [
    ["draft", "저장 전 · 2/3명 입력"],
    ["saved", "✓ 저장됨 · 영희 10:42"],
    ["wait", "저장 대기 · 연결되면 올라가요"],
    ["editing", "수정 중 · 저장하면 수정 내역에 남아요"],
  ];
  return (
    <div className="gd-stack">
      {rows.map(([k, t]) => (
        <div key={k} className={`hole-status ${k}`}>
          {t}
        </div>
      ))}
    </div>
  );
}

/** 배판 · 전원 동타 안내 */
export function ShotBanners() {
  return (
    <div className="gd-stack">
      <div className="bet-banner gd-mb0">
        <div className="mult">×2</div>
        <div className="bb-txt">
          <span className="bt">배판 적용!</span>
          <span className="bs">트리플보기+</span>
        </div>
        <Icon name="spark" size={22} className="fire" />
      </div>
      <div className="bet-banner carry gd-mb0">
        <div className="mult">×2</div>
        <div className="bb-txt">
          <span className="bt">전원 동타 · 이 홀은 정산 없음</span>
          <span className="bs">다음 홀로 ×2 이월돼요</span>
        </div>
      </div>
    </div>
  );
}

/** 내 기록 (퍼트·티샷·벌타) */
export function ShotMyRec() {
  // 예시 1: 파4 5타 · 오른쪽 벙커 · 벙커샷 2번 · 1퍼트 후 OK
  const stat: HoleStat = { putts: 2, fairway: "right", lie: "bunker", ob: 0, hazard: 0, sand: 2 };
  return (
    <div className="my-rec gd-mb0">
      <span className="gir-chip">GIR 아님</span>
      <HoleStatFields par={4} strokes={5} stat={stat} onChange={noop} />
    </div>
  );
}

/** 스킨스 판돈 · 획득 */
export function ShotSkins() {
  return (
    <div className="gd-stack">
      <div className="skin-banner heat-2 gd-mb0">
        <div className="sb-count">
          <b>2</b>
          <small>스킨</small>
        </div>
        <div className="sb-body">
          <div className="sb-cells">
            <div className="sb-cell">
              <small>1명당</small>
              <b>2,000원</b>
            </div>
            <div className="sb-cell">
              <small>총</small>
              <b>6,000원</b>
            </div>
          </div>
          <div className="sb-sub">이월 ×2</div>
        </div>
      </div>
      <div className="skin-pot won gd-mb0">
        <div className="sp-label">스킨 획득!</div>
        <div className="sp-winners">
          <span className="sp-winner">
            {face(민수, 30)}
            <b>민수</b>
          </span>
        </div>
        <div className="sp-main">
          <b>4</b>
          <span>스킨</span>
        </div>
        <div className="sp-money big">+12,000원</div>
        <div className="sp-chips">
          <span className="sp-chip">이월 ×2</span>
          <span className="sp-chip">버디 ×2</span>
        </div>
      </div>
    </div>
  );
}

/** 캐디피 카드: 이번 홀 · 꼴찌 */
export function ShotCaddie() {
  return (
    <div className="gd-stack">
      <div className="cd-card pending hot gd-mb0">
        <div className="cd-label">이번 홀 꼴찌가 내요</div>
        <div className="cd-main big">{won(20000)}</div>
        <div className="cd-sub">앞에서 1홀 넘어왔어요</div>
        <div className="cd-progress">
          모은 캐디피 <b>{won(10000)}</b> / {won(160000)} · 넘어온 {won(10000)}
        </div>
      </div>
      <div className="cd-card paid gd-mb0">
        <div className="cd-label">이 홀 꼴찌</div>
        <div className="cd-who">
          {face(지훈, 30)}
          <b>지훈</b>
        </div>
        <div className="cd-money">캐디피 {won(20000)}</div>
        <div className="cd-progress">
          모은 캐디피 <b>{won(30000)}</b> / {won(160000)}
        </div>
      </div>
    </div>
  );
}

/** 등수 내기: 현재 순위 */
export function ShotRankBoard() {
  const rows: [number, string, string, boolean?][] = [
    [1, "철수", "+16점", true],
    [2, "영희", "−2점"],
    [3, "민수", "−14점"],
  ];
  return (
    <div className="rank-board gd-mb0" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map(([rank, name, score, me]) => (
        <div className={`rb-cell m${rank} ${me ? "me" : ""}`} key={name}>
          <span className="rb-medal">{rank}</span>
          <b className="rb-name">{name}</b>
          <em className="rb-score">{score}</em>
        </div>
      ))}
    </div>
  );
}

/* ---------- 정산 ---------- */

/** 내 정산 (영희 입장): 보낼 돈 · 계좌번호 복사 */
export function ShotMySettle() {
  return (
    <div className="card my-settle gd-mb0">
      <div className="ms-total">
        <span>보낼 돈</span>
        <b className="neg">{wonSigned(-2000)}</b>
      </div>
      <div className="ms-row">
        <div className="ms-line">
          {face(철수)}
          <span className="ms-who">철수에게 보내기</span>
          <b className="neg">{won(2000)}</b>
        </div>
        <div className="ms-acct">
          <span>토스뱅크 1000-1234-5678</span>
          <button className="acct-copy" {...btn}>
            계좌번호 복사
          </button>
        </div>
      </div>
    </div>
  );
}

function Transfer({ from, to, amount }: { from: Who; to: Who; amount: number }) {
  return (
    <div className="transfer">
      <span className="from">
        {face(from)}
        {from.name}
      </span>
      <span className="arrow">
        <Icon name="chevronRight" size={16} />
      </span>
      <span className="to">
        {face(to)}
        {to.name}
      </span>
      <span className="amt">{won(amount)}</span>
    </div>
  );
}

/** 최종 송금 (최소 횟수) */
export function ShotTransfers() {
  return (
    <div className="gd-mb-last">
      <Transfer from={민수} to={철수} amount={14000} />
      <Transfer from={영희} to={철수} amount={2000} />
    </div>
  );
}

/** 순위 (타수 · 금액) */
export function ShotStandings() {
  const rows: [Who, number, number, number][] = [
    [철수, 74, 2, 16000],
    [영희, 75, 3, -2000],
    [민수, 78, 6, -14000],
  ];
  return (
    <div className="standings gd-mb-last">
      {rows.map(([w, gross, rel, net], i) => (
        <div className="standing" key={w.name}>
          <div className={`rank ${i === 0 ? "top" : ""}`}>{i + 1}</div>
          {face(w, 26)}
          <span className="nm">{w.name}</span>
          <span className="st-pill">
            <b>{gross}타</b>
            <small>{relLabel(rel)}</small>
          </span>
          <span className={`val ${tone(net)}`}>{wonSigned(net)}</span>
        </div>
      ))}
    </div>
  );
}

/** 홀별 검증: 1번 홀 (트리플보기+ 배판) */
export function ShotVerify() {
  const rows: [string, number, string, string, string][] = [
    ["철수", 0, "+8,000", "0", "+8,000"],
    ["영희", 1, "+2,000", "0", "+2,000"],
    ["민수", 3, "-10,000", "0", "-10,000"],
  ];
  const cls = (s: string) => (s.startsWith("+") ? "pos" : s.startsWith("-") ? "neg" : "");
  return (
    <div className="card verify gd-mb0">
      <div className="vf-nav">
        <button className="navbtn" {...btn}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="vf-title">
          <b>1번 홀</b>
          <span>PAR 4</span>
        </div>
        <button className="navbtn" {...btn}>
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
      <div className="vf-strip">
        {Array.from({ length: 9 }, (_, i) => (
          <button key={i} className={`${i === 0 ? "active" : ""} ${i < 3 ? "played" : ""}`} {...btn}>
            {i + 1}
          </button>
        ))}
      </div>
      <div className="vf-rate">
        1타당 2,000원 (타당 1,000원 × 배수 2)
        <span className="vf-reasons">트리플보기+</span>
      </div>
      <table className="vf-table" style={{ "--vf-amt": "13px" } as CSSProperties}>
        <thead>
          <tr>
            <th>이름</th>
            <th>타수</th>
            <th>게임</th>
            <th>버디</th>
            <th>누적</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, rel, g, b, c]) => (
            <tr key={name}>
              <td className="vf-name">
                <span className="vf-name-in">
                  <span className="vf-nm">{name}</span>
                </span>
              </td>
              <td className="vf-score">
                <span className={`vf-pill ${scoreClass(rel)}`}>
                  <b>{4 + rel}</b>
                  <small>{relLabel(rel)}</small>
                </span>
              </td>
              <td className={`vf-amt ${cls(g)}`}>{g}</td>
              <td className={`vf-amt ${cls(b)}`}>{b}</td>
              <td className={`vf-amt vf-cum ${cls(c)}`}>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 라운드 만들기 ---------- */

/** 게임 방식 고르기 (앱과 같은 칸) */
export function ShotModes() {
  return (
    <div className="card gd-mb0">
      <GameModeField value="stroke" onChange={noop} />
    </div>
  );
}

/** 코스 난이도 */
export function ShotDifficulty() {
  return (
    <div className="card gd-mb0">
      <div className="field gd-mb0">
        <label>난이도</label>
        <div className="kga-rating">
          <span>남자 화이트 티 · KGA 71.8/132</span>
          <DifficultyChip slope={132} />
        </div>
        <div className="kga-expect">
          <BogeyExpect cr={71.8} slope={132} />
        </div>
      </div>
    </div>
  );
}

/* ---------- 전적 · 랭킹 · 기록 ---------- */

/** 나와 맞대결 막대 */
export function ShotWinLoss() {
  return (
    <div className="card st-vs gd-mb0">
      <div className="st-vs-score">
        <span>
          나 <b className="pos">5승</b>
        </span>
        <span className="st-vs-mid">1무</span>
        <span>
          <b className="neg">3패</b> 영희
        </span>
      </div>
      <div className="st-vs-bar">
        <span className="w" style={{ flexGrow: 5 }} />
        <span className="d" style={{ flexGrow: 1 }} />
        <span className="l" style={{ flexGrow: 3 }} />
      </div>
      <div className="st-vs-amt">
        <span className="pos">+32,000원</span>
        <span className="neg">-32,000원</span>
      </div>
    </div>
  );
}

/** 랭킹 시상대 */
export function ShotPodium() {
  // 앱처럼 2등 · 1등 · 3등 순서로 놓는다 (가운데가 가장 높다)
  const rows: [Who, number, number, number, string, string][] = [
    [영희, 2, 88.0, 4, "down", "▼1"],
    [철수, 1, 84.5, 6, "up", "▲1"],
    [민수, 3, 91.3, 5, "new", "NEW"],
  ];
  return (
    <div className="card rk-podium gd-mb0">
      {rows.map(([w, rank, avg, rounds, chg, chgText]) => (
        <div key={w.name} className={`rk-pod p${rank}`}>
          <span className={`rk-pod-face m${rank}`}>
            <Avatar gender={w.gender} size={rank === 1 ? 56 : 46} />
            <span className="rk-medal">{rank}</span>
          </span>
          <span className="rk-pod-name">{w.name}</span>
          <span className="rk-pod-avg">
            {avg.toFixed(1)}
            <small>타</small>
          </span>
          <span className="rk-pod-sub">
            {rounds}라운드 <span className={`rk-chg ${chg}`}>{chgText}</span>
          </span>
          <span className={`rk-pod-base m${rank}`} />
        </div>
      ))}
    </div>
  );
}

/** 랭킹 공개 범위 */
export function ShotVisibility() {
  const rows: [string, string, boolean][] = [
    ["함께 친 사람만 (기본)", "함께 친 사람끼리만 서로 순위·기록을 봐요.", true],
    ["전체 공개", "전체 공개한 사람끼리 서로 봐요.", false],
    ["숨기기", "내 기록이 랭킹에 보이지 않고, 다른 사람 랭킹도 볼 수 없어요.", false],
  ];
  return (
    <div className="card rk-vis gd-mb0">
      {rows.map(([t, s, on]) => (
        <div key={t} className={`rk-vis-row ${on ? "on" : ""}`}>
          <span className="rk-radio" />
          <span className="tinfo">
            <span className="t">{t}</span>
            <span className="s">{s}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** 기록 분석 지표 칸 */
export function ShotMetrics() {
  const tiles: [string, string, string?][] = [
    ["페어웨이 적중률", "57%", "14홀 중 8홀"],
    ["GIR", "28%", "18홀 중 5홀"],
    ["홀당 퍼트", "1.9", "1퍼트 3 · 3퍼트+ 2"],
    ["스크램블 (파 세이브)", "31%", "13홀 중 4홀"],
  ];
  return (
    <div className="rm-grid">
      {tiles.map(([l, v, n]) => (
        <div className="rm-tile" key={l}>
          <span className="rm-label">{l}</span>
          <b className="rm-value">{v}</b>
          {n && <span className="rm-note">{n}</span>}
        </div>
      ))}
    </div>
  );
}
