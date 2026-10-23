import { useSyncExternalStore } from "react";
import { loadRecordRounds, type RecordRound } from "./recordStats";
import { setNoticeSource, type NoticeItem } from "./notices";
import { achievedAfterPledge, dayLabel, goalProgress, goalTargetText, type SeasonGoal } from "./goals";
import type { RoundListItem } from "./types";

/*
 * 배지: 정의와 판정을 한곳에. 내가 끝낸 라운드(상세 기록이 없는 내기 라운드 포함)의 홀별 타수·퍼트로 계산하고
 * 처음 얻은 날을 함께 보여 준다 (서버 표 없음). 새로 얻으면 종 알림, 배지 화면을 열면 본 것으로 (기기에 기억)
 */

export type BadgeGroup = "rounds" | "score" | "hole" | "record";
export const BADGE_GROUP_LABEL: Record<BadgeGroup, string> = {
  rounds: "라운드",
  score: "스코어",
  hole: "홀",
  record: "기록",
};

/** 머리 아이콘 (screens/Badges.tsx) */
export type BadgeIcon = "flag" | "count" | "down" | "birdie" | "eagle" | "ace" | "streak" | "shield" | "putts" | "calendar" | "green" | "goal";

export interface BadgeDef {
  id: string;
  group: BadgeGroup;
  title: string;
  /** 얻는 방법 (아직 없는 배지에) */
  how: string;
  color: string;
  icon: BadgeIcon;
  /** count 아이콘 안 숫자 */
  n?: number;
}

export const BADGES: BadgeDef[] = [
  { id: "first", group: "rounds", title: "첫 라운드", how: "라운드 하나를 끝까지", color: "#3b6fe4", icon: "flag" },
  { id: "r10", group: "rounds", title: "10라운드", how: "라운드 10번", color: "#21b8b0", icon: "count", n: 10 },
  { id: "r30", group: "rounds", title: "30라운드", how: "라운드 30번", color: "#16b364", icon: "count", n: 30 },
  { id: "r50", group: "rounds", title: "50라운드", how: "라운드 50번", color: "#8b7cf6", icon: "count", n: 50 },
  { id: "r100", group: "rounds", title: "100라운드", how: "라운드 100번", color: "#e8663d", icon: "count", n: 100 },
  { id: "month4", group: "rounds", title: "한 달 4라운드", how: "한 달에 라운드 4번", color: "#8b7cf6", icon: "calendar" },
  { id: "break100", group: "score", title: "100타 깨기", how: "18홀 99타 이하", color: "#f2683f", icon: "down" },
  { id: "break90", group: "score", title: "90타 깨기", how: "18홀 89타 이하", color: "#e0458a", icon: "down" },
  { id: "break80", group: "score", title: "80타 깨기", how: "18홀 79타 이하", color: "#3b6fe4", icon: "down" },
  { id: "noDouble", group: "score", title: "더블 없는 18홀", how: "18홀 모두 보기 이하", color: "#16b364", icon: "shield" },
  { id: "birdie", group: "hole", title: "첫 버디", how: "버디 하나", color: "#e0458a", icon: "birdie" },
  { id: "birdie3", group: "hole", title: "버디 3개", how: "한 라운드 버디 3개", color: "#f2683f", icon: "birdie" },
  { id: "eagle", group: "hole", title: "첫 이글", how: "이글 하나", color: "#3b6fe4", icon: "eagle" },
  { id: "ace", group: "hole", title: "홀인원", how: "티샷 한 번에 홀컵", color: "#c9963a", icon: "ace" },
  { id: "par5", group: "hole", title: "5홀 연속 파", how: "파 이하로 5홀 이어서", color: "#f2683f", icon: "streak" },
  { id: "no3putt", group: "record", title: "3퍼트 없는 18홀", how: "18홀 퍼트를 다 적고 3퍼트 없이", color: "#21b8b0", icon: "putts" },
  { id: "fastGreen", group: "record", title: "빠른 그린 정복", how: "그린 3.0m 이상에서 30퍼트 이하", color: "#3cc98a", icon: "green" },
  { id: "goal", group: "record", title: "시즌 목표 달성", how: "다짐한 시즌 목표 하나 이루기", color: "#c9963a", icon: "goal" },
];

export interface Earned {
  /** 처음 얻은 날 YYYY-MM-DD */
  date: string;
  course: string;
  /** "87타" "3번 홀" 같은 한 줄 */
  value: string;
}

const full18 = (r: RecordRound) => r.holeCount === 18 && r.summary.holesPlayed === 18;
/** 라운드로 셀 만큼 쳤는지 (9홀 이상, 9홀 라운드는 끝까지) */
const counts = (r: RecordRound) => r.summary.holesPlayed >= Math.min(9, r.holeCount);
const holeNo = (i: number) => `${i + 1}번 홀`;

function longestRun(r: RecordRound, max: number) {
  let best = 0;
  let run = 0;
  for (const h of [...r.holes].sort((a, b) => a.hole - b.hole)) {
    run = h.rel != null && h.rel <= max ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** 배지마다 처음 얻은 라운드 (얻지 못한 배지는 없음) */
export function evaluateBadges(rounds: RecordRound[], goal?: SeasonGoal | null): Map<string, Earned> {
  const out = new Map<string, Earned>();
  // 오래된 순: 처음 얻은 날을 찾는다
  const asc = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
  const give = (id: string, r: RecordRound, value: string) => {
    if (!out.has(id)) out.set(id, { date: r.date, course: r.courseName, value });
  };

  const played = asc.filter(counts);
  played.forEach((r, i) => {
    const n = i + 1;
    if (n === 1) give("first", r, "첫걸음");
    for (const [id, k] of [["r10", 10], ["r30", 30], ["r50", 50], ["r100", 100]] as const)
      if (n === k) give(id, r, `${k}번째`);
  });
  // 한 달 4라운드: 그 달 4번째 라운드에
  const perMonth = new Map<string, number>();
  for (const r of played) {
    const m = r.date.slice(0, 7);
    const c = (perMonth.get(m) ?? 0) + 1;
    perMonth.set(m, c);
    if (c === 4) give("month4", r, `${Number(m.slice(5, 7))}월 4번째`);
  }

  for (const r of asc) {
    const holes = r.holes.filter((h) => h.rel != null);
    if (full18(r)) {
      const g = r.summary.strokes;
      if (g <= 99) give("break100", r, `${g}타`);
      if (g <= 89) give("break90", r, `${g}타`);
      if (g <= 79) give("break80", r, `${g}타`);
      if (holes.every((h) => h.rel! <= 1)) give("noDouble", r, `${g}타`);
      // 퍼트를 18홀 다 적은 라운드만
      const putts = r.holes.map((h) => h.putts);
      if (putts.every((p) => p != null)) {
        const total = putts.reduce<number>((s, p) => s + p!, 0);
        if (putts.every((p) => p! < 3)) give("no3putt", r, `${total}퍼트`);
        if (r.greenSpeed != null && r.greenSpeed >= 3 && total <= 30) give("fastGreen", r, `그린 ${r.greenSpeed.toFixed(1)}m · ${total}퍼트`);
      }
    }
    const birdie = holes.find((h) => h.rel! <= -1);
    if (birdie) give("birdie", r, holeNo(birdie.hole));
    const nBirdie = holes.filter((h) => h.rel! <= -1).length;
    if (nBirdie >= 3) give("birdie3", r, `버디 ${nBirdie}개`);
    const eagle = holes.find((h) => h.rel! <= -2);
    if (eagle) give("eagle", r, holeNo(eagle.hole));
    const ace = holes.find((h) => h.par + h.rel! === 1);
    if (ace) give("ace", r, holeNo(ace.hole));
    const run = longestRun(r, 0);
    if (run >= 5) give("par5", r, `${run}홀`);
  }

  // 시즌 목표: 다짐한 뒤 이룬 목표 하나 (18홀을 끝까지 친 라운드, goals.ts 와 같은 계산)
  if (goal) {
    const mine = asc
      .filter((r) => full18(r) && r.date.startsWith(`${goal.year}-`))
      .map((r) => ({ uid: "", roundId: r.roundId, date: r.date, course: r.courseName, holes: 18, gross: r.summary.strokes }));
    const done = goalProgress(goal, mine)
      .filter((p) => achievedAfterPledge(goal, p))
      .sort((a, b) => a.achievedOn!.localeCompare(b.achievedOn!))[0];
    if (done) {
      const r = asc.find((x) => x.date === done.achievedOn);
      out.set("goal", { date: done.achievedOn!, course: r?.courseName ?? "", value: goalTargetText(done) });
    }
  }
  return out;
}

/* ---------- 본 배지 · 종 알림 ---------- */

const SEEN_KEY = "mentalgame-badges-seen";
function readSeen(uid: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null") as { uid: string; ids: string[] } | null;
    return new Set(v && v.uid === uid && Array.isArray(v.ids) ? v.ids : []);
  } catch {
    return new Set();
  }
}

/** 배지 화면을 열면: 지금 얻은 배지를 모두 본 것으로 */
export function markBadgesSeen(uid: string, earned: Map<string, Earned>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ uid, ids: [...earned.keys()] }));
  } catch {
    /* 기억하지 못하면 다음에 알림이 한 번 더 뜰 뿐 */
  }
  publish(uid, earned);
}

/** 아직 보지 않은 배지 (정의 순서) */
export function unseenBadges(uid: string, earned: Map<string, Earned>): BadgeDef[] {
  const seen = readSeen(uid);
  return BADGES.filter((b) => earned.has(b.id) && !seen.has(b.id));
}

function publish(uid: string, earned: Map<string, Earned>) {
  summary = { uid, earned: earned.size };
  listeners.forEach((fn) => fn());
  const fresh = unseenBadges(uid, earned);
  if (fresh.length === 0) return setNoticeSource("badges", []);
  const one = fresh.length === 1 ? fresh[0] : null;
  const e = one ? earned.get(one.id)! : null;
  const item: NoticeItem = one
    ? {
        id: `badge:${one.id}`,
        kind: "badge",
        title: `새 배지: ${one.title}`,
        sub: [dayLabel(e!.date), e!.course].filter(Boolean).join(" · "),
        hint: "눌러서 배지 보기",
        page: "badges",
      }
    : {
        id: `badges:${fresh.map((b) => b.id).join(",")}`,
        kind: "badge",
        title: `새 배지 ${fresh.length}개`,
        sub: fresh.length > 3 ? `${fresh.slice(0, 3).map((b) => b.title).join(" · ")} 외` : fresh.map((b) => b.title).join(" · "),
        hint: "눌러서 배지 보기",
        page: "badges",
      };
  setNoticeSource("badges", [item]);
}

/* 내 정보 목록의 '모은 배지 수' */
let summary: { uid: string; earned: number } | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useBadgeCount = (uid: string) =>
  useSyncExternalStore(subscribe, () => (summary?.uid === uid ? summary.earned : null));

/** 마지막 계산 (끝낸 라운드·목표가 같으면 다시 받지 않는다. 앱을 다시 열어도 쓰게 기기에 보관) */
const LAST_KEY = "mentalgame-badges-last";
let last: { key: string; earned: Map<string, Earned> } | null = null;
function readLast(): typeof last {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as { key: string; earned: [string, Earned][] } | null;
    return v && typeof v.key === "string" && Array.isArray(v.earned) ? { key: v.key, earned: new Map(v.earned) } : null;
  } catch {
    return null;
  }
}
function writeLast(v: NonNullable<typeof last>) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ key: v.key, earned: [...v.earned] }));
  } catch {
    /* 보관하지 못하면 다음에 다시 계산할 뿐 */
  }
}

/** 끝낸 라운드나 목표가 바뀌었을 때만 다시 계산해 종 알림을 고친다 */
export async function loadBadges(
  uid: string,
  list: RoundListItem[] | undefined,
  goal: SeasonGoal | null | undefined
): Promise<Map<string, Earned>> {
  const done = (list ?? []).filter((r) => r.status === "done");
  const key = `${uid}:${JSON.stringify(goal ?? null)}:${done.map((r) => `${r.id}@${r.updated_at}`).join(",")}`;
  last ??= readLast();
  if (list && last?.key === key) {
    publish(uid, last.earned);
    return last.earned;
  }
  const earned = evaluateBadges(await loadRecordRounds(uid, list, { all: true }), goal);
  if (list) {
    last = { key, earned };
    writeLast(last);
  }
  publish(uid, earned);
  return earned;
}
