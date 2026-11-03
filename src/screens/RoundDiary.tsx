import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth";
import { useBack } from "../back";
import { Icon } from "../icons";
import { listMyRounds } from "../rounds";
import { loadRecordRounds, type RecordRound } from "../recordStats";
import { loadInsight, readCachedInsight } from "../insight";
import { weatherText } from "../weather";
import { todaySeoul } from "../goals";
import { GAME_MODE_LABEL, teeLabel } from "../util";
import {
  DIARY_MAX,
  DiarySetupError,
  PRACTICE_TAGS,
  cachedDiary,
  isEmptyEntry,
  isPractice,
  loadDiary,
  practiceKey,
  saveDiary,
  type DiaryEntry,
} from "../diary";
import type { RoundListItem } from "../types";
import TopBar, { BackButton } from "./TopBar";
import { ForecastSide, WeatherScene, useRoundForecast } from "./RoundWeather";
import { useAiAccess } from "./Insight";

/*
 * 내 정보 → 라운드 일기: 달력에 라운드를 친 날은 내 타수, 일기·연습 메모를 남긴 날은 표시.
 * 날을 누르면 그날 페이지:
 *   라운드를 친 날 — 라운드마다 골프장·타수, 그날 날씨(하늘 장면·기온·습도·자외선), 지표, AI 종합 분석(쓸 수 있는 사람이 만들어 둔 것), 일기
 *   라운드가 없던 날 — 연습한 것 고르기 + 연습 메모
 * 글은 쓰는 대로 잠깐 뒤에 저장한다 (diary.ts, supabase/diary.sql)
 */

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return ym(d.getUTCFullYear(), d.getUTCMonth() + 1);
};
/** "11월 2일 (일)" */
export function dayLabel(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEK[d.getUTCDay()]})`;
}

/** 일기에 쓰는 라운드: 기록(타수·지표) + 라운드 행(티오프·규칙: 날씨) */
interface DiaryRound {
  rec: RecordRound;
  row: RoundListItem | undefined;
}

/** 이번 실행에서 받은 라운드 (다시 열 때 바로) */
let roundCache: { uid: string; rounds: DiaryRound[] } | null = null;

export default function RoundDiary() {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const today = todaySeoul();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [rounds, setRounds] = useState<DiaryRound[] | null>(roundCache?.uid === uid ? roundCache.rounds : null);
  const [entries, setEntries] = useState<DiaryEntry[] | null>(() => cachedDiary(uid));
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void (async () => {
      try {
        const list = await listMyRounds();
        const recs = await loadRecordRounds(uid, list, { all: true });
        const next = recs.map((rec) => ({ rec, row: list.find((r) => r.id === rec.roundId) }));
        roundCache = { uid, rounds: next };
        if (alive) setRounds(next);
      } catch (e) {
        console.error(e);
        if (alive) setErr("라운드를 불러오지 못했어요. 연결을 확인해 주세요.");
      }
    })();
    loadDiary(uid)
      .then((x) => alive && setEntries(x))
      .catch((e) => {
        console.error(e);
        if (!alive) return;
        setEntries([]);
        setErr(e instanceof DiarySetupError ? "일기 저장소가 아직 준비되지 않았어요." : "일기를 불러오지 못했어요.");
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  const byDay = useMemo(() => {
    const m = new Map<string, DiaryRound[]>();
    for (const r of rounds ?? []) m.set(r.rec.date, [...(m.get(r.rec.date) ?? []), r]);
    // 한 날 여러 라운드면 많이 친 라운드를 먼저 (달력에 그 타수)
    for (const list of m.values()) list.sort((a, b) => b.rec.summary.holesPlayed - a.rec.summary.holesPlayed);
    return m;
  }, [rounds]);
  const notesByDay = useMemo(() => {
    const m = new Map<string, DiaryEntry[]>();
    for (const e of entries ?? []) if (!isEmptyEntry(e)) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return m;
  }, [entries]);

  // 달력 칸: 그 달 1일의 요일만큼 비우고 1일부터
  const [y, mo] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const inMonth = (d: string) => d.startsWith(month);
  const roundDays = [...byDay.keys()].filter(inMonth);
  const diaryCount = (entries ?? []).filter((e) => inMonth(e.day) && !isPractice(e) && !isEmptyEntry(e)).length;
  const practiceCount = (entries ?? []).filter((e) => inMonth(e.day) && isPractice(e) && !isEmptyEntry(e)).length;
  const loading = rounds === null || entries === null;

  const onSaved = (key: string, saved: DiaryEntry | null) =>
    setEntries((prev) => {
      const rest = (prev ?? []).filter((e) => e.entryKey !== key);
      return saved ? [...rest, saved] : rest;
    });

  return (
    <>
      <p className="pf-desc">라운드를 친 날은 타수가 보여요. 날을 누르면 일기를 쓰고, 라운드가 없던 날은 연습을 남겨요.</p>
      <div className="card dy-cal">
        <div className="dy-head">
          <button className="dy-nav" aria-label="지난달" onClick={() => setMonth(shiftMonth(month, -1))}>
            <Icon name="chevronLeft" size={20} />
          </button>
          <b>
            {y}년 {mo}월
          </b>
          <button
            className="dy-nav"
            aria-label="다음 달"
            disabled={month >= today.slice(0, 7)}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
        <div className="dy-grid dy-week">
          {WEEK.map((w, i) => (
            <span key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>
              {w}
            </span>
          ))}
        </div>
        <div className="dy-grid">
          {cells.map((d, i) => {
            if (!d) return <span key={`e${i}`} />;
            const rs = byDay.get(d) ?? [];
            const notes = notesByDay.get(d) ?? [];
            const practice = notes.some(isPractice);
            const wrote = notes.some((n) => !isPractice(n));
            const future = d > today;
            const wd = (first + Number(d.slice(8)) - 1) % 7;
            const top = rs[0]?.rec.summary;
            return (
              <button
                key={d}
                className={`dy-day ${rs.length ? "round" : ""} ${d === today ? "today" : ""} ${wd === 0 ? "sun" : wd === 6 ? "sat" : ""}`}
                // 불러오기 전에 열면 쓰던 일기를 못 보고 덮어쓸 수 있어 기다린다
                disabled={future || loading}
                aria-label={`${dayLabel(d)}${rs.length ? ` 라운드 ${top!.strokes}타` : ""}${wrote ? " 일기 있음" : ""}${practice ? " 연습 메모 있음" : ""}`}
                onClick={() => setOpen(d)}
              >
                <span className="dy-num">{Number(d.slice(8))}</span>
                {top && (
                  <b className={`dy-score ${top.toPar < 0 ? "under" : ""}`}>
                    {top.strokes}
                    {rs.length > 1 && <small>+{rs.length - 1}</small>}
                  </b>
                )}
                {practice && !rs.length && <span className="dy-tag">연습</span>}
                {wrote && <i className="dy-dot" aria-hidden />}
              </button>
            );
          })}
        </div>
        <div className="dy-sum">
          {loading
            ? "불러오는 중…"
            : `라운드 ${roundDays.length}일 · 일기 ${diaryCount}개 · 연습 ${practiceCount}일`}
        </div>
      </div>
      {err && <div className="name-err">{err}</div>}

      {open &&
        createPortal(
          <DiaryDay
            uid={uid}
            day={open}
            rounds={byDay.get(open) ?? []}
            entries={(entries ?? []).filter((e) => e.day === open)}
            onSaved={onSaved}
            onClose={() => setOpen(null)}
          />,
          document.body
        )}
    </>
  );
}

/** 그날 페이지: 라운드마다 카드 + 일기, 라운드가 없으면 연습 메모. 라운드가 지워진 일기는 그날 메모로 */
function DiaryDay({
  uid,
  day,
  rounds,
  entries,
  onSaved,
  onClose,
}: {
  uid: string;
  day: string;
  rounds: DiaryRound[];
  entries: DiaryEntry[];
  onSaved: (key: string, saved: DiaryEntry | null) => void;
  onClose: () => void;
}) {
  useBack(true, onClose);
  const ai = useAiAccess(uid).ai;
  const roundIds = new Set(rounds.map((r) => r.rec.roundId));
  // 라운드가 지워져 남은 일기
  const orphans = entries.filter((e) => !isPractice(e) && !roundIds.has(e.entryKey));
  const find = (key: string) => entries.find((e) => e.entryKey === key);
  return (
    <div className="guide-layer" role="dialog" aria-modal="true" aria-label={`${dayLabel(day)} 일기`}>
      <div className="guide-inner">
        <TopBar left={<BackButton onClick={onClose} />} />
        <div className="sheet gd-sheet">
          <h2 className="page-title">{dayLabel(day)}</h2>
          {rounds.map((r) => (
            <RoundDay key={r.rec.roundId} uid={uid} r={r} ai={ai} entry={find(r.rec.roundId)} onSaved={onSaved} />
          ))}
          {rounds.length === 0 && (
            <>
              <div className="section-title">연습 메모</div>
              <DiaryEditor
                uid={uid}
                base={{ entryKey: practiceKey(day), day, roundId: null }}
                entry={find(practiceKey(day))}
                tags
                placeholder="무엇을 연습했나요? 연습장, 공 개수, 잘된 것과 안 된 것…"
                onSaved={onSaved}
              />
            </>
          )}
          {orphans.map((e) => (
            <div key={e.entryKey}>
              <div className="section-title">지워진 라운드의 일기</div>
              <DiaryEditor
                uid={uid}
                base={{ entryKey: e.entryKey, day, roundId: null }}
                entry={e}
                placeholder=""
                onSaved={onSaved}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 라운드 하나: 하늘 카드(골프장·타수·날씨) → 지표 → AI 종합 → 일기 */
function RoundDay({
  uid,
  r,
  ai,
  entry,
  onSaved,
}: {
  uid: string;
  r: DiaryRound;
  ai: boolean;
  entry: DiaryEntry | undefined;
  onSaved: (key: string, saved: DiaryEntry | null) => void;
}) {
  const { rec, row } = r;
  const s = rec.summary;
  // 티오프를 모르면 아침 8시 기준
  const tee = /^\d{1,2}:\d{2}$/.test(row?.tee_time ?? "") ? row!.tee_time.padStart(5, "0") : "08:00";
  const wx = useRoundForecast(row ? { id: row.id, date: rec.date, tee_time: tee, rules: row.rules } : null, {
    device: false,
  });
  const partial = s.holesPlayed < rec.holeCount;
  const tiles: [string, string, string?][] = [];
  if (s.putts != null) tiles.push(["퍼트", `${s.putts}개`, s.avgPutts != null ? `홀당 ${s.avgPutts.toFixed(1)}` : undefined]);
  else if (s.avgPutts != null) tiles.push(["퍼트", `홀당 ${s.avgPutts.toFixed(1)}`]);
  if (s.gir.d > 0) tiles.push(["GIR", `${s.gir.n}/${s.gir.d}`, pct(s.gir.rate)]);
  if (s.fairway.d > 0) tiles.push(["페어웨이", `${s.fairway.n}/${s.fairway.d}`, pct(s.fairway.rate)]);
  if (s.putts != null || s.avgPutts != null) tiles.push(["3퍼트", `${s.threePutts}번`]);
  if (s.ob + s.hazard > 0 || s.gir.d > 0) tiles.push(["벌타", `${s.ob + s.hazard}`, `OB ${s.ob} · 해저드 ${s.hazard}`]);
  // 스코어 분포 (이글은 나왔을 때만 칸을 둔다)
  const dist: [string, number][] = [
    ...(s.dist.eagle ? [["이글", s.dist.eagle] as [string, number]] : []),
    ["버디", s.dist.birdie],
    ["파", s.dist.par],
    ["보기", s.dist.bogey],
    ["더블", s.dist.double],
    ["트리플+", s.dist.triple],
  ];

  return (
    <div className="dy-round">
      <div className={`code-card dy-sky ${wx ? "wx-on" : ""}`} data-scene={wx?.kind} data-day={wx ? String(wx.isDay) : undefined}>
        {wx && <WeatherScene kind={wx.kind} isDay={wx.isDay} />}
        <div className="cc-top">
          <div className="dy-who">
            <div className="cc-label">{GAME_MODE_LABEL[rec.gameMode]}</div>
            <div className="dy-course">{rec.courseName || "이름 없는 라운드"}</div>
            <div className="dy-strokes">
              <b>{s.strokes}</b>타
              <span>{s.toPar === 0 ? "E" : s.toPar > 0 ? `+${s.toPar}` : s.toPar}</span>
            </div>
            <div className="cc-meta">
              {[row?.tee_time, teeLabel(rec.courseTee), partial ? `${s.holesPlayed}/${rec.holeCount}홀` : `${rec.holeCount}홀`]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {wx && <ForecastSide f={wx} />}
        </div>
        {/* 라운드 중 잰 기온·습도 (예보를 못 받았을 때) */}
        {!wx && rec.weather && <div className="cc-meta dy-obs">{weatherText(rec.weather)}</div>}
      </div>

      <div className="section-title">지표</div>
      <div className="card dy-stats">
        <div className="dy-dist">
          {dist.map(([k, v]) => (
            <span key={k} className={v ? "on" : ""}>
              <small>{k}</small>
              <b>{v}</b>
            </span>
          ))}
        </div>
        {tiles.length > 0 ? (
          <div className="dy-tiles">
            {tiles.map(([k, v, sub]) => (
              <div key={k} className="dy-tile">
                <small>{k}</small>
                <b>{v}</b>
                {sub && <span>{sub}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="dy-none">퍼트·티샷을 남기지 않은 라운드라 타수만 있어요.</p>
        )}
      </div>

      {/* AI 분석은 기록 탭에 있는 라운드(기록 모드 · 내 기록을 남긴 내기)만 만들 수 있다 */}
      {ai && (rec.gameMode === "record" || tiles.length > 0) && <AiSummary uid={uid} roundId={rec.roundId} />}

      <div className="section-title">일기</div>
      <DiaryEditor
        uid={uid}
        base={{ entryKey: rec.roundId, day: rec.date, roundId: rec.roundId }}
        entry={entry}
        placeholder="오늘 라운드는 어땠나요? 잘된 샷, 아쉬웠던 홀, 다음에 해 볼 것…"
        onSaved={onSaved}
      />
    </div>
  );
}

const pct = (rate: number | null) => (rate == null ? undefined : `${Math.round(rate * 100)}%`);

/** AI 종합 분석: 기록 화면에서 만들어 둔 라운드 전체 분석의 종합 (없으면 안내만) */
function AiSummary({ uid, roundId }: { uid: string; roundId: string }) {
  const [text, setText] = useState<string | null | undefined>(() => readCachedInsight(roundId, uid)?.sections.summary);
  useEffect(() => {
    let alive = true;
    loadInsight(roundId, uid)
      .then((v) => alive && setText((t) => v?.sections.summary || t || null))
      .catch(() => alive && setText((t) => t ?? null));
    return () => {
      alive = false;
    };
  }, [roundId, uid]);
  if (text === undefined) return null;
  return (
    <>
      <div className="section-title">
        <Icon name="spark" size={14} /> AI 종합 분석
      </div>
      <div className="card dy-ai">
        {text ? <p>{text}</p> : <p className="dy-none">이 라운드는 아직 AI 분석이 없어요. 기록 탭에서 만들면 여기에도 보여요.</p>}
      </div>
    </>
  );
}

type Save = "idle" | "saving" | "saved" | "error";

/** 일기·메모 입력: 쓰는 대로 1초 뒤 저장하고, 화면을 닫을 때도 저장한다 */
function DiaryEditor({
  uid,
  base,
  entry,
  tags: withTags = false,
  placeholder,
  onSaved,
}: {
  uid: string;
  base: Pick<DiaryEntry, "entryKey" | "day" | "roundId">;
  entry: DiaryEntry | undefined;
  /** 연습한 것 고르기 (연습 메모) */
  tags?: boolean;
  placeholder: string;
  onSaved: (key: string, saved: DiaryEntry | null) => void;
}) {
  const [body, setBody] = useState(entry?.body ?? "");
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [state, setState] = useState<Save>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(entry?.updatedAt ?? null);
  const last = useRef(JSON.stringify({ body: entry?.body ?? "", tags: entry?.tags ?? [] }));
  const latest = useRef({ body, tags });
  latest.current = { body, tags };

  const flush = async () => {
    const now = latest.current;
    const key = JSON.stringify(now);
    if (key === last.current) return;
    last.current = key;
    setState("saving");
    try {
      const saved = await saveDiary(uid, { ...base, body: now.body, tags: now.tags });
      onSaved(base.entryKey, saved);
      setSavedAt(saved?.updatedAt ?? null);
      setState("saved");
    } catch (e) {
      console.error(e);
      // 다음에 다시 보내게 표시를 되돌린다
      last.current = "";
      setState("error");
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const t = setTimeout(() => void flushRef.current(), 1000);
    return () => clearTimeout(t);
  }, [body, tags]);
  // 닫을 때 남은 것 저장
  useEffect(() => () => void flushRef.current(), []);

  const status =
    state === "saving"
      ? "저장하는 중…"
      : state === "error"
        ? "저장하지 못했어요. 연결을 확인해 주세요."
        : savedAt
          ? `저장됨 · ${new Date(savedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}`
          : "쓰면 저절로 저장돼요";

  return (
    <div className="card dy-editor">
      {withTags && (
        <div className="dy-tags">
          {PRACTICE_TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                className={`chip ${on ? "active" : ""}`}
                aria-pressed={on}
                onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}
      <textarea
        className="dy-text"
        value={body}
        maxLength={DIARY_MAX}
        placeholder={placeholder}
        rows={7}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => void flush()}
      />
      <div className={`dy-status ${state === "error" ? "err" : ""}`}>
        <span>{status}</span>
        {body.length > DIARY_MAX * 0.9 && (
          <span>
            {body.length}/{DIARY_MAX}
          </span>
        )}
      </div>
    </div>
  );
}
