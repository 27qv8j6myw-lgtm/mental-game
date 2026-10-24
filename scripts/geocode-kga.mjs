// KGA 골프장 276곳에 좌표(lat, lon)를 넣는다 (라운드 날씨용, src/weather.ts).
// 카카오 지도 장소 검색(키워드)으로 "골프장 이름 + 골프장"을 찾아, 카테고리에 '골프'가 있고 주소가 그 지역인 곳을 고른다.
// 키는 .env.local 의 KAKAO_REST_KEY (카카오 개발자 콘솔 > 내 애플리케이션 > 앱 키 > REST API 키). 채팅·저장소에 올리지 않는다.
// 손으로 고칠 곳은 scripts/kga-coords-manual.json {"골프장 이름": [lat, lon]} 에 적으면 검색보다 먼저 쓴다.
//
//   node scripts/geocode-kga.mjs          # 좌표가 없는 곳만
//   node scripts/geocode-kga.mjs --all    # 전부 다시
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DATA = new URL("../src/data/kgaCourses.json", import.meta.url);
const MANUAL = new URL("./kga-coords-manual.json", import.meta.url);
const ENV = new URL("../.env.local", import.meta.url);

function readKey() {
  if (process.env.KAKAO_REST_KEY) return process.env.KAKAO_REST_KEY;
  if (!existsSync(ENV)) return null;
  const line = readFileSync(ENV, "utf8")
    .split("\n")
    .find((l) => l.startsWith("KAKAO_REST_KEY="));
  return line ? line.slice("KAKAO_REST_KEY=".length).trim().replace(/^["']|["']$/g, "") : null;
}

const key = readKey();
if (!key) {
  console.error(".env.local 에 KAKAO_REST_KEY=... 를 넣고 다시 실행해 주세요.");
  process.exit(1);
}

const all = process.argv.includes("--all");
const data = JSON.parse(readFileSync(DATA, "utf8"));
const manual = existsSync(MANUAL) ? JSON.parse(readFileSync(MANUAL, "utf8")) : {};

/** 지역 이름 → 카카오 주소 앞머리 (경기 → "경기", 제주 → "제주특별자치도" 등도 앞 두 글자로 비교) */
const sameRegion = (address, region) => !region || address.replace(/\s/g, "").startsWith(region.slice(0, 2));
const round4 = (v) => Math.round(Number(v) * 1e4) / 1e4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(query) {
  const u = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  u.searchParams.set("query", query);
  u.searchParams.set("size", "15");
  const r = await fetch(u, { headers: { Authorization: `KakaoAK ${key}` } });
  if (r.status === 401 || r.status === 403) {
    const why = await r.json().catch(() => ({}));
    // 카카오맵이 꺼진 앱이면 "disabled OPEN_MAP_AND_LOCAL service"
    throw new Error(`카카오가 거절했어요 (${r.status}): ${why.message ?? why.msg ?? ""}`);
  }
  if (!r.ok) return [];
  return (await r.json()).documents ?? [];
}

/** 골프장다운 결과 고르기: 카테고리 '골프장' > '골프' 순, 같은 지역 우선 */
function pick(docs, club) {
  const golf = docs.filter((d) => /골프/.test(d.category_name ?? ""));
  const score = (d) =>
    (/골프장/.test(d.category_name) ? 2 : 0) +
    (sameRegion(d.road_address_name || d.address_name || "", club.region) ? 2 : 0) +
    (d.place_name.replace(/\s/g, "").includes(club.name.replace(/\s/g, "")) ? 1 : 0) -
    (/연습장|스크린|아카데미|샵|용품|피팅/.test(d.place_name + d.category_name) ? 3 : 0);
  return golf.map((d) => ({ d, s: score(d) })).sort((a, b) => b.s - a.s)[0] ?? null;
}

const missing = [];
const unsure = [];
let found = 0;
for (const club of data.clubs) {
  if (manual[club.name]) {
    [club.lat, club.lon] = manual[club.name].map(round4);
    found++;
    continue;
  }
  if (!all && club.lat != null && club.lon != null) continue;
  let best = null;
  for (const q of [`${club.name} 골프장`, `${club.name} 컨트리클럽`, club.name]) {
    best = pick(await search(q), club);
    await sleep(120);
    if (best && best.s >= 3) break;
  }
  if (!best) {
    delete club.lat;
    delete club.lon;
    missing.push(`${club.name} (${club.region})`);
    continue;
  }
  club.lat = round4(best.d.y);
  club.lon = round4(best.d.x);
  found++;
  // 지역이 다르거나 골프장 카테고리가 아니면 확인 목록에
  if (best.s < 3) unsure.push(`${club.name} (${club.region}) → ${best.d.place_name} · ${best.d.address_name}`);
}

writeFileSync(DATA, JSON.stringify(data));
console.log(`좌표 ${found}곳 · 못 찾음 ${missing.length}곳 · 확인 필요 ${unsure.length}곳`);
if (missing.length) console.log("\n못 찾은 골프장:\n" + missing.join("\n"));
if (unsure.length) console.log("\n확인이 필요한 골프장 (검색 결과가 애매함):\n" + unsure.join("\n"));
