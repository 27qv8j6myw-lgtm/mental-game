import { supabase } from "./supabase";
import { girOf } from "./recordStats";
import type { Fairway } from "./types";

/*
 * 스코어카드 사진으로 기록 추가: 사진 줄이기 → 서버(api/scorecard.ts)가 읽은 값 → 확인 화면에서 고칠 초안.
 * 읽은 값은 그대로 믿지 않고 범위를 맞춘 뒤, 사진에 인쇄된 합계·그린적중 표시와 맞춰 보며 의심 칸을 표시한다.
 */

/** 서버가 돌려주는 읽은 값 (api/scorecard.ts SCHEMA). 읽지 못한 칸은 null */
export interface ScorecardRead {
  date: string | null;
  courseName: string | null;
  teeName: string | null;
  playerName: string | null;
  holes: {
    hole: number;
    par: number | null;
    score: number | null;
    putts: number | null;
    fairway: Fairway | null;
    gir: boolean | null;
    penalty: number | null;
    sand: number | null;
  }[];
  totals: {
    outScore: number | null;
    inScore: number | null;
    totalScore: number | null;
    outPutts: number | null;
    inPutts: number | null;
    totalPutts: number | null;
  };
}

/** 패널티가 OB 인지 해저드인지 (사진에는 구분이 없어 사용자가 고른다) */
export type PenaltyKind = "ob" | "hazard";

/** 확인 화면에서 고치는 홀 하나 */
export interface DraftHole {
  par: number;
  score: number | null;
  putts: number | null;
  fairway: Fairway | null;
  penalty: number;
  penaltyKind: PenaltyKind;
  sand: number;
  /** 사진의 그린적중 표시 (맞춰 보기용, 저장하지 않는다) */
  gir: boolean | null;
}

export interface Draft {
  holeCount: 9 | 18;
  holes: DraftHole[];
  totals: ScorecardRead["totals"];
}

/** 사진을 긴 쪽 2000px 이하 JPEG 로 줄인다 (서버 요청 크기·읽기 비용을 줄이려고) */
export async function prepareImage(file: File): Promise<{ data: string; mediaType: "image/jpeg"; url: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("NO_CANVAS");
  // 투명한 PNG 도 글자가 보이게 흰 바탕
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL("image/jpeg", 0.9).split(",")[1] ?? "";
  return { data, mediaType: "image/jpeg", url };
}

/** 사진 읽기 요청. 실패하면 사용자에게 보여줄 문장으로 던진다 */
export async function readScorecard(img: { data: string; mediaType: string }): Promise<ScorecardRead> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
  let res: Response;
  try {
    res = await fetch(import.meta.env.VITE_SCORECARD_API || "/api/scorecard", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ image: img.data, mediaType: img.mediaType }),
    });
  } catch {
    throw new Error("연결이 안 돼서 사진을 보내지 못했어요. 연결을 확인하고 다시 눌러 주세요.");
  }
  const body = (await res.json().catch(() => null)) as (ScorecardRead & { error?: string }) | null;
  if (res.ok && body && Array.isArray(body.holes)) return body;
  const code = body?.error;
  throw new Error(
    code === "NO_KEY"
      ? "사진 읽기 기능이 아직 설정되지 않았어요 (서버에 API 키가 없어요)."
      : code === "UNAUTHORIZED"
        ? "로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요."
        : code === "ADMIN_ONLY"
          ? "관리자만 쓸 수 있는 기능이에요."
        : code === "NOT_SCORECARD"
          ? "스코어카드 사진이 아닌 것 같아요. 홀별 타수가 보이는 사진을 골라 주세요."
          : code === "UNREADABLE"
            ? "사진에서 스코어카드를 읽지 못했어요. 더 선명한 사진으로 다시 시도해 주세요."
            : code === "TOO_LARGE"
              ? "사진이 너무 커요. 다른 사진으로 시도해 주세요."
              : code === "BUSY"
                ? "지금 요청이 많아요. 잠시 후 다시 시도해 주세요."
                : "사진을 읽지 못했어요. 잠시 후 다시 시도해 주세요."
  );
}

const int = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** 읽은 값 → 확인 화면 초안. 범위를 벗어난 값은 비우고, 파를 못 읽은 홀은 4 */
export function toDraft(read: ScorecardRead): Draft {
  const byHole = new Map(read.holes.map((h) => [h.hole, h]));
  const maxHole = Math.max(0, ...read.holes.map((h) => h.hole));
  const holeCount: 9 | 18 = maxHole > 9 || read.holes.length > 9 ? 18 : 9;
  const holes = Array.from({ length: holeCount }, (_, i): DraftHole => {
    const h = byHole.get(i + 1) ?? read.holes[i];
    const par = int(h?.par, 3, 5) ?? 4;
    const score = int(h?.score, 1, 15);
    const putts = int(h?.putts, 0, 6);
    return {
      par,
      score,
      // 퍼트는 타수보다 많을 수 없다
      putts: putts != null && score != null && putts > score ? null : putts,
      fairway: par >= 4 && h?.fairway && ["hit", "left", "right", "short"].includes(h.fairway) ? h.fairway : null,
      penalty: int(h?.penalty, 0, 9) ?? 0,
      penaltyKind: "ob",
      sand: int(h?.sand, 0, 9) ?? 0,
      gir: typeof h?.gir === "boolean" ? h.gir : null,
    };
  });
  return { holeCount, holes, totals: read.totals };
}

const sum = (xs: (number | null)[]) =>
  xs.some((x) => x == null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0);

export interface SumCheck {
  label: string;
  score: number | null;
  printedScore: number | null;
  putts: number | null;
  printedPutts: number | null;
  /** 사진의 합계와 다르다 */
  scoreOff: boolean;
  puttsOff: boolean;
}

/** 아웃·인·합계: 지금 칸의 합과 사진에 인쇄된 합계 */
export function sumChecks(d: Draft): SumCheck[] {
  const part = (label: string, from: number, to: number, ps: number | null, pp: number | null): SumCheck => {
    const hs = d.holes.slice(from, to);
    const score = sum(hs.map((h) => h.score));
    const putts = sum(hs.map((h) => h.putts));
    return {
      label,
      score,
      printedScore: ps,
      putts,
      printedPutts: pp,
      scoreOff: ps != null && score !== ps,
      puttsOff: pp != null && putts !== pp,
    };
  };
  const t = d.totals;
  if (d.holeCount === 9) return [part("합계", 0, 9, t.totalScore ?? t.outScore, t.totalPutts ?? t.outPutts)];
  return [
    part("아웃", 0, 9, t.outScore, t.outPutts),
    part("인", 9, 18, t.inScore, t.inPutts),
    part("합계", 0, 18, t.totalScore, t.totalPutts),
  ];
}

/** 사진의 그린적중 표시와 타수·퍼트로 계산한 그린적중이 다른 홀 (타수나 퍼트를 잘못 읽었을 수 있다) */
export const girOff = (h: DraftHole) => {
  if (h.gir == null || h.score == null) return false;
  const calc = girOf(h.par, h.score - h.par, h.putts);
  return calc != null && calc !== h.gir;
};
