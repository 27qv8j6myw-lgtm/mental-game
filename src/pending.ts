import { supabase } from "./supabase";
import {
  getRoundMeta,
  saveHole as apiSaveHole,
  setHoleStat as apiSetHoleStat,
  setPar as apiSetPar,
  setScore as apiSetScore,
  type RoundBundle,
} from "./rounds";
import type { HoleStat } from "./types";

/*
 * 스코어·파(·기록 모드 상세 기록) 저장 대기열
 * 골프장에서 통신이 끊겨도 입력이 사라지지 않도록, 저장할 값을 먼저 기기(localStorage)에 보관한 뒤 서버로 보낸다.
 * 보내지 못한 값은 다시 연결되거나 앱이 다시 보일 때, 앱을 다시 열 때 순서대로 다시 보낸다.
 * 같은 칸(라운드·홀·사람)은 마지막 값만 남긴다. 홀 저장(hole)은 하나하나 순서대로 보낸다.
 */

export type SaveOp =
  | { kind: "score"; hole: number; player: string; rel: number | null }
  | { kind: "par"; hole: number; par: number }
  | { kind: "stat"; hole: number; player: string; stat: HoleStat }
  /**
   * 홀 저장(내기 라운드): 파·모든 스코어를 한 번에 확정한다.
   * baseVersion 은 저장 버튼을 누를 때 보던 홀의 version (다른 사람이 먼저 저장했으면 거절된다),
   * items 는 저장된 홀을 고칠 때 남길 수정 내역, by 는 저장한 사람(화면에 먼저 보여줄 때 씀)
   */
  | {
      kind: "hole";
      hole: number;
      par: number;
      scores: Record<string, number>;
      baseVersion: number;
      items: string[];
      by: string;
    };
type QueuedOp = SaveOp & { seq: number };

/** 라운드 id 별로 보관한다 (앱을 강제 종료해도 남는다) */
const KEY_PREFIX = "mentalgame-pending:";
/** 응답 없이 걸려 있는 요청은 이 시간 뒤 실패로 보고 나중에 다시 보낸다 */
const SEND_TIMEOUT_MS = 10_000;
/** 보내지 못했을 때 다시 시도하는 간격 */
const RETRY_MS = 15_000;

const queues = new Map<string, QueuedOp[]>();
/** 보내다 실패했거나 지난 실행에서 남은 대기열이 있는 라운드. '저장 대기' 표시 기준 */
const stalled = new Set<string>();
let seq = Date.now();

try {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(KEY_PREFIX)) continue;
    try {
      const ops = JSON.parse(localStorage.getItem(key) ?? "[]") as QueuedOp[];
      if (!Array.isArray(ops) || ops.length === 0) continue;
      const roundId = key.slice(KEY_PREFIX.length);
      queues.set(roundId, ops);
      stalled.add(roundId);
      for (const op of ops) seq = Math.max(seq, op.seq);
    } catch {
      /* 깨진 값은 건너뛴다 */
    }
  }
} catch {
  /* 저장소를 쓸 수 없는 환경: 이번 실행 동안만 메모리에 보관 */
}

type Listener = (recoveredRoundId?: string) => void;
const listeners = new Set<Listener>();
const emit = (recoveredRoundId?: string) => {
  for (const fn of listeners) fn(recoveredRoundId);
};

/** 대기열이 바뀔 때 호출. 밀려 있던 라운드의 대기열이나 홀 저장을 다 보내면 그 라운드 id 를 함께 넘긴다 */
export function subscribePending(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setQueue(roundId: string, ops: QueuedOp[]) {
  if (ops.length > 0) queues.set(roundId, ops);
  else queues.delete(roundId);
  try {
    if (ops.length > 0) localStorage.setItem(KEY_PREFIX + roundId, JSON.stringify(ops));
    else localStorage.removeItem(KEY_PREFIX + roundId);
  } catch {
    /* 저장소를 쓸 수 없으면 메모리에만 남는다 */
  }
  emit();
}

const sameCell = (a: SaveOp, b: SaveOp) => {
  if (a.hole !== b.hole || a.kind !== b.kind || a.kind === "hole" || b.kind === "hole") return false;
  return a.kind === "par" || (b.kind !== "par" && a.player === b.player);
};

/** 저장할 값을 대기열에 넣고 바로 보낸다. 같은 칸에 대기 중인 값은 새 값으로 바뀐다 */
export function queueSave(roundId: string, op: SaveOp) {
  const rest = (queues.get(roundId) ?? []).filter((o) => !sameCell(o, op));
  setQueue(roundId, [...rest, { ...op, seq: ++seq }]);
  kickPending();
}

/** 라운드를 나가거나 삭제했을 때: 더 보낼 곳이 없다 */
export function clearPending(roundId: string) {
  stalled.delete(roundId);
  setQueue(roundId, []);
}

/** 보내지 못하고 밀려 있는 저장이 걸린 홀 수. 처음 보내는 중인 값은 세지 않는다 */
export function waitingCount(roundId: string | null) {
  if (!roundId || !stalled.has(roundId)) return 0;
  return new Set((queues.get(roundId) ?? []).map((o) => o.hole)).size;
}

/** 서버에 아직 올라가지 않은 홀 저장이 있는 홀 번호들 ("2,3"). useSyncExternalStore 용으로 문자열 */
export function pendingHoleKey(roundId: string | null) {
  if (!roundId) return "";
  const holes = (queues.get(roundId) ?? []).filter((o) => o.kind === "hole").map((o) => o.hole);
  return [...new Set(holes)].sort((a, b) => a - b).join(",");
}

/**
 * 서버가 거절해 버린 저장. conflict: 다른 사람이 먼저 저장·수정함 / denied: 권한·값 문제 /
 * locked: 통신이 끊긴 사이 그 홀이 저장(또는 라운드가 확정)돼서 이 폰에서 넣은 점수·파가 반영되지 않음
 */
export interface HoleRejection {
  roundId: string;
  hole: number;
  reason: "conflict" | "denied" | "locked";
}
const rejectionListeners = new Set<(r: HoleRejection) => void>();
export function subscribeHoleRejections(fn: (r: HoleRejection) => void) {
  rejectionListeners.add(fn);
  return () => {
    rejectionListeners.delete(fn);
  };
}

export function applyOp(b: RoundBundle, op: SaveOp): RoundBundle {
  if (op.kind === "par") {
    const prev = b.holes.find((h) => h.hole_index === op.hole);
    const rest = b.holes.filter((h) => h.hole_index !== op.hole);
    return { ...b, holes: [...rest, { ...prev, hole_index: op.hole, par: op.par }] };
  }
  if (op.kind === "hole") {
    const holes = [
      ...b.holes.filter((h) => h.hole_index !== op.hole),
      {
        hole_index: op.hole,
        par: op.par,
        saved_at: new Date().toISOString(),
        saved_by: op.by,
        version: op.baseVersion + 1,
      },
    ];
    const scores = [
      ...b.scores.filter((s) => s.hole_index !== op.hole || !(s.player_uid in op.scores)),
      ...Object.entries(op.scores).map(([player_uid, rel]) => ({ hole_index: op.hole, player_uid, rel })),
    ];
    return { ...b, holes, scores };
  }
  if (op.kind === "stat") {
    const rest = (b.stats ?? []).filter(
      (s) => !(s.hole_index === op.hole && s.player_uid === op.player)
    );
    return { ...b, stats: [...rest, { hole_index: op.hole, player_uid: op.player, ...op.stat }] };
  }
  const rest = b.scores.filter((s) => !(s.hole_index === op.hole && s.player_uid === op.player));
  const scores =
    op.rel === null ? rest : [...rest, { hole_index: op.hole, player_uid: op.player, rel: op.rel }];
  return { ...b, scores };
}

/** 서버에서 받은 라운드에 아직 저장되지 않은 값을 덮어 쓴다 (화면에서 사라지지 않게) */
export function withPending(b: RoundBundle): RoundBundle {
  return (queues.get(b.round.id) ?? []).reduce(applyOp, b);
}

/* ---------------- 보내기 ---------------- */

let uid: string | null = null;
let flushing = false;
let flushAgain = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** 로그인한 사용자. 로그인 전에는 보내지 않는다 (권한 오류로 버려지지 않게) */
export function setPendingUser(next: string | null) {
  uid = next;
  kickPending();
}

export function kickPending() {
  void flushAll();
}

// 다시 연결되거나 앱이 다시 보일 때
window.addEventListener("online", kickPending);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") kickPending();
});

async function flushAll() {
  if (flushing) {
    flushAgain = true;
    return;
  }
  flushing = true;
  try {
    do {
      flushAgain = false;
      await flushOnce();
    } while (flushAgain);
  } finally {
    flushing = false;
  }
}

async function flushOnce() {
  const me = uid;
  if (!me || !supabase || queues.size === 0) return;
  try {
    // 세션이 풀린 채(익명 키로) 보내면 권한 오류가 나거나 지운 값이 반영되지 않는다
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== me) throw new Error("로그인 세션을 확인하지 못했어요");
    for (const roundId of [...queues.keys()]) await flushRound(roundId, me);
  } catch (e) {
    console.error("스코어 저장 실패: 나중에 다시 보냄", e);
    for (const id of queues.keys()) stalled.add(id);
    emit();
    if (!retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        kickPending();
      }, RETRY_MS);
    }
  }
}

async function flushRound(roundId: string, me: string) {
  if (stalled.has(roundId)) {
    // 끊긴 사이 라운드가 삭제되거나 종료됐을 수 있다. 종료된 라운드의 스코어·파는 방장만 고칠 수 있다
    // (기록 모드는 종료 뒤에도 각자 자기 기록을, 내기 라운드도 본인 상세 기록은 고칠 수 있다)
    const meta = await withTimeout((signal) => getRoundMeta(roundId, signal));
    if (!meta) {
      console.warn("더 이상 볼 수 없는 라운드라 저장 대기 기록을 버림", roundId);
      setQueue(roundId, []);
    } else if (meta.status === "done" && meta.host_uid !== me && meta.gameMode !== "record") {
      // (종료된 라운드의 홀 저장도 방장만: 비방장 것은 버린다)
      const keep = (queues.get(roundId) ?? []).filter((o) => o.kind === "stat" && o.player === me);
      if (keep.length !== queues.get(roundId)?.length) {
        console.warn("종료된 라운드라 스코어·파 저장 대기 기록을 버림", roundId);
        setQueue(roundId, keep);
      }
    }
  }
  // 홀 저장을 보냈으면 다 보낸 뒤 서버 값(저장한 사람·때, 수정 내역)으로 다시 맞춘다
  let refreshAfter = false;
  /** 잠긴 홀이라 거절된 점수·파 (홀마다 한 번만 알린다) */
  const lockedHoles = new Set<number>();
  for (;;) {
    const op = queues.get(roundId)?.[0];
    if (!op) break;
    if (op.kind === "hole") refreshAfter = true;
    try {
      await withTimeout((signal) => send(roundId, op, signal));
    } catch (e) {
      if (!isRejected(e)) throw e;
      console.error("서버가 거절한 기록이라 버림", e);
      if (op.kind === "hole") {
        const reason = isConflict(e) ? "conflict" : "denied";
        for (const fn of rejectionListeners) fn({ roundId, hole: op.hole, reason });
      } else if ((op.kind === "score" || op.kind === "par") && isLocked(e) && !lockedHoles.has(op.hole)) {
        lockedHoles.add(op.hole);
        refreshAfter = true;
        for (const fn of rejectionListeners) fn({ roundId, hole: op.hole, reason: "locked" });
      }
    }
    // 보내는 사이 같은 칸에 새 값이 들어왔으면 그 값은 남겨 두고 다음 차례에 보낸다
    setQueue(roundId, (queues.get(roundId) ?? []).filter((o) => o.seq !== op.seq));
  }
  if (stalled.delete(roundId) || refreshAfter) emit(roundId);
}

const send = (roundId: string, op: SaveOp, signal: AbortSignal) =>
  op.kind === "score"
    ? apiSetScore(roundId, op.hole, op.player, op.rel, signal)
    : op.kind === "stat"
    ? apiSetHoleStat(roundId, op.hole, op.player, op.stat, signal)
    : op.kind === "hole"
    ? apiSaveHole(roundId, op.hole, op.par, op.scores, op.baseVersion, op.items, signal)
    : apiSetPar(roundId, op.hole, op.par, signal);

/** 저장된 홀·확정된 라운드라 바로 입력이 막힘 (holesave.sql 의 보호 트리거) */
const isLocked = (e: unknown) => {
  const msg = String((e as { message?: unknown } | null)?.message ?? "");
  return msg.includes("HOLE_SAVED") || msg.includes("ROUND_DONE");
};

/** 홀 저장 충돌: 보던 사이 다른 사람이 그 홀을 먼저 저장·수정함 (holesave.sql) */
const isConflict = (e: unknown) =>
  String((e as { message?: unknown } | null)?.message ?? "").includes("HOLE_CONFLICT");

/**
 * 다시 보내도 소용없는 거절: 라운드가 사라졌거나(23503) 더 이상 참여자가 아님·이미 저장된 홀·
 * 종료 후 방장 아님(42501), 허용 범위를 벗어난 값(23514·22023), 상세 기록 테이블(record.sql)이나
 * 홀 저장(holesave.sql)이 아직 없음(PGRST205·42P01·PGRST202), 홀 저장 충돌.
 * 버리지 않으면 대기열 맨 앞에 걸려 뒤의 스코어까지 못 보낸다
 */
const isRejected = (e: unknown) => {
  const code = (e as { code?: unknown } | null)?.code;
  return (
    code === "23503" ||
    code === "42501" ||
    code === "23514" ||
    code === "22023" ||
    code === "PGRST205" ||
    code === "PGRST202" ||
    code === "42P01" ||
    isConflict(e)
  );
};

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}
