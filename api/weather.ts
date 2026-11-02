/*
 * 라운드 날씨 (Vercel 함수, POST /api/weather {lat, lon}) — 로그인한 사용자만
 * 첫 홀과 끝나기 2홀 전 스코어를 저장할 때 앱이 골프장 좌표를 보내면 지금 기온·습도를 돌려준다 (앱이 라운드에 저장).
 * - 한국 안: 기상청 단기예보 조회서비스 초단기실황(getUltraSrtNcst). 위·경도를 기상청 격자(nx, ny)로 바꿔 기온(T1H)·습도(REH)
 * - 한국 밖(또는 기상청이 안 될 때): Open-Meteo 현재 날씨 (키 없음)
 * 대기실 예보 (POST {lat, lon, date: "2026-11-02", time: "07:30", src: "course" | "device"}): 티오프 시각부터 5시간,
 *   정시마다 기온·습도·자외선·날씨 코드·낮밤·강수확률 (골프장 현지 시각). 예보 기간 밖이면 hours: []
 *   - 골프장 좌표(KGA 목록)·해외: Open-Meteo 시간별 예보 (16일)
 *   - 폰 위치이고 한국 안: 기상청 단기예보(getVilageFcst, 사흘쯤). 폰 위치는 국내면 기상청에만 보낸다 (개인정보처리방침).
 *     자외선은 없다
 * - 필요한 환경변수: KMA_SERVICE_KEY (data.go.kr 일반 인증키, Decoding), VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *   (KMA_URL·OPEN_METEO_URL 은 로컬 시험 때만 바꾼다)
 */

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const KMA = env.KMA_URL ?? "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
const OPEN_METEO = env.OPEN_METEO_URL ?? "https://api.open-meteo.com/v1/forecast";
const KMA_FCST = env.KMA_FCST_URL ?? "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

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

/** 대기실 예보 한 시간 */
export interface ForecastHour {
  /** 골프장 현지 시각 "2026-11-02T07:00" */
  time: string;
  temp: number;
  humidity: number | null;
  uv: number | null;
  /** WMO 날씨 코드 */
  code: number;
  isDay: boolean;
  precip: number | null;
}

/** 예보로 보는 시간 (티오프 정시부터 5시간 뒤까지 6칸) */
export const FORECAST_HOURS = 5;

const addDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

async function forecast(lat: number, lon: number, date: string, time: string): Promise<ForecastHour[]> {
  const start = Number(time.slice(0, 2));
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: "temperature_2m,relative_humidity_2m,uv_index,weather_code,is_day,precipitation_probability",
    timezone: "auto",
    start_date: date,
    // 저녁 티오프면 다음 날 새벽까지
    end_date: start + FORECAST_HOURS >= 24 ? addDay(date) : date,
  });
  const r = await fetch(`${OPEN_METEO}?${q}`);
  // 예보 기간 밖(16일 뒤·오래전)이면 400
  if (r.status === 400) return [];
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const h = ((await r.json().catch(() => null)) as {
    hourly?: {
      time?: string[];
      temperature_2m?: (number | null)[];
      relative_humidity_2m?: (number | null)[];
      uv_index?: (number | null)[];
      weather_code?: (number | null)[];
      is_day?: (number | null)[];
      precipitation_probability?: (number | null)[];
    };
  } | null)?.hourly;
  const times = h?.time ?? [];
  const from = times.indexOf(`${date}T${String(start).padStart(2, "0")}:00`);
  if (from < 0) return [];
  const out: ForecastHour[] = [];
  for (let i = from; i <= from + FORECAST_HOURS && i < times.length; i++) {
    const temp = h?.temperature_2m?.[i];
    if (typeof temp !== "number") break;
    const num = (v: number | null | undefined) => (typeof v === "number" ? v : null);
    out.push({
      time: times[i],
      temp: Math.round(temp * 10) / 10,
      humidity: num(h?.relative_humidity_2m?.[i]),
      uv: num(h?.uv_index?.[i]),
      code: num(h?.weather_code?.[i]) ?? 0,
      isDay: h?.is_day?.[i] !== 0,
      precip: num(h?.precipitation_probability?.[i]),
    });
  }
  return out;
}

/** 단기예보 발표 시각(02·05·…·23시, 10분쯤 뒤 올라온다) 중 가장 최근 (한국 시간) */
export function kmaFcstBase(now: Date): { date: string; time: string } {
  const kst = new Date(now.getTime() + 9 * 3600_000 - 15 * 60_000);
  let h = kst.getUTCHours();
  const slots = [2, 5, 8, 11, 14, 17, 20, 23];
  let base = [...slots].reverse().find((s) => s <= h);
  if (base === undefined) {
    kst.setUTCDate(kst.getUTCDate() - 1);
    base = 23;
  }
  h = base;
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}`,
    time: `${p(h)}00`,
  };
}

/** 서울 기준 달마다 대략적인 해 뜨는·지는 시 (낮밤 장면용) */
const SUN: [number, number][] = [
  [8, 18], [7, 18], [7, 19], [6, 19], [6, 19], [5, 20], [5, 20], [6, 19], [6, 19], [7, 18], [7, 18], [8, 17],
];

/** 기상청 하늘상태(SKY)·강수형태(PTY) → WMO 날씨 코드 */
const kmaCode = (sky: number | null, pty: number | null) =>
  pty === 1 || pty === 2 ? 61 : pty === 3 ? 71 : pty === 4 ? 80 : sky === 4 ? 3 : sky === 3 ? 2 : 0;

async function forecastKma(lat: number, lon: number, date: string, time: string, key: string): Promise<ForecastHour[]> {
  const { nx, ny } = kmaGrid(lat, lon);
  const { date: bd, time: bt } = kmaFcstBase(new Date());
  const q = new URLSearchParams({
    serviceKey: key,
    pageNo: "1",
    numOfRows: "1200",
    dataType: "JSON",
    base_date: bd,
    base_time: bt,
    nx: String(nx),
    ny: String(ny),
  });
  const r = await fetch(`${KMA_FCST}?${q}`);
  if (!r.ok) throw new Error(`kma ${r.status}`);
  const items =
    ((await r.json().catch(() => null)) as {
      response?: { body?: { items?: { item?: { category: string; fcstDate: string; fcstTime: string; fcstValue: string }[] } } };
    } | null)?.response?.body?.items?.item ?? [];
  const at = new Map<string, Record<string, number>>();
  for (const it of items) {
    const k = `${it.fcstDate}${it.fcstTime}`;
    const v = Number(it.fcstValue);
    if (!Number.isFinite(v)) continue;
    at.set(k, { ...(at.get(k) ?? {}), [it.category]: v });
  }
  const start = Number(time.slice(0, 2));
  const out: ForecastHour[] = [];
  for (let i = 0; i <= FORECAST_HOURS; i++) {
    const hh = start + i;
    const d = hh >= 24 ? addDay(date) : date;
    const h = hh % 24;
    const row = at.get(`${d.replace(/-/g, "")}${String(h).padStart(2, "0")}00`);
    if (!row || typeof row.TMP !== "number") break;
    const [rise, set] = SUN[Number(d.slice(5, 7)) - 1];
    out.push({
      time: `${d}T${String(h).padStart(2, "0")}:00`,
      temp: row.TMP,
      humidity: row.REH ?? null,
      uv: null,
      code: kmaCode(row.SKY ?? null, row.PTY ?? null),
      isDay: h >= rise && h < set,
      precip: row.POP ?? null,
    });
  }
  return out;
}

export async function POST(request: Request): Promise<Response> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s*/i, "");
  if (!(await signedIn(token))) return json(401, { error: "UNAUTHORIZED" });
  const body = (await request.json().catch(() => null)) as {
    lat?: unknown;
    lon?: unknown;
    date?: unknown;
    time?: unknown;
    src?: unknown;
  } | null;
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return json(400, { error: "BAD_COORDS" });
  // 대기실 예보: 날짜·티오프 시각이 있으면
  if (body?.date !== undefined || body?.time !== undefined) {
    const date = String(body?.date ?? "");
    const time = String(body?.time ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      return json(400, { error: "BAD_TIME" });
    try {
      // 폰 위치가 한국 안이면 기상청에만 (자외선 없음)
      if (body?.src === "device" && inKorea(lat, lon)) {
        if (!env.KMA_SERVICE_KEY) return json(200, { hours: [] });
        return json(200, { hours: await forecastKma(lat, lon, date, time, env.KMA_SERVICE_KEY) });
      }
      return json(200, { hours: await forecast(lat, lon, date, time) });
    } catch (e) {
      console.error("예보를 받지 못함", e);
      return json(502, { error: "NO_WEATHER" });
    }
  }
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
