import type { RecordRound } from "./recordStats";
import type { StatsResult } from "./stats";
import type { RoundListItem } from "./types";
import { BADGES, type Earned } from "./badges";

/*
 * 올해의 골프 결산 (기록 탭): 한 해 동안 끝낸 라운드로 라운드·홀 수, 평균·베스트, 골프장, 함께 친 사람,
 * 버디·이글, 내기 정산, 얻은 배지를 모은다. 계산만 (화면은 screens/YearReview.tsx)
 */

export interface YearReview {
  year: number;
  /** 라운드로 센 라운드 (9홀 이상, 9홀 라운드는 끝까지) */
  rounds: number;
  holes: number;
  first: { date: string; course: string } | null;
  last: { date: string; course: string } | null;
  /** 18홀을 끝까지 친 라운드 */
  rounds18: number;
  avg18: number | null;
  best18: { gross: number; date: string; course: string } | null;
  courses: number;
  topCourse: { name: string; count: number } | null;
  busiestMonth: { month: number; count: number } | null;
  companions: { uid: string; name: string; photoUrl: string | null; count: number }[];
  companionCount: number;
  birdies: number;
  eagles: number;
  pars: number;
  mostBirdies: { count: number; date: string; course: string } | null;
  /** 돈을 주고받은 라운드가 없으면 null */
  money: {
    rounds: number;
    total: number;
    wins: number;
    losses: number;
    best: { net: number; date: string; course: string } | null;
  } | null;
  badges: { id: string; title: string; date: string; color: string }[];
}

const counts = (r: RecordRound) => r.summary.holesPlayed >= Math.min(9, r.holeCount);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 기록이 있는 해 (최근 순) */
export function reviewYears(list: RoundListItem[]): number[] {
  const ys = new Set(list.filter((r) => r.status === "done").map((r) => Number((r.date || r.created_at).slice(0, 4))));
  return [...ys].filter((y) => y > 2000).sort((a, b) => b - a);
}

export function computeYearReview(
  year: number,
  myUid: string,
  list: RoundListItem[],
  records: RecordRound[],
  stats: StatsResult | null,
  earned: Map<string, Earned>
): YearReview {
  const inYear = (d: string) => d.startsWith(`${year}-`);
  const rs = records.filter((r) => inYear(r.date) && counts(r)).sort((a, b) => a.date.localeCompare(b.date));
  const full = rs.filter((r) => r.holeCount === 18 && r.summary.holesPlayed === 18);

  // 골프장 · 가장 바빴던 달
  const byCourse = new Map<string, number>();
  const byMonth = new Map<number, number>();
  for (const r of rs) {
    const name = r.courseName.trim() || "이름 없는 골프장";
    byCourse.set(name, (byCourse.get(name) ?? 0) + 1);
    const m = Number(r.date.slice(5, 7));
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  const topCourse = [...byCourse].sort((a, b) => b[1] - a[1])[0];
  const busiest = [...byMonth].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];

  // 함께 친 사람: 그해 끝낸 라운드의 참여자 (나 빼고). 사진은 전적에서
  const ids = new Set(rs.map((r) => r.roundId));
  const people = new Map<string, { name: string; count: number }>();
  for (const r of list) {
    if (!ids.has(r.id)) continue;
    for (const p of r.round_players) {
      if (p.user_uid === myUid) continue;
      const cur = people.get(p.user_uid);
      people.set(p.user_uid, { name: p.name || cur?.name || "?", count: (cur?.count ?? 0) + 1 });
    }
  }
  const photo = new Map((stats?.people ?? []).map((p) => [p.uid, p]));
  const companions = [...people]
    .map(([uid, v]) => ({
      uid,
      name: v.name,
      count: v.count,
      photoUrl: photo.get(uid)?.photoUrl ?? null,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // 홀 기록
  let birdies = 0;
  let eagles = 0;
  let pars = 0;
  let mostBirdies: YearReview["mostBirdies"] = null;
  for (const r of rs) {
    const rels = r.holes.map((h) => h.rel).filter((v): v is number => v != null);
    const b = rels.filter((v) => v <= -1).length;
    birdies += rels.filter((v) => v === -1).length;
    eagles += rels.filter((v) => v <= -2).length;
    pars += rels.filter((v) => v === 0).length;
    if (b > 0 && (!mostBirdies || b > mostBirdies.count)) mostBirdies = { count: b, date: r.date, course: r.courseName };
  }

  // 내기 정산 (전적의 돈을 주고받은 라운드)
  const mine = (stats?.me?.history ?? []).filter((h) => inYear(h.date) && h.money);
  const best = mine.filter((h) => h.net > 0).sort((a, b) => b.net - a.net)[0];
  const money = mine.length
    ? {
        rounds: mine.length,
        total: mine.reduce((s, h) => s + h.net, 0),
        wins: mine.filter((h) => h.net > 0).length,
        losses: mine.filter((h) => h.net < 0).length,
        best: best ? { net: best.net, date: best.date, course: best.courseName } : null,
      }
    : null;

  const bestRound = full.reduce<RecordRound | null>(
    (a, r) => (!a || r.summary.strokes < a.summary.strokes ? r : a),
    null
  );

  return {
    year,
    rounds: rs.length,
    holes: rs.reduce((s, r) => s + r.summary.holesPlayed, 0),
    first: rs[0] ? { date: rs[0].date, course: rs[0].courseName } : null,
    last: rs.length ? { date: rs[rs.length - 1].date, course: rs[rs.length - 1].courseName } : null,
    rounds18: full.length,
    avg18: full.length ? r1(full.reduce((s, r) => s + r.summary.strokes, 0) / full.length) : null,
    best18: bestRound ? { gross: bestRound.summary.strokes, date: bestRound.date, course: bestRound.courseName } : null,
    courses: byCourse.size,
    topCourse: topCourse ? { name: topCourse[0], count: topCourse[1] } : null,
    busiestMonth: busiest ? { month: busiest[0], count: busiest[1] } : null,
    companions: companions.slice(0, 3),
    companionCount: companions.length,
    birdies,
    eagles,
    pars,
    mostBirdies,
    money,
    badges: BADGES.filter((b) => earned.get(b.id) && inYear(earned.get(b.id)!.date)).map((b) => ({
      id: b.id,
      title: b.title,
      date: earned.get(b.id)!.date,
      color: b.color,
    })),
  };
}
