import { supabase } from "./supabase";
import { totalNet } from "./betting";
import { caddieRanks, caddieResult } from "./caddie";
import { rankResult, rankScoreText } from "./rankGame";
import { bundleConfig, bundleHoles } from "./model";
import { listMyRounds, type RoundBundle } from "./rounds";
import type { GameMode, RoundListItem, RoundPlayerRow } from "./types";

/*
 * 전적: 내가 볼 수 있는(=내가 참여한) 정산 확정 라운드로 사람마다 기록과 누적 금액을 모은다.
 * 금액은 핸디캡까지 포함해 실제로 주고받은 돈 (사전·사후 정산 모두, 타수 보정은 핸디 금액 0).
 * 캐디피·등수 내기(내는 돈)는 사람끼리 오간 돈이 없어서, 똑같이 나눠 냈을 때보다 덜 낸 만큼 +, 더 낸 만큼 − 로 본다.
 * 등수 내기(금액 없음)는 금액이 없다 (타당 포인트면 '포인트'에서 본다).
 */

/** 한 사람의 한 라운드 기록 */
export interface RoundRecord {
  roundId: string;
  /** YYYY-MM-DD (라운드 날짜, 없으면 만든 날) */
  date: string;
  courseName: string;
  gameMode: GameMode;
  playerCount: number;
  holeCount: number;
  /** 금액 기준 순위 (같은 금액은 같은 순위). 캐디피는 적게 낸 순, 등수 내기는 그 등수 */
  rank: number;
  net: number;
  /** 금액이 있는 라운드 (등수 내기의 금액 없음만 아님): 승패·누적 금액에 넣는다 */
  money: boolean;
  /** 캐디피·등수 내기(내는 돈)에서 실제로 낸 돈 (net 은 똑같이 나눠 냈을 때와 비교한 득실) */
  paid?: number;
  /** 금액이 없는 라운드의 오른쪽 표시: "+12점" */
  detail?: string;
  /** 등수 내기를 타당 포인트로 친 라운드의 내 포인트 (핸디 포인트 포함, 한 판의 합은 0) */
  points?: number;
  /** 모든 홀을 쳤을 때의 타수, 아니면 null */
  gross: number | null;
  birdies: number;
  /** 이글 이상(-2 이하) */
  eagles: number;
}

export interface PersonStats {
  uid: string;
  name: string;
  photoUrl: string | null;
  rounds: number;
  /** 금액 1위(0원보다 많이 딴 경우만) */
  firsts: number;
  /** 돈을 딴 / 잃은 / 본전 라운드 수 */
  wins: number;
  losses: number;
  draws: number;
  total: number;
  /** 18홀을 다 친 라운드의 평균·베스트 타수 */
  avg18: number | null;
  best18: number | null;
  birdies: number;
  eagles: number;
  /** 최신순 */
  history: RoundRecord[];
  /** 나와 함께한 라운드에서 내 금액이 더 많았던(win)·적었던(loss)·같았던(draw) 횟수. 나 자신은 null */
  vsMe: { win: number; loss: number; draw: number; myTotal: number; theirTotal: number } | null;
  /** 나와 함께한 라운드 중 둘 다 끝까지 친 라운드의 타수 맞대결. 그런 라운드가 없거나 나 자신이면 null */
  strokesVsMe: StrokesVsMe | null;
  /** 등수 내기 타당 포인트 판만 모은 기록. 그런 판이 없으면 null */
  points: PointStats | null;
}

/** 포인트 판 기록: 승·패·무는 그 판 포인트가 + / − / 0 */
export interface PointStats {
  rounds: number;
  total: number;
  /** 그 판 1등 */
  firsts: number;
  wins: number;
  losses: number;
  draws: number;
  /** 나와 함께한 포인트 판에서 내 포인트가 더 많았던(win)·적었던(loss)·같았던(draw) 횟수. 나 자신이면 null */
  vsMe: { win: number; loss: number; draw: number; myTotal: number; theirTotal: number } | null;
}

export interface StrokesVsMe {
  /** 내 타수가 더 적었던(win)·많았던(loss)·같았던(draw) 라운드 수 (내 기준) */
  win: number;
  loss: number;
  draw: number;
  rounds: number;
  /** 그 사람 타수 − 내 타수의 라운드 평균 (소수 첫째 자리). − 면 나보다 적게 친다 */
  diff: number;
  /** 그중 18홀 라운드의 평균 타수 (나 / 그 사람) */
  myAvg18: number | null;
  theirAvg18: number | null;
}

export interface StatsResult {
  me: PersonStats | null;
  /** 누적 금액 순 (나 포함) */
  people: PersonStats[];
  roundCount: number;
  /** 그중 등수 내기를 타당 포인트로 친 라운드 수 (0이면 '포인트' 보기를 숨긴다) */
  pointRoundCount: number;
}

/** 라운드 묶음들 → 사람별 전적 (네트워크 없이 계산만, 테스트 가능) */
export function computeStats(bundles: RoundBundle[], myUid: string): StatsResult {
  const people = new Map<string, PersonStats>();
  // 사람마다 라운드별 금액 (맞대결 계산용). 돈을 주고받은 라운드만
  const netByRound = new Map<string, Map<string, number>>();
  /** 전적에 넣은 라운드 수 (캐디피·등수 내기 포함) */
  let included = 0;
  let pointRounds = 0;

  // 오래된 라운드부터 → 이름·사진은 가장 최근 라운드 것으로 덮인다
  const ordered = [...bundles].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));

  for (const bundle of ordered) {
    const config = bundleConfig(bundle);
    const holes = bundleHoles(bundle);
    if (config.players.length < 2 || config.gameMode === "record") continue;
    included++;
    const caddie = config.gameMode === "caddie" ? caddieResult(config, holes, true) : null;
    const caddieRank = caddie ? caddieRanks(caddie) : null;
    const rankGame = config.gameMode === "rank" ? rankResult(config, holes) : null;
    // 캐디피·등수(내는 돈): 사람끼리 오간 돈이 없어 똑같이 나눠 냈을 때와 비교한 득실
    const paidIn = caddie ? caddie.paid : rankGame?.rules.prize === "pay" ? rankGame.amounts : null;
    const net = paidIn ? splitGain(paidIn) : totalNet(config, holes, true).net;
    // 등수(금액 없음)만 승패·누적 금액·맞대결에서 뺀다
    const isMoney = rankGame?.rules.prize !== "none";
    if (isMoney) netByRound.set(bundle.round.id, new Map(Object.entries(net)));
    const isPoints = rankGame?.rules.method === "points";
    if (isPoints) pointRounds++;

    // 폰 없는 동반자는 라운드마다 새 id 라 이름으로 한 사람으로 묶는다
    const offline = new Set(bundle.players.filter((r) => r.offline_player).map((r) => r.user_uid));
    for (const p of config.players) {
      const key = offline.has(p.id) ? `offline:${p.name || "?"}` : p.id;
      const mine = Math.round(net[p.id] ?? 0);
      const rank =
        caddieRank?.[p.id] ??
        rankGame?.order.find((r) => r.id === p.id)?.rank ??
        1 + config.players.filter((q) => Math.round(net[q.id] ?? 0) > mine).length;
      let gross = 0;
      let complete = true;
      let birdies = 0;
      let eagles = 0;
      for (const h of holes) {
        const rel = h.scores[p.id];
        if (rel == null) {
          complete = false;
          continue;
        }
        gross += h.par + rel;
        if (rel === -1) birdies++;
        else if (rel <= -2) eagles++;
      }

      const rec: RoundRecord = {
        roundId: bundle.round.id,
        date: dateOf(bundle),
        courseName: bundle.round.course_name,
        gameMode: config.gameMode,
        playerCount: config.players.length,
        holeCount: holes.length,
        rank,
        net: mine,
        money: isMoney,
        ...(paidIn && { paid: paidIn[p.id] ?? 0 }),
        ...(rankGame && !isMoney && { detail: rankScoreText(rankGame.rules.method, rankGame.score[p.id]) }),
        ...(isPoints && { points: round1(rankGame.score[p.id] ?? 0) }),
        gross: complete ? gross : null,
        birdies,
        eagles,
      };

      const cur =
        people.get(key) ??
        ({
          uid: key,
          name: p.name,
          photoUrl: null,
          rounds: 0,
          firsts: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          total: 0,
          avg18: null,
          best18: null,
          birdies: 0,
          eagles: 0,
          history: [],
          vsMe: null,
          strokesVsMe: null,
          points: null,
        } as PersonStats);
      cur.name = p.name || cur.name;
      cur.photoUrl = p.photoUrl ?? cur.photoUrl;
      cur.rounds++;
      // 1위: 금액이 있는 라운드는 딴(캐디피·내는 돈은 덜 낸) 1위만, 등수(금액 없음)는 그 라운드 1등
      if (rank === 1 && (isMoney ? mine > 0 : true)) cur.firsts++;
      if (isMoney) {
        if (mine > 0) cur.wins++;
        else if (mine < 0) cur.losses++;
        else cur.draws++;
        cur.total += mine;
      }
      cur.birdies += birdies;
      cur.eagles += eagles;
      cur.history.push(rec);
      people.set(key, cur);
    }
  }

  // 라운드별 내 기록 (타수 맞대결용)
  const myRounds = new Map((people.get(myUid)?.history ?? []).map((r) => [r.roundId, r]));

  for (const person of people.values()) {
    const full = person.history.filter((r) => r.holeCount === 18 && r.gross != null);
    if (full.length > 0) {
      person.avg18 = Math.round((full.reduce((s, r) => s + (r.gross as number), 0) / full.length) * 10) / 10;
      person.best18 = Math.min(...full.map((r) => r.gross as number));
    }
    person.history.reverse();
    person.points = pointStats(person.history, person.uid === myUid ? null : myRounds);

    if (person.uid !== myUid) {
      const vs = { win: 0, loss: 0, draw: 0, myTotal: 0, theirTotal: 0 };
      for (const r of person.history) {
        const nets = netByRound.get(r.roundId);
        const my = nets?.get(myUid);
        if (my == null) continue;
        const mine = Math.round(my);
        if (mine > r.net) vs.win++;
        else if (mine < r.net) vs.loss++;
        else vs.draw++;
        vs.myTotal += mine;
        vs.theirTotal += r.net;
      }
      person.vsMe = vs;
      person.strokesVsMe = strokesVs(person.history, myRounds);
    }
  }

  const list = [...people.values()].sort((a, b) => b.total - a.total || b.rounds - a.rounds);
  return {
    me: people.get(myUid) ?? null,
    people: list,
    roundCount: included,
    pointRoundCount: pointRounds,
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const avgOf = (xs: number[]) => (xs.length === 0 ? null : round1(xs.reduce((a, b) => a + b, 0) / xs.length));

/** 그 사람의 라운드들과 내 라운드 기록 → 둘 다 끝까지 친 라운드의 타수 맞대결 */
function strokesVs(history: RoundRecord[], mine: Map<string, RoundRecord>): StrokesVsMe | null {
  const pairs = history.flatMap((r) => {
    const m = mine.get(r.roundId);
    return m?.gross != null && r.gross != null ? [{ me: m.gross, them: r.gross, holes: r.holeCount }] : [];
  });
  if (pairs.length === 0) return null;
  const full = pairs.filter((x) => x.holes === 18);
  return {
    win: pairs.filter((x) => x.me < x.them).length,
    loss: pairs.filter((x) => x.me > x.them).length,
    draw: pairs.filter((x) => x.me === x.them).length,
    rounds: pairs.length,
    diff: round1(pairs.reduce((s, x) => s + x.them - x.me, 0) / pairs.length),
    myAvg18: avgOf(full.map((x) => x.me)),
    theirAvg18: avgOf(full.map((x) => x.them)),
  };
}

/** 사람별 낸 돈 → 똑같이 나눠 냈을 때보다 덜 낸 만큼 + / 더 낸 만큼 − (합 0) */
function splitGain(paid: Record<string, number>): Record<string, number> {
  const ids = Object.keys(paid);
  const share = ids.reduce((s, id) => s + paid[id], 0) / Math.max(1, ids.length);
  return Object.fromEntries(ids.map((id) => [id, share - paid[id]]));
}

/** 그 사람의 포인트 판들 → 포인트 기록. mine: 다른 사람이면 내 라운드별 기록 (맞대결용) */
function pointStats(history: RoundRecord[], mine: Map<string, RoundRecord> | null): PointStats | null {
  const recs = history.filter((r) => r.points != null);
  if (recs.length === 0) return null;
  const pts = recs.map((r) => r.points as number);
  const sum = (xs: number[]) => round1(xs.reduce((a, b) => a + b, 0));
  let vsMe: PointStats["vsMe"] = null;
  if (mine) {
    const pairs = recs.flatMap((r) => {
      const m = mine.get(r.roundId)?.points;
      return m != null ? [{ me: m, them: r.points as number }] : [];
    });
    vsMe = {
      win: pairs.filter((x) => x.me > x.them).length,
      loss: pairs.filter((x) => x.me < x.them).length,
      draw: pairs.filter((x) => x.me === x.them).length,
      myTotal: sum(pairs.map((x) => x.me)),
      theirTotal: sum(pairs.map((x) => x.them)),
    };
  }
  return {
    rounds: recs.length,
    total: sum(pts),
    firsts: recs.filter((r) => r.rank === 1).length,
    wins: pts.filter((v) => v > 0).length,
    losses: pts.filter((v) => v < 0).length,
    draws: pts.filter((v) => v === 0).length,
    vsMe,
  };
}

const dateOf = (b: RoundBundle) => b.round.date || b.round.created_at.slice(0, 10);
const keyOf = (b: RoundBundle) => `${dateOf(b)} ${b.round.created_at}`;

/* ---------- 불러오기 ---------- */

/** 한 번에 받는 라운드 수. 점수는 라운드당 최대 18홀 × 인원이라 응답 1,000행 제한을 넘지 않게 나눈다 */
const CHUNK = 8;
const PAGE = 1000;

export async function fetchRows<T>(table: string, select: string, ids: string[]): Promise<T[]> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const db = supabase;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const parts = await Promise.all(
    chunks.map(async (part) => {
      const rows: T[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from(table)
          .select(select)
          .in("round_id", part)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as T[]));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    })
  );
  return parts.flat();
}

let cache: { key: string; result: StatsResult } | null = null;

/**
 * 내 전적 불러오기. 라운드 목록을 이미 갖고 있으면 넘겨서 다시 받지 않는다.
 * 정산 확정 라운드와 수정 시각이 같으면 앞서 계산한 결과를 그대로 쓴다.
 */
export async function loadStats(myUid: string, rounds?: RoundListItem[]): Promise<StatsResult> {
  const list = rounds ?? (await listMyRounds());
  // 기록 모드(내기 없음)는 전적이 아니라 '라운드 기록'에서 따로 본다
  const done = list.filter((r) => r.status === "done" && r.rules.gameMode !== "record");
  const key = `${myUid}|${done.map((r) => `${r.id}@${r.updated_at}`).join(",")}`;
  if (cache?.key === key) return cache.result;

  const ids = done.map((r) => r.id);
  type HoleRow = { round_id: string; hole_index: number; par: number; saved_at?: string | null };
  const [players, holes, scores] = await Promise.all([
    fetchRows<RoundPlayerRow>("round_players", "*", ids),
    // 홀 저장 방식 라운드는 저장된 홀만 정산하므로 saved_at 도 받는다
    // (holesave.sql 을 아직 실행하지 않은 DB 면 그 칸 없이)
    fetchRows<HoleRow>("round_holes", "round_id,hole_index,par,saved_at", ids).catch((e) => {
      if (e?.code !== "42703") throw e;
      return fetchRows<HoleRow>("round_holes", "round_id,hole_index,par", ids);
    }),
    fetchRows<{ round_id: string; hole_index: number; player_uid: string; rel: number }>(
      "round_scores",
      "round_id,hole_index,player_uid,rel",
      ids
    ),
  ]);

  const bundles: RoundBundle[] = done.map(({ round_players: _rp, ...round }) => ({
    round,
    players: players
      .filter((p) => p.round_id === round.id)
      .sort((a, b) => a.seat_order - b.seat_order),
    holes: holes.filter((h) => h.round_id === round.id),
    scores: scores.filter((s) => s.round_id === round.id),
  }));

  const result = computeStats(bundles, myUid);
  cache = { key, result };
  return result;
}
