import { useSyncExternalStore } from "react";
import { listMyRounds } from "./rounds";
import type { RoundListItem } from "./types";

/*
 * 내 라운드 목록(홈과 종 알림이 같이 쓴다)과 오른쪽 위 종 알림.
 * 목록은 마지막으로 받은 것을 기기에 보관해 두고(통신이 없어도 홈에 보여 준다), 라운드를 끝내거나 나가면 바로 고친다.
 * 알림은 목록에서 만든다: 날짜가 지났는데 끝나지 않은 라운드·시작하지 않은 대기실.
 * 다른 기능은 setNoticeSource 로 자기 알림을 올린다 (시즌 목표 달성 goals.ts, 새 배지 badges.ts)
 */

const LIST_KEY = "mentalgame-rounds-cache";
const SEEN_KEY = "mentalgame-notice-seen";
/** 이보다 오래된 목록은 종을 열거나 앱으로 돌아올 때 다시 받는다 */
const STALE_MS = 30_000;

type ListState = { uid: string; list: RoundListItem[]; at: number };
let state: ListState = { uid: "", list: [], at: 0 };
let seen: { uid: string; ids: Set<string> } = { uid: "", ids: new Set() };
let inflight: Promise<RoundListItem[]> | null = null;
/** 다른 기능이 올린 알림 (기능 이름 → 알림) */
let sources: Record<string, NoticeItem[]> = {};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function readListCache(uid: string): RoundListItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(LIST_KEY) ?? "null") as { uid: string; list: RoundListItem[] } | null;
    return v && v.uid === uid && Array.isArray(v.list) ? v.list : [];
  } catch {
    return [];
  }
}
function writeListCache(uid: string, list: RoundListItem[]) {
  try {
    if (uid) localStorage.setItem(LIST_KEY, JSON.stringify({ uid, list }));
  } catch {
    /* 저장소를 쓸 수 없으면 보관하지 않는다 */
  }
}

/** 다른 사람으로 바뀌었으면 그 사람이 보관해 둔 목록부터 */
function ensure(uid: string) {
  if (state.uid === uid) return;
  state = { uid, list: uid ? readListCache(uid) : [], at: 0 };
  inflight = null;
  sources = {};
}

/** 내 라운드 목록 (최근 만든 순) */
export function useMyRounds(uid: string): RoundListItem[] {
  return useSyncExternalStore(subscribe, () => {
    ensure(uid);
    return state.list;
  });
}

export function setMyRounds(uid: string, list: RoundListItem[]) {
  ensure(uid);
  state = { uid, list, at: Date.now() };
  writeListCache(uid, list);
  emit();
}

/** 목록을 서버에서 다시 받는다. maxAge 안에 받은 적이 있으면 그대로 */
export async function refreshMyRounds(uid: string, maxAge = 0): Promise<RoundListItem[]> {
  ensure(uid);
  if (!uid) return [];
  if (maxAge > 0 && Date.now() - state.at < maxAge) return state.list;
  if (inflight) return inflight;
  const run = listMyRounds()
    .then((list) => {
      if (state.uid === uid) setMyRounds(uid, list);
      return list;
    })
    .finally(() => {
      if (inflight === run) inflight = null;
    });
  inflight = run;
  return run;
}

/** 목록의 라운드 하나를 바로 고친다 (null 이면 뺀다). 목록에 없으면 그대로 */
export function patchListRound(id: string, patch: Partial<RoundListItem> | null) {
  const i = state.list.findIndex((r) => r.id === id);
  if (i < 0) return;
  const cur = state.list[i];
  if (patch && Object.entries(patch).every(([k, v]) => cur[k as keyof RoundListItem] === v)) return;
  const list = patch ? state.list.map((r, j) => (j === i ? { ...r, ...patch } : r)) : state.list.filter((_, j) => j !== i);
  state = { ...state, list };
  writeListCache(state.uid, list);
  emit();
}

// ── 종 알림 ──

/** 알림을 눌러 여는 페이지 (내 정보 안) */
export type NoticePage = "goals" | "badges";
const PAGE_EVENT = "mg-open-page";
/** 알림에서 페이지 열기 (App 이 받아 내 정보의 그 페이지로) */
export const openNoticePage = (page: NoticePage) =>
  window.dispatchEvent(new CustomEvent<NoticePage>(PAGE_EVENT, { detail: page }));
export function onNoticePage(fn: (page: NoticePage) => void) {
  const h = (e: Event) => fn((e as CustomEvent<NoticePage>).detail);
  window.addEventListener(PAGE_EVENT, h);
  return () => window.removeEventListener(PAGE_EVENT, h);
}

export interface NoticeItem {
  /** 본 알림을 기억하는 키 */
  id: string;
  kind: "overdue" | "goal" | "badge";
  title: string;
  /** 골프장 · 날짜 */
  sub: string;
  /** 할 일 ("눌러서 종료해 주세요") */
  hint?: string;
  /** 누르면 열 라운드 */
  roundId?: string;
  /** 누르면 열 페이지 */
  page?: NoticePage;
}

export function setNoticeSource(key: string, items: NoticeItem[]) {
  const prev = sources[key] ?? [];
  if (prev.length === items.length && prev.every((p, i) => p.id === items[i].id && p.sub === items[i].sub)) return;
  sources = { ...sources, [key]: items };
  emit();
}
const sourcesSnapshot = () => sources;

const todaySeoul = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const roundDay = (r: RoundListItem) =>
  r.date || new Date(r.created_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** "2026-10-21" → "10월 21일" (올해가 아니면 연도도) */
function dayLabel(d: string, today: string) {
  const [y, m, day] = d.split("-").map(Number);
  const md = `${m}월 ${day}일`;
  return d.slice(0, 4) === today.slice(0, 4) ? md : `${y}년 ${md}`;
}

/** 날짜(한국 시간)가 오늘보다 앞인데 끝나지 않은 라운드 */
export function overdueNotices(uid: string, list: RoundListItem[], today = todaySeoul()): NoticeItem[] {
  return list
    .filter((r) => r.status !== "done" && roundDay(r) < today)
    .sort((a, b) => roundDay(b).localeCompare(roundDay(a)))
    .map((r) => {
      const host = r.host_uid === uid;
      const lobby = r.status === "lobby";
      const hint = lobby
        ? host
          ? "눌러서 시작하거나 삭제해 주세요"
          : "눌러서 나갈 수 있어요"
        : host
          ? "눌러서 종료해 주세요"
          : "방장이 종료해야 해요";
      return {
        id: `overdue:${r.id}:${r.status}`,
        kind: "overdue" as const,
        title: lobby ? "시작하지 않은 대기실이 있어요" : "끝나지 않은 라운드가 있어요",
        sub: `${r.course_name || "라운드"} · ${dayLabel(roundDay(r), today)}`,
        hint,
        roundId: r.id,
      };
    });
}

function ensureSeen(uid: string) {
  if (seen.uid === uid) return;
  let ids: string[] = [];
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null") as { uid: string; ids: string[] } | null;
    if (v && v.uid === uid && Array.isArray(v.ids)) ids = v.ids;
  } catch {
    /* 없으면 처음부터 */
  }
  seen = { uid, ids: new Set(ids) };
}
const seenSnapshot = () => seen.ids;

/** 지금 보이는 알림을 다 본 것으로 (지금 없는 알림은 지운다) */
export function markNoticesSeen(uid: string, items: NoticeItem[]) {
  ensureSeen(uid);
  const ids = new Set(items.map((i) => i.id));
  if (ids.size === seen.ids.size && [...ids].every((id) => seen.ids.has(id))) return;
  seen = { uid, ids };
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ uid, ids: [...ids] }));
  } catch {
    /* 기억하지 못하면 다음에 점이 다시 보일 뿐 */
  }
  emit();
}

/** 종 알림 목록, 본 알림, 아직 안 본 알림이 있는지 */
export function useNotices(uid: string): { items: NoticeItem[]; seen: Set<string>; unseen: boolean } {
  const list = useMyRounds(uid);
  const seenIds = useSyncExternalStore(subscribe, () => {
    ensureSeen(uid);
    return seenSnapshot();
  });
  const extra = useSyncExternalStore(subscribe, sourcesSnapshot);
  const items = uid ? [...Object.values(extra).flat(), ...overdueNotices(uid, list)] : [];
  return { items, seen: seenIds, unseen: items.some((i) => !seenIds.has(i.id)) };
}

export { STALE_MS as NOTICE_STALE_MS };
