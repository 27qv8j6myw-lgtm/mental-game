/*
 * 내 골프백: 프로필에서 정한 클럽들 (내 계정 user_metadata.mg_bag).
 * 디테일 기록에서 샷마다 클럽을 고를 때 이 목록을 보여 준다 (비었으면 기본 목록).
 * 규칙상 14개까지만 넣을 수 있어서 넘으면 프로필에서 빼라고 알린다 (저장은 막지 않는다)
 */

export type ClubKind = "driver" | "wood" | "hybrid" | "iron" | "wedge" | "putter";
export type WedgeType = "P" | "G" | "S" | "L";

export interface Club {
  kind: ClubKind;
  /** 우드·유틸리티·아이언 번호 */
  num?: number;
  /** 로프트 (도). 넣지 않았으면 없음 */
  loft?: number;
  /** 웨지 종류 (피칭·갭·샌드·로브). 로프트만 넣었으면 없음 */
  wedge?: WedgeType;
}

/** 골프 규칙 4.1b: 라운드에 가지고 나갈 수 있는 클럽 수 */
export const BAG_LIMIT = 14;

export const CLUB_KINDS: ClubKind[] = ["driver", "wood", "hybrid", "iron", "wedge", "putter"];
export const KIND_LABEL: Record<ClubKind, string> = {
  driver: "드라이버",
  wood: "우드",
  hybrid: "유틸리티",
  iron: "아이언",
  wedge: "웨지",
  putter: "퍼터",
};
export const WEDGE_TYPES: WedgeType[] = ["P", "G", "S", "L"];
export const WEDGE_LABEL: Record<WedgeType, string> = { P: "피칭", G: "갭", S: "샌드", L: "로브" };
/** 하나만 넣는 클럽 */
export const SINGLE_KINDS: ClubKind[] = ["driver", "putter"];

/** 번호·로프트 입력 범위 */
export const NUM_RANGE: Record<"wood" | "hybrid" | "iron", [number, number]> = {
  wood: [2, 11],
  hybrid: [1, 9],
  iron: [1, 9],
};
export const LOFT_RANGE: [number, number] = [5, 70];

const WEDGE_ORDER: Record<WedgeType, number> = { P: 0, G: 1, S: 2, L: 3 };
const KIND_ORDER: Record<ClubKind, number> = { driver: 0, wood: 1, hybrid: 2, iron: 3, wedge: 4, putter: 5 };

const numIn = (v: unknown, [lo, hi]: [number, number]) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;

/** 저장된 값 → 클럽 하나 (이상한 값은 null) */
export function parseClub(v: unknown): Club | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const kind = o.kind as ClubKind;
  if (!CLUB_KINDS.includes(kind)) return null;
  const c: Club = { kind };
  if (kind === "wood" || kind === "hybrid" || kind === "iron") {
    const n = numIn(o.num, NUM_RANGE[kind]);
    if (n == null) return null;
    c.num = Math.round(n);
  }
  if (kind !== "iron" && kind !== "putter") {
    const l = numIn(o.loft, LOFT_RANGE);
    if (l != null) c.loft = Math.round(l * 2) / 2;
  }
  if (kind === "wedge") {
    if (WEDGE_TYPES.includes(o.wedge as WedgeType)) c.wedge = o.wedge as WedgeType;
    if (!c.wedge && c.loft == null) return null;
  }
  return c;
}

export function parseBag(v: unknown): Club[] {
  if (!Array.isArray(v)) return [];
  return sortBag(v.map(parseClub).filter((c): c is Club => !!c));
}

/** 드라이버 → 우드·유틸·아이언 번호순 → 웨지 로프트순(없으면 P·G·S·L 순) → 퍼터 */
export function sortBag(bag: Club[]): Club[] {
  const wedgeKey = (c: Club) => c.loft ?? 44 + (c.wedge ? WEDGE_ORDER[c.wedge] * 5 : 0);
  return [...bag].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.kind === "wedge" ? wedgeKey(a) - wedgeKey(b) : (a.num ?? 0) - (b.num ?? 0))
  );
}

/** 긴 이름: "드라이버 10.5°", "3번 우드 15°", "7번 아이언", "S 웨지 56°", "퍼터" (withLoft 가 false 면 로프트 없이) */
export function clubName(c: Club, withLoft = true): string {
  const loft = withLoft && c.loft != null ? ` ${c.loft}°` : "";
  switch (c.kind) {
    case "driver":
      return `드라이버${loft}`;
    case "wood":
    case "hybrid":
      return `${c.num}번 ${KIND_LABEL[c.kind]}${loft}`;
    case "iron":
      return `${c.num}번 아이언`;
    case "wedge":
      return c.wedge ? `${c.wedge} 웨지${loft}` : withLoft ? `${c.loft}° 웨지` : "웨지";
    case "putter":
      return "퍼터";
  }
}

/** 칩 이름 (샷 탭·클럽 고르기): "드라이버", "3W", "4U", "7I", "SW", "52°", "퍼터" */
export function clubShort(c: Club): string {
  switch (c.kind) {
    case "driver":
      return "드라이버";
    case "wood":
      return `${c.num}W`;
    case "hybrid":
      return `${c.num}U`;
    case "iron":
      return `${c.num}I`;
    case "wedge":
      return c.wedge ? `${c.wedge}W` : `${c.loft}°`;
    case "putter":
      return "퍼터";
  }
}

/** 같은 클럽인가 (번호·종류·로프트까지) */
export const sameClub = (a: Club | null | undefined, b: Club | null | undefined) =>
  !!a && !!b && a.kind === b.kind && a.num === b.num && a.loft === b.loft && a.wedge === b.wedge;

/** 골프백을 정하지 않았을 때 클럽 고르기에 보여 줄 기본 목록 */
export const DEFAULT_BAG: Club[] = [
  { kind: "driver" },
  { kind: "wood", num: 3 },
  { kind: "wood", num: 5 },
  { kind: "hybrid", num: 4 },
  ...[5, 6, 7, 8, 9].map((num) => ({ kind: "iron" as const, num })),
  ...WEDGE_TYPES.map((wedge) => ({ kind: "wedge" as const, wedge })),
  { kind: "putter" },
];
