import { useEffect, useRef, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { sendWatchContext, watchSupported, type WatchContext } from "./native";
import type { Session } from "./types";

/*
 * 애플워치로 기록하기 (기록 모드, iOS 앱).
 * 내 정보 → 애플워치에서 켜 두면, 폰에서 기록 모드 라운드를 열 때 그 라운드의 '내 기록만 쓰는 24시간 열쇠'를 받아
 * 앱을 거쳐 워치에 넘긴다 (supabase/watch.sql watch_link). 워치는 그 열쇠로 바로 서버에 저장하고,
 * 폰 화면은 실시간 구독으로 따라 바뀐다. 워치는 폰마다 짝지으니 설정은 이 기기에 둔다
 */

const SETTING_KEY = "mentalgame-watch-record";
const LINK_KEY = "mentalgame-watch-link";
/** 열쇠가 이만큼도 안 남았으면 새로 받는다 */
const RENEW_MS = 2 * 60 * 60 * 1000;
/** 워치가 부를 Supabase 주소·공개 키 (웹과 같다) */
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function readSetting(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) === "1";
  } catch {
    return false;
  }
}

/** '기록 모드에서 워치 사용' 켬/끔 */
export function useWatchSetting(): boolean {
  return useSyncExternalStore(subscribe, readSetting);
}

export function setWatchSetting(on: boolean) {
  try {
    localStorage.setItem(SETTING_KEY, on ? "1" : "0");
  } catch {
    /* 저장이 막힌 기기면 이번 실행에서만 */
  }
  if (!on) clearWatchLink();
  listeners.forEach((fn) => fn());
}

type StoredLink = { uid: string; roundId: string; token: string; expiresAt: string };

function readLinkAny(): StoredLink | null {
  try {
    return JSON.parse(localStorage.getItem(LINK_KEY) ?? "null") as StoredLink | null;
  } catch {
    return null;
  }
}

function readLink(uid: string, roundId: string): StoredLink | null {
  const v = readLinkAny();
  if (!v || v.uid !== uid || v.roundId !== roundId) return null;
  return Date.parse(v.expiresAt) - Date.now() > RENEW_MS ? v : null;
}

/** 워치에서 라운드를 내리고 보관한 열쇠를 버린다 (설정을 끄거나 로그아웃할 때) */
export function clearWatchLink() {
  try {
    if (localStorage.getItem(LINK_KEY) == null) return;
    localStorage.removeItem(LINK_KEY);
  } catch {
    /* 없으면 그만 */
  }
  sendWatchContext(null);
}

/** 이 라운드의 워치 열쇠 (보관한 게 넉넉히 남았으면 그대로) */
async function linkFor(uid: string, roundId: string): Promise<StoredLink> {
  const kept = readLink(uid, roundId);
  if (kept) return kept;
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const { data, error } = await supabase.rpc("watch_link", { p_round_id: roundId });
  if (error) throw error;
  const link: StoredLink = {
    uid,
    roundId,
    token: data as string,
    // 서버는 24시간을 준다. 시계가 조금 달라도 넉넉하게 23시간으로 본다
    expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
  };
  try {
    localStorage.setItem(LINK_KEY, JSON.stringify(link));
  } catch {
    /* 보관을 못 하면 다음에 다시 받는다 */
  }
  return link;
}

/**
 * 기록 모드 라운드를 열어 두는 동안 워치에 라운드를 보낸다 (App 이 라운드와 함께 둔다).
 * 라운드를 닫아도 워치는 그대로 쓴다. 라운드가 끝나면 워치에서 내린다
 */
export function useWatchLink(session: Session | null, roundId: string | null, myUid: string) {
  const on = useWatchSetting();
  const record = session?.config.gameMode === "record";
  const mine = !!session?.config.players.some((p) => p.id === myUid);
  const status = session?.status;
  const ready = on && watchSupported() && !!roundId && record && mine;
  const hole = session?.currentHole ?? 0;
  const course = session?.config.courseName ?? "";
  const sent = useRef<string>("");

  useEffect(() => {
    if (!ready || !roundId) return;
    if (status === "done") {
      // 끝난 라운드: 이 라운드를 보냈었다면 워치에서 내린다
      if (readLinkAny()?.roundId === roundId) clearWatchLink();
      return;
    }
    if (status !== "playing") return;
    let alive = true;
    linkFor(myUid, roundId)
      .then((link) => {
        if (!alive || !supabase) return;
        const ctx: WatchContext = {
          url: SUPABASE_URL,
          anonKey: SUPABASE_ANON_KEY,
          token: link.token,
          roundId,
          course,
          hole,
          expiresAt: link.expiresAt,
        };
        const key = JSON.stringify(ctx);
        if (key === sent.current) return;
        sent.current = key;
        sendWatchContext(ctx);
      })
      .catch((e) => console.warn("워치 연결 실패", e));
    return () => {
      alive = false;
    };
  }, [ready, roundId, status, myUid, hole, course]);
}
