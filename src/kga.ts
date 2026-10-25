import type { CourseRating, TeeBox } from "./types";

/*
 * KGA 코스레이팅™·슬로프레이팅™ (대한골프협회 코스핸디캡™ 계산기
 * https://www.kgagolf.or.kr/web/handicap/calculator 의 데이터베이스를 모아 정리한 것)
 * 골프장 → 코스(18홀 조합) → 티별 남/여 레이팅. 라운드 만들기에서 골프장 추천·코스 선택에,
 * 기록 분석에서 보정타수 계산에 쓴다. 용량이 커서 처음 쓸 때 따로 불러온다.
 */

/** [티 이름, 남/여, 코스레이팅, 슬로프레이팅, 코스 길이(야드), 기준 파] */
export type KgaTee = [
  tee: string,
  sex: "M" | "F",
  cr: number,
  slope: number,
  yards: number | null,
  par: number,
];
export interface KgaCourse {
  name: string;
  tees: KgaTee[];
}
export interface KgaClub {
  name: string;
  /** 지역 (경기·제주 등) */
  region: string;
  courses: KgaCourse[];
  /** 골프장 좌표 (라운드 날씨용, scripts/geocode-kga.mjs 로 넣는다. 못 찾은 곳은 없음) */
  lat?: number;
  lon?: number;
}
export interface KgaData {
  source: string;
  /** 모은 날짜 (YYYY-MM-DD) */
  fetched: string;
  clubs: KgaClub[];
}

let loading: Promise<KgaData> | null = null;
export const loadKga = () =>
  (loading ??= import("./data/kgaCourses.json").then((m) => m.default as KgaData));

/** 비교용 이름: 공백·대소문자·"CC/컨트리클럽/골프클럽" 같은 꼬리말을 뺀다 */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/컨트리클럽|골프클럽|골프앤리조트|골프리조트|골프장|리조트|c\.?c\.?|g\.?c\.?/g, "");

/** 입력한 이름이 들어 있는 골프장 (정확히 같은 것 → 앞이 같은 것 → 들어 있는 것 순) */
export function searchClubs(data: KgaData, q: string, limit = 6): KgaClub[] {
  const nq = norm(q);
  if (!nq) return [];
  return data.clubs
    .map((c) => {
      const n = norm(c.name);
      const score = n === nq ? 3 : n.startsWith(nq) ? 2 : n.includes(nq) || nq.includes(n) ? 1 : 0;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.length - b.c.name.length)
    .slice(0, limit)
    .map((x) => x.c);
}

/** 이름이 정확히 같은 골프장 (꼬리말·띄어쓰기 무시) */
export const exactClub = (data: KgaData, q: string) => {
  const nq = norm(q);
  return nq ? data.clubs.find((c) => norm(c.name) === nq) ?? null : null;
};

const bigrams = (s: string) => {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
};
/** 두 이름이 얼마나 비슷한지 (0~1): 글자 두 개씩 묶은 조각이 겹치는 비율 */
const similarity = (a: string, b: string) => {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both += 1;
  return (2 * both) / (A.size + B.size);
};
/** 한 글자 고치기·넣기·빼기 수 */
const editDistance = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return d[a.length][b.length];
};

/** 이름을 조금 다르게(오타) 입력했을 때 "이 코스가 맞나요?"로 보여줄 골프장 */
export function similarClubs(data: KgaData, q: string, limit = 3): KgaClub[] {
  const nq = norm(q);
  if (nq.length < 2) return [];
  return data.clubs
    .map((c) => {
      const n = norm(c.name);
      const dist = editDistance(nq, n);
      const close = dist <= (Math.max(nq.length, n.length) <= 4 ? 1 : 2);
      const score = Math.max(similarity(nq, n), close ? 0.6 : 0);
      return { c, score };
    })
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

/** 티 박스 → KGA 티 이름에서 찾을 말 (앞에 있을수록 우선) */
const TEE_WORDS: Record<TeeBox, string[]> = {
  black: ["BLACK", "CHAMPION", "CHAMP", "TOURNAMENT", "PRO", "BACK", "T1"],
  blue: ["BLUE"],
  white: ["WHITE", "REGULAR"],
  red: ["RED", "LADY", "LADIES", "FRONT", "FORWARD"],
  senior: ["SENIOR", "GOLD", "SILVER", "YELLOW"],
};

/** 고른 티 박스에 맞는 이 코스의 KGA 티 이름. 맞는 게 없으면 null (사용자가 직접 고른다) */
export function matchTee(course: KgaCourse, tee: TeeBox): string | null {
  const names = [...new Set(course.tees.map((t) => t[0]))];
  for (const w of TEE_WORDS[tee]) {
    const hit = names.find((n) => n.toUpperCase().includes(w));
    if (hit) return hit;
  }
  return null;
}

/** 티 이름(스코어카드의 "Regular" 등) → 티 박스. 알 수 없으면 null */
export function teeBoxFromName(name: string): TeeBox | null {
  const up = name.toUpperCase();
  for (const [box, words] of Object.entries(TEE_WORDS) as [TeeBox, string[]][]) {
    if (words.some((w) => up.includes(w))) return box;
  }
  // 한글 티 이름
  const ko: [TeeBox, string][] = [
    ["black", "블랙"],
    ["blue", "블루"],
    ["white", "화이트"],
    ["red", "레드"],
    ["senior", "시니어"],
  ];
  return ko.find(([, w]) => name.includes(w))?.[0] ?? null;
}

/**
 * 스코어카드에 적힌 골프장 이름("클럽72 (오션)")으로 KGA 골프장·코스 찾기.
 * 괄호 앞은 골프장, 괄호 안은 코스 이름의 일부로 본다. 코스를 정할 수 없으면 courseIdx -1.
 * 괄호 앞 이름만 따로 쓰려면 clubPart
 */
export function findCourse(data: KgaData, printed: string): { club: KgaClub; courseIdx: number } | null {
  const m = printed.match(/^(.*?)\s*[(（]([^)）]*)[)）]/);
  const base = (m ? m[1] : printed).trim();
  const hint = m ? norm(m[2]) : "";
  // 이름이 같은 골프장만 (비슷한 이름은 확인 화면에서 추천으로 고른다)
  const club = exactClub(data, base);
  if (!club) return null;
  if (club.courses.length === 1) return { club, courseIdx: 0 };
  const courseIdx = hint ? club.courses.findIndex((c) => norm(c.name).includes(hint)) : -1;
  return { club, courseIdx };
}

/** "클럽72 (오션)" → "클럽72" */
export const clubPart = (printed: string) => printed.replace(/\s*[(（][^)）]*[)）].*$/, "").trim();

/** 라운드에 저장할 레이팅: 고른 코스·티의 남/여 레이팅 */
export function courseRating(
  data: KgaData,
  club: KgaClub,
  course: KgaCourse,
  tee: string
): CourseRating {
  return {
    club: club.name,
    course: course.name,
    tee,
    ratings: course.tees
      .filter((t) => t[0] === tee)
      .map(([, sex, cr, slope, , par]) => ({ sex, cr, slope, par })),
    edition: data.fetched,
  };
}

/** 어느 레이팅으로 계산할지: 레드 티는 여성 레이팅, 나머지 티는 남성 레이팅 (성별은 묻지 않는다) */
export const teeSex = (tee: string | null | undefined): "M" | "F" => (tee === "red" ? "F" : "M");

/** 남/여 레이팅 가운데 고른 것 (없으면 있는 것). 레이팅이 없으면 null */
export function ratingFor(rating: CourseRating | undefined | null, sex: "M" | "F") {
  if (!rating || rating.ratings.length === 0) return null;
  const r = rating.ratings.find((x) => x.sex === sex) ?? rating.ratings[0];
  return { ...r, exact: r.sex === sex };
}

/** 보정타수 = (타수 − 코스레이팅) × 113 ÷ 슬로프레이팅 (소수 첫째 자리) */
export const differential = (gross: number, cr: number, slope: number) =>
  Math.round((((gross - cr) * 113) / slope) * 10) / 10;

/**
 * 코스 난이도 (슬로프레이팅 기준, 국내 코스끼리 비교한 4단계).
 * 113 이 표준이지만 국내 화이트 티 대부분이 125~140 이라 그 안에서 나눈다
 */
export function difficulty(slope: number): { label: string; level: 0 | 1 | 2 | 3 } {
  if (slope <= 124) return { label: "쉬움", level: 0 };
  if (slope <= 131) return { label: "보통", level: 1 };
  if (slope <= 138) return { label: "어려움", level: 2 };
  return { label: "매우 어려움", level: 3 };
}

/**
 * 보기 플레이어(표준 코스에서 90타, 핸디 18) 예상 파 대비 타수:
 * 18 × 슬로프 ÷ 113 + (코스레이팅 − 파)  (WHS 코스 핸디캡 계산과 같은 식)
 */
export const bogeyOverPar = (cr: number, slope: number, par = 72) =>
  Math.round((18 * slope) / 113 + (cr - par));
