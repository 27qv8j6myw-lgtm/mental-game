import { parseClub } from "./bag";
import type { Fairway, HoleDetail, PuttDetail, PuttLine, ShotDetail, TeeLie } from "./types";

/*
 * 디테일 기록 (HoleStatFields 의 '디테일 기록' 스위치): 샷마다 클럽·핀까지 거리·결과, 퍼트마다 거리·라이·경사.
 * round_hole_stats.detail (jsonb, supabase/record.sql) 에 저장하고 AI 분석에 보낸다 (insight.ts).
 * 모든 칸은 넣지 않아도 된다. 저장할 때 빈 칸을 지우고, 다 비었으면 null
 */

const FAIRWAYS: Fairway[] = ["left", "hit", "short", "right"];
const LIES: TeeLie[] = ["bunker", "ob", "hazard"];
export const PUTT_LINES: PuttLine[] = ["hook", "straight", "slice", "double"];
/** 핀까지 거리 상한 (m·y) · 퍼트 거리 상한 (m) */
export const SHOT_DIST_MAX = 650;
export const PUTT_DIST_MAX = 60;
/** 1야드 = 0.9144m */
export const YARD = 0.9144;

const num = (v: unknown, max: number, step: number) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v / step) * step : null;

function parseShot(v: unknown): ShotDetail {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const s: ShotDetail = {};
  const club = parseClub(o.club);
  if (club) s.club = club;
  const dist = num(o.dist, SHOT_DIST_MAX, 1);
  if (dist != null) {
    s.dist = dist;
    s.unit = o.unit === "y" ? "y" : "m";
  }
  if (FAIRWAYS.includes(o.dir as Fairway)) s.dir = o.dir as Fairway;
  if (LIES.includes(o.lie as TeeLie)) s.lie = o.lie as TeeLie;
  return s;
}

function parsePutt(v: unknown): PuttDetail {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const p: PuttDetail = {};
  const dist = num(o.dist, PUTT_DIST_MAX, 0.5);
  if (dist != null) p.dist = dist;
  if (PUTT_LINES.includes(o.line as PuttLine)) p.line = o.line as PuttLine;
  if (o.slope === "up" || o.slope === "down") p.slope = o.slope;
  return p;
}

const shotEmpty = (s: ShotDetail) => !s.club && s.dist == null && !s.dir && !s.lie;
const puttEmpty = (p: PuttDetail) => p.dist == null && !p.line && !p.slope;

/** 뒤쪽 빈 칸을 뗀다 (가운데 빈 샷은 샷 번호가 밀리지 않게 남긴다) */
function trimEnd<T>(xs: T[], empty: (x: T) => boolean): T[] {
  let n = xs.length;
  while (n > 0 && empty(xs[n - 1])) n--;
  return xs.slice(0, n);
}

/**
 * 저장할 모양: 이상한 값·빈 칸을 지우고, 퍼트 칸은 퍼트 수에 맞춘다. 남은 게 없으면 null.
 * DB 에서 읽은 값에도 쓴다 (putts 를 모르면 퍼트 칸 수는 그대로)
 */
export function cleanDetail(v: unknown, putts?: number | null): HoleDetail | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const shots = trimEnd((Array.isArray(o.shots) ? o.shots : []).slice(0, 12).map(parseShot), shotEmpty);
  let pts = (Array.isArray(o.putts) ? o.putts : []).slice(0, 6).map(parsePutt);
  if (putts !== undefined) pts = pts.slice(0, puttCells(putts));
  pts = trimEnd(pts, puttEmpty);
  return shots.length || pts.length ? { shots, putts: pts } : null;
}

export const sameDetail = (a: HoleDetail | null | undefined, b: HoleDetail | null | undefined) =>
  JSON.stringify(cleanDetail(a)) === JSON.stringify(cleanDetail(b));

/** 퍼트 칸 수: 2퍼트 이상이면 퍼트 수 − 1 (들어간 마지막 퍼트는 뺀다), 1퍼트면 그 한 칸 */
export function puttCells(putts: number | null | undefined): number {
  if (putts == null || putts <= 0) return 0;
  return putts === 1 ? 1 : putts - 1;
}

/** 넣을 수 있는 샷 수: (타수 − 퍼트) 개까지. 모르면 9 */
export function shotLimit(strokes: number | null, putts: number | null): number {
  if (strokes == null) return 9;
  return Math.max(1, strokes - (putts ?? 0));
}

/** 핀까지 거리를 m 로 (야드면 바꾼다) */
export const distMeters = (s: ShotDetail) => (s.dist == null ? null : s.unit === "y" ? s.dist * YARD : s.dist);

export const PUTT_LINE_LABEL: Record<PuttLine, string> = {
  hook: "훅 라이",
  straight: "똑바로",
  slice: "슬라이스 라이",
  double: "더블 브레이크",
};
export const SLOPE_LABEL = { up: "오르막", down: "내리막" } as const;
