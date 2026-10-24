import { supabase } from "./supabase";
import { apiUrl } from "./scorecard";
import { loadKga } from "./kga";
import type { StoredRules } from "./types";
import { isNativeApp, nativeAtLeast, requestNativeLocation } from "./native";

/** 폰 위치를 쓰기 시작하는 날 (개인정보처리방침 시행일, 7일 전에 알림) */
export const LOCATION_FROM = "2026-10-31";
const LOCATION_TIMEOUT = 15_000;

/*
 * 라운드 날씨 (기온·습도). 첫 홀과 끝나기 2홀 전(18홀이면 16번, 9홀이면 7번) 스코어를 저장할 때 한 번씩,
 * 그 저장을 한 폰이 골프장 좌표로 api/weather 에서 받아 라운드에 넣는다 (record.sql set_round_weather, 먼저 들어온 값이 남는다).
 * 좌표: KGA 목록에서 고른 골프장이면 미리 넣어 둔 좌표 (scripts/geocode-kga.mjs).
 * 목록에 없는 골프장(해외 포함)이면 그 폰의 대략적인 위치를 한 번 (iOS 앱 1.0.1 부터·브라우저, 이용자가 허락할 때만,
 * 개인정보처리방침 시행일 LOCATION_FROM 부터). 위치는 날씨를 받는 데만 쓰고 저장하지 않는다. 둘 다 없으면 비워 둔다.
 * 오프라인 저장이거나 받지 못하면 조용히 건너뛴다 (라운드 진행에 영향 없음)
 */

export type WeatherSlot = "start" | "end";
export interface WeatherObs {
  /** ℃ */
  temp: number;
  /** % */
  humidity: number;
  /** 받은 때 (한국 시간 YYYY-MM-DDTHH:MM) */
  at: string;
  src: string;
}
export interface RoundWeather {
  start?: WeatherObs;
  end?: WeatherObs;
}
export interface Coords {
  lat: number;
  lon: number;
}

/** 이 홀 스코어를 저장할 때 받을 날씨 칸 (첫 홀 · 끝나기 2홀 전) */
export function weatherSlot(holeIndex: number, holeCount: number): WeatherSlot | null {
  if (holeIndex === 0) return "start";
  if (holeCount >= 6 && holeIndex === holeCount - 3) return "end";
  return null;
}

const isObs = (v: unknown): v is WeatherObs =>
  !!v && typeof (v as WeatherObs).temp === "number" && typeof (v as WeatherObs).humidity === "number";

/** rules 에서 꺼낸 날씨 (없으면 null) */
export function weatherOf(rules: { weather?: unknown } | null | undefined): RoundWeather | null {
  const w = rules?.weather as RoundWeather | undefined;
  if (!w) return null;
  const out: RoundWeather = {};
  if (isObs(w.start)) out.start = w.start;
  if (isObs(w.end)) out.end = w.end;
  return out.start || out.end ? out : null;
}

const deg = (t: number) => `${Math.round(t)}°`;

/** "기온 18° → 22° · 습도 60% → 45%" (하나만 있으면 그 값만) */
export function weatherText(w: RoundWeather): string {
  const a = w.start;
  const b = w.end;
  if (a && b) return `기온 ${deg(a.temp)} → ${deg(b.temp)} · 습도 ${a.humidity}% → ${b.humidity}%`;
  const one = (a ?? b)!;
  return `기온 ${deg(one.temp)} · 습도 ${one.humidity}%`;
}

/** KGA 목록에서 고른 골프장이면 그 좌표 */
export async function courseCoords(rules: StoredRules): Promise<Coords | null> {
  const club = rules.rating?.club;
  if (!club) return null;
  const data = await loadKga().catch(() => null);
  const c = data?.clubs.find((x) => x.name === club);
  return c?.lat != null && c?.lon != null ? { lat: c.lat, lon: c.lon } : null;
}

const todaySeoul = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** 소수 둘째 자리(약 1km)로 줄여 보낸다 (날씨에는 이 정도면 충분하다) */
const coarse = (c: Coords): Coords => ({ lat: Math.round(c.lat * 100) / 100, lon: Math.round(c.lon * 100) / 100 });

/** 폰의 대략적인 위치 한 번 (허락하지 않았거나 받지 못하면 null) */
export async function deviceCoords(today = todaySeoul()): Promise<Coords | null> {
  if (today < LOCATION_FROM) return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), LOCATION_TIMEOUT));
  if (isNativeApp()) {
    // 위치 요청을 받는 앱(1.0.1)부터. 예전 앱은 위치 권한 문구가 없어 묻지 않는다
    if (!nativeAtLeast("1.0.1")) return null;
    const r = await Promise.race([requestNativeLocation(), timeout]);
    return r?.lat != null && r?.lon != null ? coarse({ lat: r.lat, lon: r.lon }) : null;
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  const pos = new Promise<Coords | null>((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(coarse({ lat: p.coords.latitude, lon: p.coords.longitude })),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: LOCATION_TIMEOUT, maximumAge: 10 * 60_000 }
    )
  );
  return Promise.race([pos, timeout]);
}

/** 지금 날씨를 받아 라운드에 넣는다. 넣었으면 true (이미 있었거나 받지 못하면 false) */
export async function captureWeather(roundId: string, slot: WeatherSlot, at: Coords): Promise<boolean> {
  if (!supabase) return false;
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch(apiUrl("weather"), {
    method: "POST",
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify({ lat: at.lat, lon: at.lon }),
  });
  if (!res.ok) return false;
  const obs = (await res.json()) as { temp: number; humidity: number; src: string };
  const kst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16);
  const { data, error } = await supabase.rpc("set_round_weather", {
    p_round_id: roundId,
    p_slot: slot,
    p_value: { temp: obs.temp, humidity: obs.humidity, src: obs.src, at: kst },
  });
  if (error) throw error;
  return data === true;
}

/** 이번 앱 실행에서 이미 시도한 라운드 칸 (같은 홀을 여러 번 저장해도 한 번만) */
const tried = new Set<string>();

/**
 * 홀 스코어를 저장한 뒤 부른다: 그 홀이 날씨 칸이고 아직 비어 있으면 받아 넣는다 (기다리지 않는다).
 * 넣었으면 onSaved (라운드를 다시 받아 화면에 보이게)
 */
export function maybeCaptureWeather(
  round: { id: string; hole_count: number; status: string; rules: StoredRules },
  holeIndex: number,
  onSaved?: () => void
) {
  const slot = weatherSlot(holeIndex, round.hole_count);
  if (!slot || round.status !== "playing") return;
  if (weatherOf(round.rules)?.[slot]) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const key = `${round.id}:${slot}`;
  if (tried.has(key)) return;
  tried.add(key);
  void (async () => {
    const at = (await courseCoords(round.rules)) ?? (await deviceCoords());
    if (!at) return;
    if (await captureWeather(round.id, slot, at)) onSaved?.();
  })().catch((e) => console.warn("날씨를 받지 못함", e));
}
