import { supabase } from "./supabase";
import { totalNet } from "./betting";
import { bundleConfig, bundleHoles } from "./model";
import { listMyRounds, type RoundBundle } from "./rounds";
import type { GameMode, Gender, RoundListItem, RoundPlayerRow } from "./types";

/*
 * 전적: 내가 볼 수 있는(=내가 참여한) 정산 확정 라운드로 사람마다 기록과 누적 금액을 모은다.
 * 금액은 핸디캡까지 포함해 실제로 주고받은 돈 (사전·사후 정산 모두, 타수 보정은 핸디 금액 0).
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
  /** 금액 기준 순위 (같은 금액은 같은 순위) */
  rank: number;
  net: number;
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
  gender: Gender;
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
}

export interface StatsResult {
  me: PersonStats | null;
  /** 누적 금액 순 (나 포함) */
  people: PersonStats[];
  roundCount: number;
}

/** 라운드 묶음들 → 사람별 전적 (네트워크 없이 계산만, 테스트 가능) */
export function computeStats(bundles: RoundBundle[], myUid: string): StatsResult {
  const people = new Map<string, PersonStats>();
  // 사람마다 라운드별 금액 (맞대결 계산용)
  const netByRound = new Map<string, Map<string, number>>();

  // 오래된 라운드부터 → 이름·사진은 가장 최근 라운드 것으로 덮인다
  const ordered = [...bundles].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));

  for (const bundle of ordered) {
    const config = bundleConfig(bundle);
    const holes = bundleHoles(bundle);
    if (config.players.length < 2 || config.gameMode === "record") continue;
    const { net } = totalNet(config, holes, true);
    netByRound.set(bundle.round.id, new Map(Object.entries(net)));

    for (const p of config.players) {
      const mine = Math.round(net[p.id] ?? 0);
      const rank = 1 + config.players.filter((q) => Math.round(net[q.id] ?? 0) > mine).length;
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
        gross: complete ? gross : null,
        birdies,
        eagles,
      };

      const cur =
        people.get(p.id) ??
        ({
          uid: p.id,
          name: p.name,
          photoUrl: null,
          gender: p.gender,
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
        } as PersonStats);
      cur.name = p.name || cur.name;
      cur.photoUrl = p.photoUrl ?? cur.photoUrl;
      cur.gender = p.gender;
      cur.rounds++;
      if (rank === 1 && mine > 0) cur.firsts++;
      if (mine > 0) cur.wins++;
      else if (mine < 0) cur.losses++;
      else cur.draws++;
      cur.total += mine;
      cur.birdies += birdies;
      cur.eagles += eagles;
      cur.history.push(rec);
      people.set(p.id, cur);
    }
  }

  for (const person of people.values()) {
    const full = person.history.filter((r) => r.holeCount === 18 && r.gross != null);
    if (full.length > 0) {
      person.avg18 = Math.round((full.reduce((s, r) => s + (r.gross as number), 0) / full.length) * 10) / 10;
      person.best18 = Math.min(...full.map((r) => r.gross as number));
    }
    person.history.reverse();

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
    }
  }

  const list = [...people.values()].sort((a, b) => b.total - a.total || b.rounds - a.rounds);
  return {
    me: people.get(myUid) ?? null,
    people: list,
    roundCount: netByRound.size,
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
  const [players, holes, scores] = await Promise.all([
    fetchRows<RoundPlayerRow>("round_players", "*", ids),
    fetchRows<{ round_id: string; hole_index: number; par: number }>(
      "round_holes",
      "round_id,hole_index,par",
      ids
    ),
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
