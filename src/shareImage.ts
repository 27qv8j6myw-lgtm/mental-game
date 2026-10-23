import type { CourseRating, Fairway, GameMode, TeeLie } from "./types";
import { girOf } from "./recordStats";
import { GAME_MODE_LABEL, relLabel, won, wonSigned } from "./util";
import type { YearReview } from "./yearReview";

/*
 * 공유·저장용 이미지. 캔버스에 직접 그린다 (앱 글꼴을 그대로 쓰고 외부 라이브러리 없이).
 * - 기록 라운드: 스코어카드 (전반·후반 표: 파·타수 모양·퍼트·티샷·그린적중·OB·해저드·샌드샷)
 * - 내기 라운드: 정산 결과 (순위·금액과 내역, 송금, 홀별 스코어)
 * - 올해의 골프 결산: 한 장 요약
 * 화면 크기와 상관없이 같은 모양이 나오게 고정 폭으로 그리고 2배로 저장한다
 */

const FONT = '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif';
const NUM = 'Inter, "Pretendard Variable", Pretendard, -apple-system, sans-serif';
const SCALE = 2;
const C = {
  ink: "#1f1f1f",
  soft: "#6b6b6b",
  faint: "#9ca3af",
  line: "#e5e7eb",
  fill: "#f7f7f6",
  fill2: "#f0f1f3",
  par: "#e9ebef",
  blue: "#2563eb",
  blueSoft: "#e6f0ff",
  red: "#e11d48",
  slate: "#4b5563",
  gain: "#059669",
  gainSoft: "#d1fae5",
  loss: "#dc2626",
  gold: "#d97706",
  goldSoft: "#fef3c7",
  /** 티샷 벙커 (앱 스코어카드와 같은 갈색) */
  bunker: "#92400e",
  /** 더블파(양파) 바탕 */
  black: "#111827",
};

type Ctx = CanvasRenderingContext2D;

interface TextOpt {
  size: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  num?: boolean;
}

function setFont(ctx: Ctx, o: TextOpt) {
  ctx.font = `${o.weight ?? 500} ${o.size}px ${o.num ? NUM : FONT}`;
}
/** 글자 (y 는 글자 가운데). 그린 폭을 돌려준다 */
function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpt) {
  setFont(ctx, o);
  ctx.fillStyle = o.color ?? C.ink;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}
function width(ctx: Ctx, s: string, o: TextOpt) {
  setFont(ctx, o);
  return ctx.measureText(s).width;
}
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function hline(ctx: Ctx, x1: number, x2: number, y: number, color = C.line) {
  ctx.fillStyle = color;
  ctx.fillRect(x1, Math.round(y) - 0.5, x2 - x1, 1);
}
/** 알약 모양 칩 (x 는 왼쪽 끝). 칩 폭을 돌려준다 */
function chip(ctx: Ctx, s: string, x: number, cy: number, bg: string, fg: string, size = 14) {
  const w = width(ctx, s, { size, weight: 700 }) + 24;
  ctx.fillStyle = bg;
  roundRect(ctx, x, cy - 14, w, 28, 14);
  ctx.fill();
  text(ctx, s, x + w / 2, cy + 0.5, { size, weight: 700, color: fg, align: "center" });
  return w;
}

/**
 * 타수 모양: 버디 이하 빨간 원(이글은 테두리 하나 더), 파 회색 원, 보기 파란 네모, 더블 보기 이상 진회색 겹네모,
 * 더블파(양파) 이상은 검정 네모에 빨간 테두리
 */
function scoreMark(ctx: Ctx, cx: number, cy: number, size: number, strokes: number, par: number) {
  const rel = strokes - par;
  const r = size / 2;
  let fg = "#fff";
  if (rel < 0) {
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (rel <= -2) {
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (rel === 0) {
    ctx.fillStyle = C.par;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    fg = C.ink;
  } else {
    const doublePar = strokes >= par * 2;
    const color = rel === 1 ? C.blue : doublePar ? C.black : C.slate;
    ctx.fillStyle = color;
    roundRect(ctx, cx - r, cy - r, size, size, size * 0.24);
    ctx.fill();
    if (rel >= 2) {
      ctx.strokeStyle = doublePar ? C.loss : color;
      ctx.lineWidth = 1.6;
      roundRect(ctx, cx - r - 4, cy - r - 4, size + 8, size + 8, size * 0.3);
      ctx.stroke();
    }
  }
  text(ctx, String(strokes), cx, cy + 1, { size: Math.round(size * 0.46), weight: 800, color: fg, align: "center", num: true });
}

/** 앱 아이콘과 같은 선 (24칸 기준 경로) */
const FAIRWAY_PATH: Record<Exclude<Fairway, "hit">, string> = {
  left: "M15 21C15 13 13 8 6 6M6 6l2.5 3.7M6 6l4.1-1.8",
  right: "M9 21C9 13 11 8 18 6M18 6l-2.5 3.7M18 6l-4.1-1.8",
  short: "M12 5v13M7 13l5 5 5-5",
};
function strokePath(ctx: Ctx, d: string, cx: number, cy: number, box: number, color: string, lw = 2.4) {
  const k = box / 24;
  ctx.save();
  ctx.translate(cx - 12 * k, cy - 12 * k);
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(d));
  ctx.restore();
}
/** 티샷 방향: 원 안에 적중(◎)·훅·슬라이스·짧음. 색은 보통 파랑, 티샷이 OB·해저드면 빨강, 벙커면 갈색 */
function fairwayMark(ctx: Ctx, cx: number, cy: number, f: Fairway, r = 15, color: string = C.blue) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (f === "hit") {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.33, 0, Math.PI * 2);
    ctx.stroke();
  } else strokePath(ctx, FAIRWAY_PATH[f], cx, cy, r * 1.25, color, 2.6);
}
const lieColor = (lie: TeeLie | null) => (lie === "bunker" ? C.bunker : lie ? C.loss : C.blue);
function checkMark(ctx: Ctx, cx: number, cy: number, box = 26) {
  strokePath(ctx, "M5 12.5l4.5 4.5L19 7", cx, cy, box, C.blue, 2.6);
}

const WEEK = "일월화수목금토";
/** 2026-10-14 → 2026년 10월 14일 (화) */
function longDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return `${y}년 ${m}월 ${d}일 (${WEEK[new Date(y, m - 1, d).getDay()]})`;
}

/** 그릴 글자들이 쓰는 글꼴 조각을 미리 받아 둔다 (한글 글꼴은 글자 범위별로 나뉘어 있다) */
async function ensureFonts(strings: string[]) {
  if (!document.fonts?.load) return;
  const all = [...new Set([...strings.join(""), ..."0123456789+-−±,.%/()원타홀"])].join("");
  await Promise.all(
    [500, 600, 700, 800, 900].flatMap((w) => [
      document.fonts.load(`${w} 20px ${FONT}`, all),
      document.fonts.load(`${w} 20px ${NUM}`, "0123456789+-,.%"),
    ])
  ).catch(() => undefined);
}

/* ------------------------------ 기록 스코어카드 ------------------------------ */

export interface ScorecardHole {
  par: number;
  /** 타수 (안 친 홀은 null) */
  strokes: number | null;
  putts: number | null;
  fairway: Fairway | null;
  /** 티샷이 떨어진 곳 (벙커·OB·해저드) */
  lie: TeeLie | null;
  ob: number;
  hazard: number;
  sand: number;
}

export interface ScorecardData {
  date: string;
  course: string;
  /** "화이트 티" */
  tee?: string;
  player: string;
  holes: ScorecardHole[];
  /** 보정타수 (KGA 레이팅이 있는 18홀 라운드) */
  differential?: number | null;
  /** "KGA 71/130" */
  rating?: string | null;
  /** 라운드 방식 칩 (기본 기록). 타당·스킨스에서 남긴 내 기록도 스코어카드로 */
  mode?: GameMode;
}

/** 방식 칩 색: 앱의 방식 표시와 같게 (기록 초록, 타당 파랑, 스킨스 노랑) */
const MODE_CHIP: Record<GameMode, [string, string]> = {
  record: [C.gainSoft, "#047857"],
  stroke: [C.blueSoft, "#1d4ed8"],
  skins: [C.goldSoft, "#b45309"],
  caddie: ["#ccfbf1", "#0f766e"],
  rank: ["#ede9fe", "#6d28d9"],
};

const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);

export async function renderScorecard(d: ScorecardData): Promise<HTMLCanvasElement> {
  await ensureFonts([d.course, d.player, d.tee ?? "", "기록타당스킨스보정타수파퍼트페어웨이그린적중해저드샌드샷전반후반합계버디보기더블이상훅슬라이스짧음벙커티샷멘탈게임년월일화수목금토OB·더블파"]);
  const W = 1000;
  const PAD = 44;
  const half = d.holes.length > 9;
  const halves = half ? [d.holes.slice(0, 9), d.holes.slice(9, 18)] : [d.holes.slice(0, 9)];
  // 머리줄 · 파 · 타수 · 퍼트 · 페어웨이 · 그린적중 · OB · 해저드 · 샌드샷
  const ROWS = [36, 44, 82, 46, 46, 46, 46, 46, 46];
  const TABLE_H = ROWS.reduce((a, b) => a + b, 0);
  const TOP = 214;
  const GAP = 34;
  // 표 아래 범례 두 줄 (타수 모양 / 티샷)
  const H = TOP + halves.length * TABLE_H + (halves.length - 1) * GAP + 128;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  // ---- 머리글: 날짜 · 골프장 · 홀/파/티 · 칩, 오른쪽에 큰 타수
  const played = d.holes.filter((h) => h.strokes != null);
  const strokes = played.reduce((a, h) => a + (h.strokes ?? 0), 0);
  const parPlayed = played.reduce((a, h) => a + h.par, 0);
  const parAll = d.holes.reduce((a, h) => a + h.par, 0);
  text(ctx, longDate(d.date), PAD, 54, { size: 16, weight: 600, color: C.soft });
  text(ctx, d.course || "이름 없는 라운드", PAD, 94, { size: 32, weight: 800 });
  text(ctx, [`${d.holes.length}홀`, `파 ${parAll}`, d.tee].filter(Boolean).join(" · "), PAD, 132, {
    size: 16,
    weight: 500,
    color: C.faint,
  });
  let cx = PAD;
  const mode = d.mode ?? "record";
  cx += chip(ctx, GAME_MODE_LABEL[mode], cx, 172, MODE_CHIP[mode][0], MODE_CHIP[mode][1]) + 8;
  if (d.differential != null) cx += chip(ctx, `보정타수 ${d.differential.toFixed(1)}`, cx, 172, C.blueSoft, C.blue) + 8;
  if (d.rating) chip(ctx, d.rating, cx, 172, C.fill2, C.soft);
  if (played.length > 0) {
    const rel = relLabel(strokes - parPlayed);
    const relW = width(ctx, rel, { size: 22, weight: 700, num: true });
    text(ctx, rel, W - PAD, 76, { size: 22, weight: 700, color: C.soft, align: "right", num: true });
    text(ctx, String(strokes), W - PAD - relW - 6, 104, { size: 66, weight: 800, align: "right", num: true });
  }

  // ---- 표: 이름칸 · 9홀 · 합계칸 2개 (전반 표는 전반, 후반 표는 후반·합계)
  const labelW = 150;
  const sumW = 104;
  const holeW = (W - 2 * PAD - labelW - 2 * sumW) / 9;
  const holeX = (i: number) => PAD + labelW + holeW * i + holeW / 2;
  const sumX = (k: number) => PAD + labelW + holeW * 9 + sumW * k + sumW / 2;

  halves.forEach((hs, hi) => {
    const y0 = TOP + hi * (TABLE_H + GAP);
    const sums = !half ? ["합계"] : hi === 0 ? ["전반"] : ["후반", "합계"];
    // 합계칸 바탕
    ctx.fillStyle = C.fill2;
    ctx.fillRect(PAD + labelW + holeW * 9, y0, sumW * sums.length, TABLE_H);
    hline(ctx, PAD + labelW, W - PAD, y0);
    let y = y0;
    const rowMid = (k: number) => y0 + ROWS.slice(0, k).reduce((a, b) => a + b, 0) + ROWS[k] / 2;
    for (const h of ROWS) {
      y += h;
      hline(ctx, PAD + labelW, W - PAD, y);
    }
    const base = hi === 0 ? 0 : 9;
    // 머리줄: 홀 번호
    hs.forEach((_, i) => text(ctx, String(base + i + 1), holeX(i), rowMid(0), { size: 14, weight: 600, color: C.faint, align: "center", num: true }));
    sums.forEach((s, k) => text(ctx, s, sumX(k), rowMid(0), { size: 14, weight: 600, color: C.faint, align: "center" }));

    const labels = ["파", "", "퍼트", "페어웨이", "그린적중", "OB", "해저드", "샌드샷"];
    labels.forEach((l, k) => l && text(ctx, l, PAD, rowMid(k + 1), { size: 17, weight: 600, color: C.ink }));
    text(ctx, d.player || "나", PAD, rowMid(2) - 10, { size: 22, weight: 800 });
    text(ctx, "타수", PAD, rowMid(2) + 16, { size: 14, weight: 500, color: C.faint });

    // 칸마다
    hs.forEach((h, i) => {
      const x = holeX(i);
      text(ctx, String(h.par), x, rowMid(1), { size: 19, weight: 600, align: "center", num: true });
      if (h.strokes != null) scoreMark(ctx, x, rowMid(2), 46, h.strokes, h.par);
      if (h.putts != null) text(ctx, String(h.putts), x, rowMid(3), { size: 19, weight: 600, align: "center", num: true });
      // 티샷: 방향 표시 (OB·해저드면 빨강, 벙커면 갈색). 방향 없이 떨어진 곳만 적었으면 그 색 점
      if (h.par >= 4 && h.fairway) fairwayMark(ctx, x, rowMid(4), h.fairway, 15, lieColor(h.lie));
      else if (h.par >= 4 && h.lie) {
        ctx.fillStyle = lieColor(h.lie);
        ctx.beginPath();
        ctx.arc(x, rowMid(4), 6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (girOf(h.par, h.strokes == null ? null : h.strokes - h.par, h.putts)) checkMark(ctx, x, rowMid(5));
      if (h.strokes != null) {
        ([h.ob, h.hazard, h.sand] as const).forEach((v, k) =>
          text(ctx, String(v), x, rowMid(6 + k), { size: 19, weight: 600, align: "center", num: true, color: v ? C.ink : C.faint })
        );
      }
    });

    // 합계칸 값: 그 구간(전반·후반) / 전체(합계)
    const groups = sums.map((s) => (s === "합계" ? d.holes : hs));
    groups.forEach((g, k) => {
      const x = sumX(k);
      const pl = g.filter((h) => h.strokes != null);
      const st = pl.reduce((a, h) => a + (h.strokes ?? 0), 0);
      const pp = pl.reduce((a, h) => a + h.par, 0);
      text(ctx, String(g.reduce((a, h) => a + h.par, 0)), x, rowMid(1), { size: 19, weight: 700, align: "center", num: true });
      if (pl.length > 0) {
        const rel = relLabel(st - pp);
        const sw = width(ctx, String(st), { size: 30, weight: 800, num: true });
        const rw = width(ctx, rel, { size: 14, weight: 700, num: true });
        const left = x - (sw + 2 + rw) / 2;
        text(ctx, String(st), left, rowMid(2) + 2, { size: 30, weight: 800, num: true });
        text(ctx, rel, left + sw + 2, rowMid(2) - 10, { size: 14, weight: 700, color: C.soft, num: true });
      }
      const putts = pl.filter((h) => h.putts != null);
      if (putts.length > 0) text(ctx, String(putts.reduce((a, h) => a + (h.putts ?? 0), 0)), x, rowMid(3), { size: 19, weight: 700, align: "center", num: true });
      const tee = pl.filter((h) => h.par >= 4 && h.fairway);
      text(ctx, pct(tee.filter((h) => h.fairway === "hit").length, tee.length), x, rowMid(4), { size: 18, weight: 700, align: "center", num: true, color: tee.length ? C.ink : C.faint });
      const gir = pl.filter((h) => h.putts != null);
      text(ctx, pct(gir.filter((h) => girOf(h.par, (h.strokes ?? 0) - h.par, h.putts)).length, gir.length), x, rowMid(5), { size: 18, weight: 700, align: "center", num: true, color: gir.length ? C.ink : C.faint });
      text(ctx, String(pl.reduce((a, h) => a + h.ob, 0)), x, rowMid(6), { size: 19, weight: 700, align: "center", num: true });
      text(ctx, String(pl.reduce((a, h) => a + h.hazard, 0)), x, rowMid(7), { size: 19, weight: 700, align: "center", num: true });
      text(ctx, String(pl.reduce((a, h) => a + h.sand, 0)), x, rowMid(8), { size: 19, weight: 700, align: "center", num: true });
    });
  });

  // ---- 범례 (첫 줄 타수 모양, 둘째 줄 티샷) · 앱 이름
  let ly = H - 80;
  let lx = PAD;
  /** pad: 테두리가 바깥으로 나오는 모양(더블 보기 이상·더블파)의 여백 */
  const legend = (draw: (x: number) => void, label: string, pad = 0) => {
    draw(lx + 9 + pad);
    lx += 24 + pad * 2 + text(ctx, label, lx + 24 + pad * 2, ly, { size: 13, weight: 600, color: C.soft }) + 16;
  };
  legend((x) => scoreMark(ctx, x, ly, 18, 3, 4), "버디");
  legend((x) => scoreMark(ctx, x, ly, 18, 4, 4), "파");
  legend((x) => scoreMark(ctx, x, ly, 18, 5, 4), "보기");
  legend((x) => scoreMark(ctx, x, ly, 18, 6, 4), "더블 보기 이상", 4);
  legend((x) => scoreMark(ctx, x, ly, 18, 8, 4), "더블파", 4);
  ly = H - 48;
  lx = PAD;
  legend((x) => fairwayMark(ctx, x, ly, "hit", 9), "적중");
  legend((x) => fairwayMark(ctx, x, ly, "left", 9), "훅");
  legend((x) => fairwayMark(ctx, x, ly, "right", 9), "슬라이스");
  legend((x) => fairwayMark(ctx, x, ly, "short", 9), "짧음");
  lx += 6;
  legend((x) => fairwayMark(ctx, x, ly, "hit", 9, C.loss), "티샷 OB·해저드");
  legend((x) => fairwayMark(ctx, x, ly, "hit", 9, C.bunker), "티샷 벙커");
  text(ctx, "멘탈게임", W - PAD, ly, { size: 14, weight: 800, color: C.faint, align: "right" });
  return canvas;
}

/* ------------------------------ 정산 결과 ------------------------------ */

export interface SettlementPlayer {
  id: string;
  name: string;
  /** 타수와 파 대비 (안 친 사람은 null) */
  gross: number | null;
  rel: number | null;
  net: number;
  /** 금액 내역: [["타당", 17000], ["버디", 4000], ["핸디", 2000]] */
  parts: [string, number][];
  /** 등수 (공동 등수). 없으면 줄 순서 */
  rank?: number;
  /** 이름 아래 줄 (있으면 금액 내역 대신): "꼴찌 2번", "+12점" */
  note?: string;
  /** 오른쪽 값 (있으면 금액 대신): "+12점" */
  valueText?: string;
}

export interface SettlementData {
  /** "최종 정산" / "중간 정산" */
  title: string;
  course: string;
  date: string;
  teeTime?: string;
  tee?: string;
  /** 칩: "18홀", "타당 1,000원", "계좌이체" … */
  chips: string[];
  /** 정산 금액 큰 순 */
  players: SettlementPlayer[];
  transfers: { from: string; to: string; amount: number }[];
  /** 홀별 파와 사람별 파 대비 타수, 그 홀 배수 (1 보다 크면 배판: 홀 번호를 노랗게) */
  holes: { par: number; scores: Record<string, number | null>; multiplier: number }[];
  /** 순위 칸 제목 (기본 "순위와 정산 금액") / 송금 칸 제목 (기본 "송금") */
  listTitle?: string;
  transfersTitle?: string;
  /** 송금 칸을 그리지 않는다 (등수 내기 금액 없음) */
  hideTransfers?: boolean;
}

const tone = (n: number) => (n > 0 ? C.gain : n < 0 ? C.loss : C.soft);
const shortWon = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : "±"}${Math.abs(n).toLocaleString("ko-KR")}`;

export async function renderSettlement(d: SettlementData): Promise<HTMLCanvasElement> {
  await ensureFonts([
    d.course,
    d.tee ?? "",
    ...d.chips,
    ...d.players.map((p) => p.name + p.parts.map(([l]) => l).join("") + (p.note ?? "") + (p.valueText ?? "")),
    d.listTitle ?? "",
    d.transfersTitle ?? "",
    "멘탈게임최종중간정산순위와금액송금홀별스코어주고받을이없어요에서한결과예요파전반후반합계배판홀더블년월일화수목금토",
  ]);
  const W = 720;
  const PAD = 28;
  const CW = W - 2 * PAD;
  const n = d.players.length;
  const halves = d.holes.length > 9 ? [0, 9] : [0];
  const PROW = 74;
  const TROW = 54;
  const HEAD = 30;
  const SROW = 40;
  const halfH = HEAD + 32 + n * SROW;
  /** 배판 홀이나 더블파가 있으면 표 아래에 범례 한 줄 */
  const hasBae = d.holes.some((h) => h.multiplier > 1);
  const hasDoublePar = d.holes.some((h) =>
    d.players.some((p) => {
      const rel = h.scores[p.id];
      return rel != null && h.par + rel >= h.par * 2;
    })
  );
  // 범례 줄: 표 아래로 띄운 간격 + 범례 높이
  const LEG = hasBae || hasDoublePar ? 44 : 0;
  const sec = (rows: number) => 40 + rows;
  const H =
    196 +
    sec(n * PROW) +
    26 +
    (d.hideTransfers ? 0 : sec(Math.max(1, d.transfers.length) * TROW) + 26) +
    sec(halves.length * halfH + (halves.length - 1) * 18 + 24 + LEG) +
    72;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.fill;
  ctx.fillRect(0, 0, W, H);

  // ---- 머리글
  text(ctx, `멘탈게임 · ${d.title}`, PAD, 44, { size: 14, weight: 800, color: C.blue });
  text(ctx, d.course || "이름 없는 라운드", PAD, 82, { size: 30, weight: 800 });
  text(ctx, [longDate(d.date) + (d.teeTime ? ` ${d.teeTime}` : ""), d.tee].filter(Boolean).join(" · "), PAD, 118, {
    size: 15,
    weight: 500,
    color: C.soft,
  });
  let cx = PAD;
  for (const c of d.chips) cx += chip(ctx, c, cx, 156, "#fff", C.soft, 13) + 6;

  const card = (y: number, h: number) => {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.06)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "#fff";
    roundRect(ctx, PAD, y, CW, h, 18);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    roundRect(ctx, PAD + 0.5, y + 0.5, CW - 1, h - 1, 18);
    ctx.stroke();
  };
  const title = (s: string, y: number) => text(ctx, s, PAD + 4, y + 16, { size: 16, weight: 800 });

  // ---- 순위와 금액
  let y = 196;
  title(d.listTitle ?? "순위와 정산 금액", y);
  y += 40;
  card(y, n * PROW);
  // 칸 폭 고정: 가장 긴 금액에 맞춰 금액 칸을 잡고, 그 왼쪽에 파 대비 타원·타수를 줄마다 같은 자리에
  const netLabel = (v: number) => (v === 0 ? "±0원" : wonSigned(v));
  const valueOf = (p: SettlementPlayer) => p.valueText ?? netLabel(p.net);
  const netX = PAD + CW - 20;
  const netColW = Math.max(...d.players.map((p) => width(ctx, valueOf(p), { size: 21, weight: 900, num: true })));
  const pillCx = netX - netColW - 14 - 21;
  const grossRight = pillCx - 27;
  const grossColW = Math.max(
    0,
    ...d.players.map((p) => (p.gross == null ? 0 : width(ctx, `${p.gross}타`, { size: 17, weight: 800, num: true })))
  );
  const partsRoom = grossRight - grossColW - 14 - (PAD + 62);
  d.players.forEach((p, i) => {
    const mid = y + i * PROW + PROW / 2;
    if (i > 0) hline(ctx, PAD + 18, PAD + CW - 18, y + i * PROW);
    const top = p.rank != null ? p.rank === 1 : i === 0 && p.net > 0;
    ctx.fillStyle = top ? C.goldSoft : C.fill2;
    ctx.beginPath();
    ctx.arc(PAD + 34, mid, 15, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(p.rank ?? i + 1), PAD + 34, mid + 1, { size: 15, weight: 800, color: top ? C.gold : C.soft, align: "center", num: true });
    text(ctx, p.name || "?", PAD + 62, mid - 11, { size: 19, weight: 800 });
    text(ctx, valueOf(p), netX, mid + 1, {
      size: 21,
      weight: 900,
      color: p.valueText ? C.ink : tone(p.net),
      align: "right",
      num: true,
    });
    if (p.gross != null && p.rel != null) {
      ctx.fillStyle = C.fill2;
      roundRect(ctx, pillCx - 21, mid - 11, 42, 22, 11);
      ctx.fill();
      text(ctx, relLabel(p.rel), pillCx, mid + 1, { size: 12, weight: 800, color: C.soft, align: "center", num: true });
      text(ctx, `${p.gross}타`, grossRight, mid + 1, { size: 17, weight: 800, align: "right", num: true });
    }
    // 이름 아래 금액 내역: 타수 칸과 겹치면 글자를 줄인다
    const parts = p.parts.filter(([, v]) => v !== 0);
    const line =
      p.note ?? (parts.length ? parts.map(([l, v]) => `${l} ${shortWon(v)}`).join(" · ") : "주고받을 돈 없음");
    const lw = width(ctx, line, { size: 13, weight: 500, num: true });
    text(ctx, line, PAD + 62, mid + 14, {
      size: lw > partsRoom ? Math.max(10, Math.floor(((13 * partsRoom) / lw) * 2) / 2) : 13,
      weight: 500,
      color: C.faint,
      num: true,
    });
  });
  y += n * PROW + 26;

  // ---- 송금
  if (!d.hideTransfers) {
    title(d.transfersTitle ?? "송금", y);
    y += 40;
    const tn = Math.max(1, d.transfers.length);
    card(y, tn * TROW);
    if (d.transfers.length === 0) {
      text(ctx, "주고받을 금액이 없어요", PAD + CW / 2, y + TROW / 2, { size: 15, weight: 600, color: C.faint, align: "center" });
    }
    d.transfers.forEach((t, i) => {
      const mid = y + i * TROW + TROW / 2;
      if (i > 0) hline(ctx, PAD + 18, PAD + CW - 18, y + i * TROW);
      const fw = text(ctx, t.from || "?", PAD + 22, mid, { size: 17, weight: 700 });
      strokePath(ctx, "M5 12h13M13 7l5 5-5 5", PAD + 22 + fw + 18, mid, 20, C.faint, 2.2);
      text(ctx, t.to || "?", PAD + 22 + fw + 36, mid, { size: 17, weight: 700 });
      text(ctx, won(t.amount), PAD + CW - 20, mid + 1, { size: 18, weight: 800, align: "right", num: true });
    });
    y += tn * TROW + 26;
  }

  // ---- 홀별 스코어 (사람별 타수 모양)
  title("홀별 스코어", y);
  y += 40;
  card(y, halves.length * halfH + (halves.length - 1) * 18 + 24 + LEG);
  const nameW = 82;
  const sumW = 52;
  const inner = CW - 32;
  const holeW = (inner - nameW - sumW) / 9;
  const x0 = PAD + 16;
  halves.forEach((start, hi) => {
    const hs = d.holes.slice(start, start + 9);
    const ty = y + 12 + hi * (halfH + 18);
    const hx = (i: number) => x0 + nameW + holeW * i + holeW / 2;
    const sx = x0 + nameW + holeW * 9 + sumW / 2;
    ctx.fillStyle = C.fill;
    ctx.fillRect(x0 + nameW + holeW * 9, ty, sumW, halfH);
    // 홀 번호: 배판 홀은 노란 바탕
    hs.forEach((h, i) => {
      const bae = h.multiplier > 1;
      if (bae) {
        ctx.fillStyle = C.goldSoft;
        roundRect(ctx, hx(i) - 14, ty + HEAD / 2 - 10, 28, 20, 10);
        ctx.fill();
      }
      text(ctx, String(start + i + 1), hx(i), ty + HEAD / 2 + 0.5, {
        size: 12,
        weight: bae ? 800 : 600,
        color: bae ? C.gold : C.faint,
        align: "center",
        num: true,
      });
    });
    text(ctx, halves.length === 1 ? "합계" : hi === 0 ? "전반" : "후반", sx, ty + HEAD / 2, { size: 12, weight: 600, color: C.faint, align: "center" });
    hline(ctx, x0, x0 + inner, ty + HEAD);
    text(ctx, "파", x0 + 4, ty + HEAD + 16, { size: 13, weight: 600, color: C.soft });
    hs.forEach((h, i) => text(ctx, String(h.par), hx(i), ty + HEAD + 16, { size: 14, weight: 600, color: C.soft, align: "center", num: true }));
    text(ctx, String(hs.reduce((a, h) => a + h.par, 0)), sx, ty + HEAD + 16, { size: 14, weight: 700, color: C.soft, align: "center", num: true });
    d.players.forEach((p, k) => {
      const ry = ty + HEAD + 32 + k * SROW;
      hline(ctx, x0, x0 + inner, ry);
      const mid = ry + SROW / 2;
      text(ctx, p.name || "?", x0 + 4, mid, { size: 14, weight: 700 });
      let sum = 0;
      let any = false;
      hs.forEach((h, i) => {
        const rel = h.scores[p.id];
        if (rel == null) return;
        any = true;
        sum += h.par + rel;
        scoreMark(ctx, hx(i), mid, 28, h.par + rel, h.par);
      });
      text(ctx, any ? String(sum) : "–", sx, mid + 1, { size: 16, weight: 800, align: "center", num: true });
    });
  });
  if (LEG > 0) {
    const ly = y + 12 + halves.length * halfH + (halves.length - 1) * 18 + 30;
    let lx = x0 + 4;
    if (hasBae) {
      ctx.fillStyle = C.goldSoft;
      roundRect(ctx, lx, ly - 10, 28, 20, 10);
      ctx.fill();
      // 범례 칸 안 숫자는 실제 첫 배판 홀 번호
      const first = d.holes.findIndex((h) => h.multiplier > 1) + 1;
      text(ctx, String(first), lx + 14, ly + 0.5, { size: 12, weight: 800, color: C.gold, align: "center", num: true });
      lx += 36 + text(ctx, "배판 홀", lx + 36, ly, { size: 12, weight: 600, color: C.soft }) + 18;
    }
    if (hasDoublePar) {
      scoreMark(ctx, lx + 12, ly, 18, 8, 4);
      text(ctx, "더블파", lx + 30, ly, { size: 12, weight: 600, color: C.soft });
    }
  }
  y += halves.length * halfH + (halves.length - 1) * 18 + 24 + LEG;

  text(ctx, "멘탈게임에서 정산한 결과예요", W / 2, y + 36, { size: 13, weight: 600, color: C.faint, align: "center" });
  return canvas;
}

/* ------------------------------ 올해의 골프 결산 ------------------------------ */

const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

export async function renderYearReview(d: YearReview & { name: string }): Promise<HTMLCanvasElement> {
  const tiles: { label: string; value: string; sub: string; color?: string }[] = [
    { label: "평균 타수", value: d.avg18 != null ? `${d.avg18}타` : "–", sub: `18홀 ${d.rounds18}라운드` },
    {
      label: "베스트 스코어",
      value: d.best18 ? `${d.best18.gross}타` : "–",
      sub: d.best18 ? `${md(d.best18.date)} · ${d.best18.course}` : "18홀을 끝까지 치면",
      color: C.loss,
    },
    {
      label: "가장 많이 간 골프장",
      value: d.topCourse ? d.topCourse.name : "–",
      sub: d.topCourse ? `${d.topCourse.count}번 · 모두 ${d.courses}곳` : "",
    },
    {
      label: "가장 많이 함께 친 사람",
      value: d.companions[0] ? d.companions[0].name : "–",
      sub: d.companions[0] ? `${d.companions[0].count}번 · 모두 ${d.companionCount}명` : "",
    },
    { label: "버디 · 이글", value: `${d.birdies} · ${d.eagles}`, sub: `파 ${d.pars}개`, color: C.red },
    d.money
      ? {
          label: "내기 정산",
          value: d.money.total === 0 ? "±0원" : wonSigned(d.money.total),
          sub: `${d.money.wins}승 ${d.money.losses}패 · ${d.money.rounds}라운드`,
          color: d.money.total > 0 ? C.gain : d.money.total < 0 ? C.loss : C.soft,
        }
      : { label: "얻은 배지", value: `${d.badges.length}개`, sub: "올해 새로 얻은 배지", color: C.gold },
  ];
  await ensureFonts([
    d.name,
    ...tiles.flatMap((t) => [t.label, t.value, t.sub]),
    ...d.badges.map((b) => b.title),
    "멘탈게임골프결산님의라운드홀을걸었어요올해얻은배지에서돌아본한해",
  ]);
  const W = 720;
  const PAD = 28;
  const CW = W - 2 * PAD;
  const GAP = 12;
  const TW = (CW - GAP) / 2;
  const TH = 112;
  const BADGE_H = d.badges.length ? 96 : 0;
  const H = 150 + 168 + 22 + 3 * TH + 2 * GAP + (BADGE_H ? 22 + BADGE_H : 0) + 76;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.fill;
  ctx.fillRect(0, 0, W, H);

  const card = (x: number, y: number, w: number, h: number, fill = "#fff") => {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.06)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.restore();
    if (fill === "#fff") {
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 18);
      ctx.stroke();
    }
  };
  /** 칸 폭에 맞게 글자를 줄인다 */
  const fit = (s: string, max: number, o: TextOpt) => {
    let t = s;
    while (t.length > 1 && width(ctx, t, o) > max) t = t.slice(0, -1);
    return t === s ? s : `${t.slice(0, -1)}…`;
  };

  // ---- 머리글
  text(ctx, `멘탈게임 · ${d.year} 골프 결산`, PAD, 44, { size: 14, weight: 800, color: C.blue });
  text(ctx, `${d.name}님의 ${d.year}`, PAD, 84, { size: 30, weight: 800 });
  if (d.first && d.last)
    text(ctx, `${md(d.first.date)} 첫 라운드부터 ${md(d.last.date)}까지`, PAD, 118, { size: 15, weight: 500, color: C.soft });

  // ---- 라운드 · 홀 (파란 상자)
  let y = 150;
  ctx.save();
  const g = ctx.createLinearGradient(PAD, y, PAD + CW, y + 168);
  g.addColorStop(0, "#2563eb");
  g.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = g;
  roundRect(ctx, PAD, y, CW, 168, 20);
  ctx.fill();
  ctx.restore();
  const half = CW / 2;
  for (const [i, [v, unit, label]] of ([
    [String(d.rounds), "라운드", "올해 끝낸 라운드"],
    [String(d.holes), "홀", "걸어온 홀"],
  ] as const).entries()) {
    const x = PAD + 28 + i * half;
    text(ctx, label, x, y + 44, { size: 15, weight: 600, color: "rgba(255,255,255,0.82)" });
    const vw = text(ctx, v, x, y + 102, { size: 60, weight: 800, color: "#fff", num: true });
    text(ctx, unit, x + vw + 6, y + 112, { size: 20, weight: 800, color: "#fff" });
  }

  // ---- 칸 여섯 개
  y += 168 + 22;
  tiles.forEach((t, i) => {
    const x = PAD + (i % 2) * (TW + GAP);
    const ty = y + Math.floor(i / 2) * (TH + GAP);
    card(x, ty, TW, TH);
    text(ctx, t.label, x + 20, ty + 28, { size: 13, weight: 700, color: C.soft });
    const big = t.value.length > 7 ? 22 : 30;
    text(ctx, fit(t.value, TW - 40, { size: big, weight: 800 }), x + 20, ty + 64, {
      size: big,
      weight: 800,
      color: t.color ?? C.ink,
      num: /^[\d+−±,.\s·-]+(타|원|개)?$/.test(t.value),
    });
    if (t.sub) text(ctx, fit(t.sub, TW - 40, { size: 13, weight: 500 }), x + 20, ty + 94, { size: 13, weight: 500, color: C.faint });
  });
  y += 3 * TH + 2 * GAP;

  // ---- 얻은 배지
  if (BADGE_H) {
    y += 22;
    card(PAD, y, CW, BADGE_H);
    text(ctx, `올해 얻은 배지 ${d.badges.length}개`, PAD + 20, y + 28, { size: 13, weight: 700, color: C.soft });
    let bx = PAD + 20;
    for (const b of d.badges) {
      const w = width(ctx, b.title, { size: 13, weight: 700 }) + 24;
      if (bx + w > PAD + CW - 20) break;
      bx += chip(ctx, b.title, bx, y + 64, C.fill2, C.ink, 13) + 6;
    }
    y += BADGE_H;
  }

  text(ctx, "멘탈게임에서 돌아본 한 해", W / 2, y + 44, { size: 13, weight: 600, color: C.faint, align: "center" });
  return canvas;
}

/* ------------------------------ 공유·저장 ------------------------------ */

/**
 * 이미지 제목의 골프장: "클럽72" + 레이팅 코스 "오션 (Out)+오션 (In)" → "클럽72 (오션)".
 * 코스 이름이 "아웃+인"처럼 전반·후반뿐이면 골프장 이름만
 */
export function courseTitle(name: string, rating: CourseRating | null): string {
  if (!rating?.course) return name;
  const parts = [
    ...new Set(
      rating.course
        .split("+")
        .map((c) => c.replace(/\s*\([^)]*\)/g, "").trim())
        .filter((c) => c && !/^(아웃|인|out|in|전반|후반)$/i.test(c))
    ),
  ];
  return parts.length > 0 ? `${name} (${parts.join("·")})` : name;
}

export const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("NO_IMAGE"))), "image/png")
  );
