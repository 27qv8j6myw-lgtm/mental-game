import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth";
import { useBack } from "../back";
import { Icon } from "../icons";
import TopBar, { BackButton } from "./TopBar";
import { cachedRanking, loadRanking, RankingSetupError, type RankingData } from "../ranking";
import {
  GOAL_KINDS,
  GOAL_LABEL,
  GOAL_RANGE,
  GOAL_TAGLINE,
  GOAL_UNIT,
  MOTTO_MAX,
  achievedAfterPledge,
  dayLabel,
  goalAchieveId,
  goalMessage,
  goalPresets,
  goalProgress,
  goalTargetText,
  hasGoal,
  publishGoalNotices,
  seasonDaysLeft,
  seasonRounds,
  seoulYear,
  todaySeoul,
  type GoalKind,
  type GoalProgress,
  type SeasonGoal,
} from "../goals";

/*
 * 내 정보 → 시즌 목표.
 * 목표는 '다짐'처럼 세운다: 화면 전체를 쓰는 흐름에서 이룰 것을 고르고 → 큰 숫자로 정하고(한 걸음·도전·꿈) → 한 줄 다짐.
 * 목표 화면은 파란 시즌 카드(홈 '코드로 참여' 상자와 같은 모양: 다짐·이름·남은 날) + 목표마다 원형 게이지와 응원 한 줄.
 * 이루면 처음 볼 때 축하 창
 */

/** 축하를 본 목표 (기기에 기억) */
const CELEBRATED_KEY = "mentalgame-goal-celebrated";
function readCelebrated(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CELEBRATED_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function markCelebrated(id: string) {
  try {
    localStorage.setItem(CELEBRATED_KEY, JSON.stringify([...readCelebrated().filter((x) => x !== id), id].slice(-30)));
  } catch {
    /* 기억하지 못하면 다음에 한 번 더 축하할 뿐 */
  }
}

/** 올해 지금 기록 (목표 세우기 추천·안내) */
interface Now {
  avg: number | null;
  best: number | null;
  played: number;
  pace: number | null;
}

export default function SeasonGoals() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const name = user?.displayName?.trim() || "나";
  const year = seoulYear();
  const goal = hasGoal(user?.goal, year) ? user!.goal : null;
  const [data, setData] = useState<RankingData | null>(cachedRanking);
  const [err, setErr] = useState<string | null>(null);
  const [flow, setFlow] = useState(false);
  const [celebrated, setCelebrated] = useState<string[]>(readCelebrated);

  useEffect(() => {
    loadRanking()
      .then((d) => {
        setErr(null);
        setData(d);
      })
      .catch((e) => {
        console.error(e);
        if (!cachedRanking())
          setErr(
            e instanceof RankingSetupError
              ? "서버 설정이 아직 안 돼서 진행을 계산하지 못했어요."
              : "기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
          );
      });
  }, []);

  const mine = data ? seasonRounds(data.rounds, uid, year) : [];
  const progress = goal && data ? goalProgress(goal, mine) : null;
  const now: Now = {
    avg: mine.length ? Math.round((mine.reduce((s, r) => s + r.gross, 0) / mine.length) * 10) / 10 : null,
    best: mine.length ? Math.min(...mine.map((r) => r.gross)) : null,
    played: mine.length,
    pace: goalProgress({ year, rounds: 1 }, mine)[0].pace ?? null,
  };

  // 목표 화면에서 계산한 진행으로 종 알림도 고친다
  const goalKey = JSON.stringify(goal);
  useEffect(() => {
    if (data) publishGoalNotices(goal, progress);
  }, [data, goalKey]);

  // 다짐한 뒤 이룬 목표 가운데 아직 축하하지 않은 것 하나
  const toCelebrate =
    goal && !flow ? progress?.find((p) => achievedAfterPledge(goal, p) && !celebrated.includes(goalAchieveId(goal, p))) : undefined;

  return (
    <>
      {err && (
        <div className="card">
          <div className="empty-note">{err}</div>
        </div>
      )}
      {!goal ? (
        <div className="card gl-hero gl-empty">
          <Icon name="target" size={132} className="gl-hero-mark" strokeWidth={1.4} />
          <span className="gl-eyebrow">{year} 시즌 목표</span>
          <h3 className="gl-ask">올해, 어떤 골퍼가 되고 싶나요?</h3>
          <p className="gl-lead">목표를 세운 골퍼는 더 멀리 가요. 숫자 하나면 충분해요.</p>
          {data && now.played > 0 && (
            <div className="gl-now">
              <span>{now.played}라운드</span>
              {now.avg != null && <span>평균 {now.avg}타</span>}
              {now.best != null && <span>베스트 {now.best}타</span>}
            </div>
          )}
          <button className="btn-primary gl-hero-btn" onClick={() => setFlow(true)}>
            목표 세우기
          </button>
        </div>
      ) : (
        <>
          <SeasonCard goal={goal} name={name} progress={progress} />
          {progress?.map((p) => <GoalRingCard key={p.kind} p={p} />)}
          {!data && !err && (
            <div className="card">
              <div className="empty-note">불러오는 중…</div>
            </div>
          )}
          <button className="gl-redo" onClick={() => setFlow(true)}>
            목표 다시 세우기
          </button>
          <p className="gl-private">목표와 다짐은 나만 볼 수 있어요.</p>
        </>
      )}
      {flow && <GoalFlow year={year} name={name} initial={goal} now={now} onClose={() => setFlow(false)} />}
      {toCelebrate && goal && (
        <Celebration
          p={toCelebrate}
          name={name}
          onClose={() => {
            const id = goalAchieveId(goal, toCelebrate);
            markCelebrated(id);
            setCelebrated((c) => [...c, id]);
          }}
        />
      )}
    </>
  );
}

/** 시즌 카드 (파란 상자): 다짐 · 이름·다짐한 날 · 남은 날 · 몇 개 이뤘는지 */
function SeasonCard({ goal, name, progress }: { goal: SeasonGoal; name: string; progress: GoalProgress[] | null }) {
  const left = seasonDaysLeft();
  const done = progress?.filter((p) => p.done).length ?? 0;
  const total = GOAL_KINDS.filter((k) => goal[k] != null).length;
  return (
    <div className="card gl-hero">
      <Icon name="target" size={132} className="gl-hero-mark" strokeWidth={1.4} />
      <div className="gl-hero-top">
        <span className="gl-eyebrow">{goal.year} 시즌 목표</span>
        <span className="gl-dday">{left > 0 ? `마감까지 ${left}일` : "마지막 날"}</span>
      </div>
      <p className="gl-motto">{goal.motto ? `“${goal.motto}”` : "올해의 나를 넘어서는 시즌"}</p>
      <div className="gl-sign">
        {name}
        {goal.setOn && ` · ${dayLabel(goal.setOn)} 다짐`}
      </div>
      {/* 미리 보기(진행 없음)에는 고른 목표를 칩으로 */}
      {!progress && (
        <div className="gl-now">
          {GOAL_KINDS.filter((k) => goal[k] != null).map((k) => (
            <span key={k}>{goalTargetText({ kind: k, target: goal[k]! })}</span>
          ))}
        </div>
      )}
      <div className="gl-tally" aria-label={`목표 ${total}개 중 ${done}개 이룸`}>
        <div className="gl-tally-bar">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < done ? "on" : ""} />
          ))}
        </div>
        <b>
          {done}/{total} 달성
        </b>
      </div>
    </div>
  );
}

/** 목표 하나: 원형 게이지(안에 지금 값) · 목표 · 응원 한 줄. 이루면 '달성' 칩 */
function GoalRingCard({ p }: { p: GoalProgress }) {
  return (
    <div className={`card gl-card ${p.done ? "done" : ""}`}>
      <Ring fill={p.fill} done={p.done}>
        <b>{p.current ?? "–"}</b>
        <span>{p.current != null ? GOAL_UNIT[p.kind] : ""}</span>
      </Ring>
      <div className="gl-card-tx">
        <div className="gl-card-top">
          <span className="gl-label">{GOAL_LABEL[p.kind]}</span>
          {p.done && (
            <span className="gl-done">
              달성{p.achievedOn && ` · ${dayLabel(p.achievedOn)}`}
            </span>
          )}
        </div>
        <b className="gl-target">
          {p.target}
          {GOAL_UNIT[p.kind]}
          {p.kind !== "rounds" && " 이하"}
        </b>
        <span className="gl-msg">{goalMessage(p)}</span>
      </div>
    </div>
  );
}

function Ring({ fill, done, children, size = 80 }: { fill: number; done: boolean; children: ReactNode; size?: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className={`gl-ring ${done ? "done" : ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r={r} className="gl-ring-track" />
        <circle
          cx="42"
          cy="42"
          r={r}
          className="gl-ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fill)}
          transform="rotate(-90 42 42)"
        />
      </svg>
      <div className="gl-ring-in">{children}</div>
    </div>
  );
}

/* ---------- 목표 세우기 (화면 전체) ---------- */

const STEP: Record<GoalKind, number> = { avg: 0.5, best: 1, rounds: 1 };
const MOTTO_IDEAS = ["3퍼트 없는 골퍼", "OB 없이 18홀", "끝까지 웃으며 치는 골퍼", "드라이버는 페어웨이로"];

function GoalFlow({
  year,
  name,
  initial,
  now,
  onClose,
}: {
  year: number;
  name: string;
  initial: SeasonGoal | null;
  now: Now;
  onClose: () => void;
}) {
  const { saveGoal } = useAuth();
  const [picked, setPicked] = useState<GoalKind[]>(() => GOAL_KINDS.filter((k) => initial?.[k] != null));
  const [values, setValues] = useState<Record<GoalKind, number>>(() => {
    const v = {} as Record<GoalKind, number>;
    for (const k of GOAL_KINDS) {
      const presets = goalPresets(k, now);
      v[k] = initial?.[k] ?? presets[Math.min(1, presets.length - 1)].value;
    }
    return v;
  });
  const [motto, setMotto] = useState(initial?.motto ?? "");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  // 0 고르기 · 1..n 목표마다 · n+1 다짐 · n+2 다짐 완료
  const n = picked.length;
  const kind = step >= 1 && step <= n ? picked[step - 1] : null;
  const pledgeStep = n + 1;
  const doneStep = n + 2;
  // 기기 뒤로가기: 한 단계 앞으로 (처음이면 닫기)
  useBack(true, () => {
    if (step > 0 && step < doneStep) {
      setStep(step - 1);
      return false;
    }
    onClose();
  });

  const toggle = (k: GoalKind) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : GOAL_KINDS.filter((x) => x === k || p.includes(x))));
  const setValue = (k: GoalKind, v: number) => {
    const [lo, hi] = GOAL_RANGE[k];
    setValues((s) => ({ ...s, [k]: Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) }));
  };

  const pledge = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const goal: SeasonGoal = { year, setOn: todaySeoul() };
    for (const k of picked) goal[k] = values[k];
    if (motto.trim()) goal.motto = motto.trim().slice(0, MOTTO_MAX);
    if (await saveGoal(goal)) setStep(doneStep);
    else setErr("저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    setBusy(false);
  };
  const clear = async () => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    setBusy(true);
    if (await saveGoal(null)) onClose();
    else {
      setErr("지우지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
      setBusy(false);
    }
  };

  /** 이미 이룬 값이면 한 번 더 생각해 보게 */
  const already = (k: GoalKind, v: number) =>
    k === "avg"
      ? now.avg != null && now.played >= 3 && now.avg <= v
      : k === "best"
        ? now.best != null && now.best <= v
        : now.played >= v;

  const preview: SeasonGoal = { year, setOn: todaySeoul(), motto: motto.trim() || undefined };
  for (const k of picked) preview[k] = values[k];

  const back = () => (step === 0 ? onClose() : setStep(step - 1));
  const next =
    step === 0
      ? { label: "다음", disabled: n === 0, run: () => setStep(1) }
      : kind
        ? { label: step === n ? "다짐하러 가기" : "다음", disabled: false, run: () => setStep(step + 1) }
        : step === pledgeStep
          ? { label: busy ? "저장하는 중…" : "이 목표로 다짐하기", disabled: busy, run: () => void pledge() }
          : { label: "시즌 시작", disabled: false, run: onClose };

  return createPortal(
    <div className="guide-layer gl-flow" role="dialog" aria-modal="true" aria-label={`${year} 시즌 목표 세우기`}>
      <div className="guide-inner">
        <TopBar
          left={step < doneStep ? <BackButton label={step === 0 ? "닫기" : "이전"} onClick={back} /> : undefined}
          right={
            step < doneStep ? (
              <span className="gl-dots" aria-hidden="true">
                {Array.from({ length: n + 2 }, (_, i) => (
                  <i key={i} className={i === step ? "on" : i < step ? "past" : ""} />
                ))}
              </span>
            ) : undefined
          }
        />

        <div className="sheet gl-flow-sheet" key={step}>
          {step === 0 && (
            <>
              <span className="gl-step-eyebrow">{year} 시즌 목표</span>
              <h2 className="page-title gl-flow-title">
                {name}님,
                <br />
                올해 무엇을 이루고 싶나요?
              </h2>
              <p className="gl-flow-sub">하나만 골라도 좋아요.</p>
              <div className="gl-picks">
                {GOAL_KINDS.map((k) => (
                  <button
                    key={k}
                    className={`card gl-pick ${picked.includes(k) ? "on" : ""}`}
                    aria-pressed={picked.includes(k)}
                    onClick={() => toggle(k)}
                  >
                    <span className={`gl-pick-ic ${k}`}>
                      <Icon name={k === "avg" ? "graph" : k === "best" ? "trophy" : "flag"} size={22} />
                    </span>
                    <span className="gl-pick-tx">
                      <b>{GOAL_LABEL[k]}</b>
                      <span>{GOAL_TAGLINE[k]}</span>
                    </span>
                    <span className="gl-check" aria-hidden="true" />
                  </button>
                ))}
              </div>
              {initial && (
                <button className="gl-clear" disabled={busy} onClick={() => void clear()}>
                  {clearArmed ? "한 번 더 누르면 목표를 지워요" : "목표 지우기"}
                </button>
              )}
              {err && <p className="gl-err">{err}</p>}
            </>
          )}

          {kind && (
            <>
              <span className="gl-step-eyebrow">
                {step}/{n} · {GOAL_LABEL[kind]}
              </span>
              <h2 className="page-title gl-flow-title">
                {kind === "avg" ? "올해 평균, 몇 타까지?" : kind === "best" ? "올해 꼭 치고 싶은 스코어는?" : "올해 몇 번 필드에 설까요?"}
              </h2>
              <p className="gl-flow-sub">
                {kind === "avg"
                  ? now.avg != null
                    ? `지금 올해 평균은 ${now.avg}타예요.`
                    : "아직 올해 18홀 평균이 없어요."
                  : kind === "best"
                    ? now.best != null
                      ? `지금 올해 베스트는 ${now.best}타예요.`
                      : "아직 올해 18홀 기록이 없어요."
                    : `올해 지금 ${now.played}라운드${now.pace != null ? `, 이 속도면 약 ${now.pace}라운드예요.` : "예요."}`}
              </p>
              <div className="card gl-picker-card">
                <div className="gl-picker">
                  <button className="gl-stepper" aria-label="줄이기" onClick={() => setValue(kind, values[kind] - STEP[kind])}>
                    <Icon name="minus" size={22} />
                  </button>
                  <div className="gl-big">
                    <b>{values[kind]}</b>
                    <span>{GOAL_UNIT[kind]}</span>
                  </div>
                  <button className="gl-stepper" aria-label="늘리기" onClick={() => setValue(kind, values[kind] + STEP[kind])}>
                    <Icon name="plus" size={22} />
                  </button>
                </div>
                <div className="gl-big-sub">{kind === "rounds" ? "18홀 라운드" : "18홀 기준, 이 타수 이하"}</div>
              </div>
              <div className="gl-presets">
                {goalPresets(kind, now).map((p) => (
                  <button
                    key={p.value}
                    className={`gl-preset ${values[kind] === p.value ? "on" : ""}`}
                    onClick={() => setValue(kind, p.value)}
                  >
                    <span>{p.label}</span>
                    <b>
                      {p.value}
                      {GOAL_UNIT[kind]}
                    </b>
                  </button>
                ))}
              </div>
              {already(kind, values[kind]) && <p className="gl-hint">이미 이룬 목표예요. 조금 더 높여 볼까요?</p>}
            </>
          )}

          {step === pledgeStep && (
            <>
              <span className="gl-step-eyebrow">마지막 · 다짐</span>
              <h2 className="page-title gl-flow-title">마음에 새길 한 줄</h2>
              <p className="gl-flow-sub">안 적어도 괜찮아요. 시즌 카드 맨 위에 남아요.</p>
              <input
                className="input gl-motto-in"
                value={motto}
                maxLength={MOTTO_MAX}
                placeholder="예: 3퍼트 없는 골퍼"
                onChange={(e) => setMotto(e.target.value)}
              />
              <div className="gl-ideas">
                {MOTTO_IDEAS.map((m) => (
                  <button key={m} className={`gl-idea ${motto === m ? "on" : ""}`} onClick={() => setMotto(m)}>
                    {m}
                  </button>
                ))}
              </div>
              <div className="section-title gl-preview-title">미리 보기</div>
              <SeasonCard goal={preview} name={name} progress={null} />
              {err && <p className="gl-err">{err}</p>}
            </>
          )}

          {step === doneStep && (
            <div className="gl-sealed">
              <span className="gl-sealed-ic">
                <Icon name="target" size={52} strokeWidth={1.6} />
              </span>
              <h2 className="page-title gl-flow-title">다짐했어요</h2>
              <p className="gl-flow-sub">
                {name}님의 {year} 시즌을 응원해요.
                <br />
                목표를 이루면 가장 먼저 알려 드릴게요.
              </p>
            </div>
          )}
        </div>

        <div className="gl-flow-foot">
          <button className="btn-primary" disabled={next.disabled} onClick={next.run}>
            {next.label}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** 목표를 이뤘을 때 한 번: 트로피 · 목표 · 이룬 날 · 꽃가루 */
function Celebration({ p, name, onClose }: { p: GoalProgress; name: string; onClose: () => void }) {
  useBack(true, onClose);
  return createPortal(
    <div className="alert-backdrop gl-cele" onClick={onClose}>
      <div className="gl-confetti" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i % 8) * 0.12}s` }} />
        ))}
      </div>
      <div className="alert-box gl-cele-box" role="dialog" aria-modal="true" aria-label="시즌 목표 달성" onClick={(e) => e.stopPropagation()}>
        <span className="gl-cele-ic">
          <Icon name="trophy" size={34} />
        </span>
        <span className="gl-step-eyebrow">시즌 목표 달성</span>
        <h3>{goalTargetText(p)}</h3>
        <p>
          {name}님, 해냈어요!
          <br />
          {p.achievedOn ? `${dayLabel(p.achievedOn)}에 다짐을 지켰어요.` : "다짐을 지켰어요."}
        </p>
        <button className="btn-primary" onClick={onClose}>
          계속 가기
        </button>
      </div>
    </div>,
    document.body
  );
}
