/*
 * 라운드 날씨 (Vercel 함수, POST /api/weather {lat, lon}) — 로그인한 사용자만
 * 첫 홀과 끝나기 2홀 전 스코어를 저장할 때 앱이 골프장 좌표를 보내면 지금 기온·습도를 돌려준다 (앱이 라운드에 저장).
 * - 한국 안: 기상청 단기예보 조회서비스 초단기실황(getUltraSrtNcst). 위·경도를 기상청 격자(nx, ny)로 바꿔 기온(T1H)·습도(REH)
 * - 한국 밖(또는 기상청이 안 될 때): Open-Meteo 현재 날씨 (키 없음)
 * - 필요한 환경변수: KMA_SERVICE_KEY (data.go.kr 일반 인증키, Decoding), VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *   (KMA_URL·OPEN_METEO_URL 은 로컬 시험 때만 바꾼다)
 */

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const KMA = env.KMA_URL ?? "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
const OPEN_METEO = env.OPEN_METEO_URL ?? "https://api.open-meteo.com/v1/forecast";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** 로그인한 사용자인지 Supabase 에 묻는다 (아무나 이 함수를 부르지 못하게) */
async function signedIn(token: string): Promise<boolean> {
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return false;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` } });
    return r.ok;
  } catch {
    return false;
  }
}

/** 기상청 격자 안 (제주·울릉·독도 포함, 대략) */
export const inKorea = (lat: number, lon: number) => lat >= 32.9 && lat <= 38.9 && lon >= 124.5 && lon <= 131.9;

/** 위·경도 → 기상청 동네예보 격자 (람베르트 정각원추도법, 기상청 안내 공식) */
export function kmaGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const D = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = SLAT1 * D;
  const slat2 = SLAT2 * D;
  const olon = OLON * D;
  const olat = OLAT * D;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * D - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}

/**
 * 초단기실황 기준 시각: 매시 정각 자료가 40분쯤 올라와서 45분 전이면 한 시간 앞 자료 (한국 시간)
 * → { date: "20261023", time: "1400" }
 */
export function kmaBase(now: Date): { date: string; time: string } {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  if (kst.getUTCMinutes() < 45) kst.setUTCHours(kst.getUTCHours() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}`,
    time: `${p(kst.getUTCHours())}00`,
  };
}

type Obs = { temp: number; humidity: number; src: "kma" | "open-meteo" };

async function fromKma(lat: number, lon: number, key: string): Promise<Obs | null> {
  const { nx, ny } = kmaGrid(lat, lon);
  const { date, time } = kmaBase(new Date());
  const q = new URLSearchParams({
    serviceKey: key,
    pageNo: "1",
    numOfRows: "10",
    dataType: "JSON",
    base_date: date,
    base_time: time,
    nx: String(nx),
    ny: String(ny),
  });
  const r = await fetch(`${KMA}?${q}`);
  if (!r.ok) return null;
  const body = (await r.json().catch(() => null)) as {
    response?: { body?: { items?: { item?: { category: string; obsrValue: string }[] } } };
  } | null;
  const items = body?.response?.body?.items?.item ?? [];
  const val = (c: string) => {
    const v = Number(items.find((i) => i.category === c)?.obsrValue);
    return Number.isFinite(v) ? v : null;
  };
  const temp = val("T1H");
  const humidity = val("REH");
  return temp == null || humidity == null ? null : { temp, humidity, src: "kma" };
}

async function fromOpenMeteo(lat: number, lon: number): Promise<Obs | null> {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,relative_humidity_2m",
  });
  const r = await fetch(`${OPEN_METEO}?${q}`);
  if (!r.ok) return null;
  const body = (await r.json().catch(() => null)) as {
    current?: { temperature_2m?: number; relative_humidity_2m?: number };
  } | null;
  const temp = body?.current?.temperature_2m;
  const humidity = body?.current?.relative_humidity_2m;
  return typeof temp === "number" && typeof humidity === "number" ? { temp, humidity, src: "open-meteo" } : null;
}

export async function POST(request: Request): Promise<Response> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s*/i, "");
  if (!(await signedIn(token))) return json(401, { error: "UNAUTHORIZED" });
  const body = (await request.json().catch(() => null)) as { lat?: unknown; lon?: unknown } | null;
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return json(400, { error: "BAD_COORDS" });
  try {
    let obs: Obs | null = null;
    if (inKorea(lat, lon) && env.KMA_SERVICE_KEY) obs = await fromKma(lat, lon, env.KMA_SERVICE_KEY).catch(() => null);
    obs ??= await fromOpenMeteo(lat, lon);
    if (!obs) return json(502, { error: "NO_WEATHER" });
    return json(200, { temp: Math.round(obs.temp * 10) / 10, humidity: Math.round(obs.humidity), src: obs.src });
  } catch (e) {
    console.error("날씨를 받지 못함", e);
    return json(502, { error: "NO_WEATHER" });
  }
}
