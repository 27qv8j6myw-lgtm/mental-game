import { supabase } from "./supabase";
import { girOf, HALF_LABEL, summarize, type Frac, type Half, type HoleRecord, type RecordSummary } from "./recordStats";
import { apiUrl } from "./scorecard";
import type { CourseRating } from "./types";

/*
 * 라운드 기록 AI 분석 (관리자와 관리자가 허용한 사람): 기록 → 서버(api/insight.ts) → 칸마다 붙일 문단.
 * 만든 분석은 round_insights (supabase/insight.sql) 와 이 기기에 저장해 두고, 다음에 열 때 그대로 쓴다
 * (볼 때마다 다시 분석하지 않는다. 다시 만들기를 눌렀을 때만 새로).
 * 분석할 때의 기록 요약(fingerprint)을 함께 저장해, 그 뒤 기록이 바뀌면 화면에서 알려 준다.
 * 라운드 전체(all)와 전반(out)·후반(in) 분석을 따로 만들고 따로 저장한다 (round_insights.scope).
 */

/** 화면 칸마다 붙일 분석: 지표 칸 · 티샷 결과 · 스코어 분포 · 같은 코스 비교 · 스코어카드 아래 종합 */
export interface InsightSections {
  stats: string;
  teeShot: string;
  scoring: string;
  /** 같은 코스 이력이 없으면 빈 문자열 */
  course: string;
  summary: string;
}

export interface SavedInsight {
  sections: InsightSections;
  fingerprint: string;
  createdAt: string;
}

const pct1 = (f: Frac) => (f.rate == null ? null : Math.round(f.rate * 1000) / 10);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const frac = (f: Frac) => ({ n: f.n, of: f.d, pct: pct1(f) });
const distPct = (s: RecordSummary) => {
  const d = s.dist;
  const all = d.eagle + d.birdie + d.par + d.bogey + d.double + d.triple;
  const p = (n: number) => (all === 0 ? null : Math.round((n / all) * 1000) / 10);
  return {
    birdieOrBetter: p(d.eagle + d.birdie),
    par: p(d.par),
    bogey: p(d.bogey),
    double: p(d.double),
    triplePlus: p(d.triple),
  };
};

interface CourseOf {
  name: string;
  rating: CourseRating | null;
  holeCount: number;
}
/**
 * 같은 코스인가: 골프장 이름(띄어쓰기 무시)과 홀 수가 같고,
 * 둘 다 KGA 코스를 골랐다면 그 코스도 같아야 한다 (클럽72 하늘 ≠ 오션). 한쪽만 골랐으면 이름으로 본다
 */
export function isSameCourse(a: CourseOf, b: CourseOf): boolean {
  const n = (s: string) => s.trim().replace(/\s+/g, "").toLowerCase();
  if (!n(a.name) || n(a.name) !== n(b.name) || a.holeCount !== b.holeCount) return false;
  return !a.rating || !b.rating || a.rating.course === b.rating.course;
}

/** 분석할 때의 기록 요약: 홀별 파·타수·퍼트·티샷·벌타·샌드샷 (바뀌면 '기록이 바뀌었어요') */
export function insightFingerprint(recs: HoleRecord[]): string {
  const s = recs.map((h) => [h.par, h.rel, h.putts, h.fairway, h.lie, h.ob, h.hazard, h.sand].join(",")).join(";");
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash * 33) ^ s.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

const playedHoles = (recs: HoleRecord[]) => recs.filter((h) => h.rel != null);

/** 파3·파4·파5 평균 (파 대비) */
function parTypes(recs: HoleRecord[]) {
  const by = (par: number) => {
    const xs = playedHoles(recs).filter((h) => h.par === par);
    return { holes: xs.length, avgToPar: xs.length ? r2(xs.reduce((a, h) => a + (h.rel ?? 0), 0) / xs.length) : null };
  };
  return { par3: by(3), par4: by(4), par5: by(5) };
}

/**
 * 타수를 잃은 곳 (홀 번호와 함께): 3퍼트 이상으로 더 친 퍼트, 벌타, 벙커에서 한 번에 못 나와 더 친 샷,
 * 보기를 넘긴 타수, 그린을 놓친 홀, GIR 후 3퍼트 홀
 */
function strokeLeaks(recs: HoleRecord[]) {
  const p = playedHoles(recs);
  const list = (f: (h: HoleRecord) => number) => {
    const hs = p.filter((h) => f(h) > 0);
    return { strokes: hs.reduce((a, h) => a + f(h), 0), holes: hs.map((h) => h.hole + 1) };
  };
  return {
    threePuttExtra: list((h) => Math.max(0, (h.putts ?? 0) - 2)),
    penalties: list((h) => h.ob + h.hazard),
    bunkerExtra: list((h) => Math.max(0, h.sand - 1)),
    beyondBogey: list((h) => Math.max(0, (h.rel ?? 0) - 1)),
    missedGreenHoles: p.filter((h) => girOf(h.par, h.rel, h.putts) === false).map((h) => h.hole + 1),
    girThreePuttHoles: p.filter((h) => girOf(h.par, h.rel, h.putts) && (h.putts ?? 0) >= 3).map((h) => h.hole + 1),
  };
}

/**
 * 여러 라운드 평균 (평소 기록 · 같은 코스 기록에 함께 쓴다).
 * nine: 전반·후반 분석이면 다른 라운드의 같은 9홀 (평균 타수도 9홀을 다 친 것으로)
 */
function average(rounds: HoleRecord[][], nine = false) {
  const all = summarize(rounds.flat());
  const per = (n: number) => r1(n / rounds.length);
  const leaks = rounds.map(strokeLeaks);
  const perLeak = (f: (l: ReturnType<typeof strokeLeaks>) => number) => r1(leaks.reduce((a, l) => a + f(l), 0) / rounds.length);
  const full = rounds.map((hs) => summarize(hs)).filter((x) => x.holesPlayed === (nine ? 9 : 18));
  const avgStrokes = full.length ? r1(full.reduce((a, x) => a + x.strokes, 0) / full.length) : null;
  const avgToPar = full.length ? r1(full.reduce((a, x) => a + x.toPar, 0) / full.length) : null;
  return {
    rounds: rounds.length,
    ...(nine ? { avgStrokes9: avgStrokes, avgToPar9: avgToPar } : { avgStrokes18: avgStrokes, avgToPar18: avgToPar }),
    fairwayPct: pct1(all.fairway),
    girPct: pct1(all.gir),
    girThreePuttPct: pct1(all.girThreePutt),
    scramblingPct: pct1(all.scrambling),
    sandSavePct: pct1(all.sandSave),
    puttsPerHole: r2(all.avgPutts),
    extraShotsPerMissedGreen: r2(all.extraShots),
    onePuttsPerRound: per(all.onePutts),
    threePuttsPerRound: per(all.threePutts),
    obPerRound: per(all.ob),
    hazardPerRound: per(all.hazard),
    sandShotsPerRound: per(all.sandShots),
    scoreDistPct: distPct(all),
    parTypes: parTypes(rounds.flat()),
    // 라운드당 타수 손실
    leaksPerRound: {
      threePuttExtra: perLeak((l) => l.threePuttExtra.strokes),
      penalties: perLeak((l) => l.penalties.strokes),
      bunkerExtra: perLeak((l) => l.bunkerExtra.strokes),
      beyondBogey: perLeak((l) => l.beyondBogey.strokes),
    },
  };
}

const played = (rounds: HoleRecord[][]) => rounds.filter((hs) => hs.some((h) => h.rel != null));

/**
 * 서버에 보낼 분석 재료.
 * round: 이번 라운드 합계(분자·분모 포함)와 홀별 기록
 * usual: 같은 사람의 다른 라운드 평균 (없으면 null)
 * sameCourse: 같은 코스에서 친 다른 라운드 평균과 홀별 평균 타수 (없으면 null)
 * scope 가 전반·후반이면 recs·others·sameCourse 모두 그 9홀만 넘긴다
 */
export function buildInsightInput(
  meta: {
    date: string;
    course: string;
    holeCount: number;
    mode: string;
    differential: number | null;
    /** 그린스피드 m (넣은 라운드만) */
    greenSpeed?: number | null;
    /** 라운드 전체 · 전반 · 후반 */
    scope?: Half;
  },
  recs: HoleRecord[],
  /** 같은 사람의 다른 라운드들 홀별 기록 (이번 라운드는 빼고) */
  others: HoleRecord[][],
  /** 그 가운데 같은 코스 라운드 */
  sameCourse: HoleRecord[][] = []
) {
  const s = summarize(recs);
  const { scope = "all", ...rest } = meta;
  const nine = scope !== "all";
  const round = {
    ...rest,
    // 전반·후반만 분석할 때: "전반 9홀 (1~9번)"
    scope: nine ? `${HALF_LABEL[scope]} 9홀 (${scope === "out" ? "1~9번" : "10~18번"})` : null,
    strokes: s.strokes,
    toPar: s.toPar,
    holesPlayed: s.holesPlayed,
    front9: s.out,
    back9: s.in,
    fairway: frac(s.fairway),
    gir: frac(s.gir),
    girThreePutt: frac(s.girThreePutt),
    scrambling: frac(s.scrambling),
    sandSave: frac(s.sandSave),
    puttsPerHole: r2(s.avgPutts),
    onePutts: s.onePutts,
    threePutts: s.threePutts,
    extraShotsPerMissedGreen: r2(s.extraShots),
    ob: s.ob,
    hazard: s.hazard,
    sandShots: s.sandShots,
    teeShots: s.teeShots,
    teeDirection: { ...s.mix, notRecorded: s.noDirection },
    teeLie: s.lies,
    scoreDist: s.dist,
    scoreDistPct: distPct(s),
    parTypes: parTypes(recs),
    strokeLeaks: strokeLeaks(recs),
    holes: recs
      .filter((h) => h.rel != null)
      .map((h) => ({
        hole: h.hole + 1,
        par: h.par,
        strokes: h.par + (h.rel ?? 0),
        putts: h.putts,
        gir: girOf(h.par, h.rel, h.putts),
        teeDirection: h.par >= 4 ? h.fairway : null,
        teeLie: h.lie,
        ob: h.ob,
        hazard: h.hazard,
        sand: h.sand,
      })),
  };
  const usualRounds = played(others);
  const courseRounds = played(sameCourse);
  return {
    round,
    usual: usualRounds.length ? average(usualRounds, nine) : null,
    sameCourse: courseRounds.length
      ? {
          ...average(courseRounds, nine),
          // 홀별 평균 타수 (그 홀을 친 라운드만)
          holes: recs.map((h) => {
            const xs = courseRounds
              .map((hs) => hs.find((x) => x.hole === h.hole))
              .filter((x): x is HoleRecord => !!x && x.rel != null);
            return {
              hole: h.hole + 1,
              par: h.par,
              avgStrokes: xs.length ? r1(xs.reduce((a, x) => a + x.par + (x.rel ?? 0), 0) / xs.length) : null,
              rounds: xs.length,
            };
          }),
        }
      : null,
  };
}

/** 분석 요청. 실패하면 사용자에게 보여줄 문장으로 던진다 */
export async function requestInsight(input: unknown): Promise<{ sections: InsightSections; model: string }> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
  let res: Response;
  try {
    res = await fetch(apiUrl("insight"), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("연결이 안 돼서 분석을 요청하지 못했어요. 연결을 확인하고 다시 눌러 주세요.");
  }
  const body = (await res.json().catch(() => null)) as
    | { sections?: InsightSections; model?: string; error?: string }
    | null;
  if (res.ok && body?.sections) return { sections: { ...body.sections, course: body.sections.course ?? "" }, model: body.model ?? "" };
  const code = body?.error;
  throw new Error(
    code === "NO_KEY" || code === "KEY_SETUP"
      ? "서버의 Anthropic API 키 설정을 확인해 주세요."
      : code === "NO_CREDIT"
        ? "Anthropic 계정의 크레딧이 부족해요. 콘솔에서 결제 정보를 확인해 주세요."
        : code === "AI_ONLY"
          ? "AI 분석 권한이 없어요. 관리자에게 허용을 요청해 주세요."
          : code === "UNAUTHORIZED"
            ? "로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요."
            : code === "BUSY"
              ? "지금 요청이 많아요. 잠시 후 다시 시도해 주세요."
              : code === "TIMEOUT"
                ? "분석이 너무 오래 걸렸어요. 다시 시도해 주세요."
                : "분석을 만들지 못했어요. 잠시 후 다시 시도해 주세요."
  );
}

/* ---- 저장: 이 기기(바로 보이게) + 서버(다른 기기·다시 설치해도) ---- */

/** 라운드 전체는 예전 키 그대로 (전에 만든 분석을 계속 쓴다) */
const cacheKey = (roundId: string, playerUid: string, scope: Half) =>
  `mentalgame-insight:${roundId}:${playerUid}${scope === "all" ? "" : `:${scope}`}`;

export function readCachedInsight(roundId: string, playerUid: string, scope: Half = "all"): SavedInsight | null {
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(roundId, playerUid, scope)) ?? "null") as SavedInsight | null;
    return v?.sections ? { ...v, sections: { ...v.sections, course: v.sections.course ?? "" } } : null;
  } catch {
    return null;
  }
}
function writeCachedInsight(roundId: string, playerUid: string, scope: Half, v: SavedInsight) {
  try {
    localStorage.setItem(cacheKey(roundId, playerUid, scope), JSON.stringify(v));
  } catch {
    /* 저장소를 쓸 수 없으면 서버 보관본만 쓴다 */
  }
}

/** 분석 보관 테이블(insight.sql)을 아직 만들지 않은 경우 */
const isMissingTable = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01";
/** 전반·후반 칸(scope)을 넣는 insight.sql 을 아직 다시 실행하지 않은 경우 */
const isMissingScope = (e: { code?: string; message?: string } | null) =>
  e?.code === "42703" || e?.code === "PGRST204" || (!!e?.message && /scope/.test(e.message));

/** 서버에 저장해 둔 분석 (가져오면 이 기기에도 담아 둔다). 없거나 테이블이 아직 없으면 null */
export async function loadInsight(roundId: string, playerUid: string, scope: Half = "all"): Promise<SavedInsight | null> {
  if (!supabase) return null;
  const query = (withScope: boolean) => {
    const q = supabase!
      .from("round_insights")
      .select("sections,fingerprint,created_at")
      .eq("round_id", roundId)
      .eq("player_uid", playerUid);
    return (withScope ? q.eq("scope", scope) : q).maybeSingle();
  };
  let { data, error } = await query(true);
  // scope 칸이 아직 없으면 라운드 전체 분석만 예전처럼 (전반·후반은 이 기기에만 있다)
  if (error && isMissingScope(error)) {
    if (scope !== "all") return null;
    ({ data, error } = await query(false));
  }
  if (error) {
    if (!isMissingTable(error)) console.error(error);
    return null;
  }
  const row = data as { sections: InsightSections; fingerprint: string | null; created_at: string } | null;
  if (!row) return null;
  const v = {
    sections: { ...row.sections, course: row.sections.course ?? "" },
    fingerprint: row.fingerprint ?? "",
    createdAt: row.created_at,
  };
  writeCachedInsight(roundId, playerUid, scope, v);
  return v;
}

/** 분석 저장 (다시 만들면 덮어쓴다). 이 기기에는 늘 담고, 서버 저장이 실패하면 false */
export async function saveInsight(
  roundId: string,
  playerUid: string,
  sections: InsightSections,
  model: string,
  fingerprint: string,
  scope: Half = "all"
): Promise<boolean> {
  const createdAt = new Date().toISOString();
  writeCachedInsight(roundId, playerUid, scope, { sections, fingerprint, createdAt });
  if (!supabase) return false;
  const row = { round_id: roundId, player_uid: playerUid, sections, model, fingerprint, created_at: createdAt };
  let { error } = await supabase
    .from("round_insights")
    .upsert({ ...row, scope }, { onConflict: "round_id,player_uid,scope" });
  // scope 칸이 아직 없으면 라운드 전체 분석만 예전처럼 저장한다
  if (error && isMissingScope(error) && scope === "all") ({ error } = await supabase.from("round_insights").upsert(row));
  if (error) console.error(error);
  return !error;
}
