import { bundleHoles, settledHoles } from "./model";
import { fetchRows } from "./stats";
import type { RoundBundle } from "./rounds";
import type { RoundListItem } from "./types";

/*
 * 라운드 목록에 이름 옆으로 보여 주는 타수.
 * 끝난 라운드는 친 타수, 진행 중이면 지금까지 친 홀의 파 대비 타수(+5, E, -1).
 * 정산과 같은 규칙으로 센다 (홀 최대 더블파, 홀 저장 라운드는 저장된 홀만)
 */

export interface PlayerScore {
  /** 친 홀까지의 타수 */
  strokes: number;
  /** 친 홀까지의 파 대비 타수 */
  toPar: number;
  /** 친(저장된) 홀 수 */
  played: number;
}

export interface RoundScoreLine {
  /** 사람별 타수 (한 홀도 치지 않은 사람은 없음) */
  players: Record<string, PlayerScore>;
  /** 진행 중이고 아직 다 치지 않았다 → 파 대비 타수로 보여 준다 */
  live: boolean;
  /** 가장 많이 친 사람 기준 친 홀 수 */
  played: number;
  holeCount: number;
}

type HoleRow = { round_id: string; hole_index: number; par: number; saved_at?: string | null };
type ScoreRow = { round_id: string; hole_index: number; player_uid: string; rel: number };

/** 한 라운드의 홀·스코어 행 → 사람별 타수 (네트워크 없이 계산만) */
export function scoreLine(
  r: RoundListItem,
  holeRows: Omit<HoleRow, "round_id">[],
  scoreRows: Omit<ScoreRow, "round_id">[]
): RoundScoreLine {
  // bundleHoles 는 참여자의 user_uid 만 쓴다
  const bundle = { round: r, players: r.round_players, holes: holeRows, scores: scoreRows } as unknown as RoundBundle;
  const holes = settledHoles(bundleHoles(bundle));
  const players: Record<string, PlayerScore> = {};
  let maxPlayed = 0;
  let unfinished = false;
  for (const p of r.round_players) {
    let rel = 0;
    let par = 0;
    let played = 0;
    for (const h of holes) {
      const v = h.scores[p.user_uid];
      if (v == null) continue;
      rel += v;
      par += h.par;
      played++;
    }
    if (played === 0) continue;
    maxPlayed = Math.max(maxPlayed, played);
    if (played < holes.length) unfinished = true;
    players[p.user_uid] = { strokes: par + rel, toPar: rel, played };
  }
  return { players, live: r.status !== "done" && unfinished, played: maxPlayed, holeCount: holes.length };
}

/** 라운드들의 타수를 받아 계산한다 (대기 중 라운드는 칠 홀이 없어 뺀다) */
export async function fetchScoreLines(rounds: RoundListItem[]): Promise<Record<string, RoundScoreLine>> {
  const targets = rounds.filter((r) => r.status !== "lobby");
  if (targets.length === 0) return {};
  const ids = targets.map((r) => r.id);
  const [holes, scores] = await Promise.all([
    // 홀 저장 칸(saved_at)이 없는 DB 면 그 칸 없이 (stats.ts 와 같게)
    fetchRows<HoleRow>("round_holes", "round_id,hole_index,par,saved_at", ids).catch((e) => {
      if (e?.code !== "42703") throw e;
      return fetchRows<HoleRow>("round_holes", "round_id,hole_index,par", ids);
    }),
    fetchRows<ScoreRow>("round_scores", "round_id,hole_index,player_uid,rel", ids),
  ]);
  const out: Record<string, RoundScoreLine> = {};
  for (const r of targets) {
    out[r.id] = scoreLine(
      r,
      holes.filter((h) => h.round_id === r.id),
      scores.filter((s) => s.round_id === r.id)
    );
  }
  return out;
}

/* ---------- 기기 보관 (홈을 열자마자 보여 주려고) ---------- */

const KEY = "mentalgame-round-scores-cache";
type Stored = { uid: string; lines: Record<string, { at: string; line: RoundScoreLine }> };

function read(uid: string): Stored["lines"] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null;
    return v && v.uid === uid && v.lines && typeof v.lines === "object" ? v.lines : {};
  } catch {
    return {};
  }
}

/** 보관해 둔 타수. fresh: 끝난 라운드 중 그 뒤로 바뀌지 않은 것 (다시 받지 않아도 된다) */
export function cachedScoreLines(uid: string, rounds: RoundListItem[]) {
  const saved = read(uid);
  const lines: Record<string, RoundScoreLine> = {};
  const fresh = new Set<string>();
  for (const r of rounds) {
    const s = saved[r.id];
    if (!s) continue;
    lines[r.id] = s.line;
    if (r.status === "done" && s.at === r.updated_at) fresh.add(r.id);
  }
  return { lines, fresh };
}

/** 받은 타수를 보관한다. 목록에 없는 라운드(삭제·나감)는 지운다 */
export function storeScoreLines(uid: string, rounds: RoundListItem[], lines: Record<string, RoundScoreLine>) {
  try {
    const saved = read(uid);
    const next: Stored["lines"] = {};
    for (const r of rounds) {
      const line = lines[r.id];
      if (line) next[r.id] = { at: r.updated_at, line };
      else if (saved[r.id]) next[r.id] = saved[r.id];
    }
    localStorage.setItem(KEY, JSON.stringify({ uid, lines: next } satisfies Stored));
  } catch {
    /* 저장소를 쓸 수 없으면 보관하지 않는다 */
  }
}
