import type { CSSProperties, ReactNode } from "react";

/*
 * 골프 룰 그림: R&A 규칙 해설 그림처럼 홀을 위에서 내려다보고(홀은 위쪽), 드롭할 수 있는 곳을 파란 음영으로 칠한다.
 * 옆에서 본 그림(드롭·벙커·깃대·두 번 맞음)은 하늘과 땅을 둔다. 모두 320×200 안에 그린다.
 * 잔디 무늬·물·모래·공 음영은 FigureDefs 를 한 번만 그려 두고 모든 그림이 함께 쓴다
 */

const C = {
  ink: "#1f2937",
  soft: "#4b5563",
  blue: "#2563eb",
  relief: "rgba(37, 99, 235, 0.2)",
  red: "#e11d48",
  yellow: "#eab308",
  ok: "#059669",
  bad: "#dc2626",
  amber: "#c2410c",
  amberFill: "rgba(234, 88, 12, 0.16)",
  skin: "#f1c6a3",
  skinDark: "#dda987",
  shirt: "#3b82f6",
  shirtDark: "#2563eb",
  shirt2: "#10b981",
  pants: "#334155",
  pantsDark: "#1e293b",
  cap: "#1e293b",
};

/** 모든 그림이 함께 쓰는 무늬·그러데이션 (룰 화면에 한 번만 그린다) */
export function FigureDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <pattern id="rl-rough" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#cfe6b3" />
          <path d="M2 5 l1 -3 M8 12 l1 -3 M11 4 l1 -2.5" stroke="#b7d897" strokeWidth="1" strokeLinecap="round" />
        </pattern>
        <pattern id="rl-fairway" width="320" height="28" patternUnits="userSpaceOnUse">
          <rect width="320" height="14" fill="#acd986" />
          <rect y="14" width="320" height="14" fill="#9fd178" />
        </pattern>
        <pattern id="rl-out" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#dfe6d6" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#cbd3c1" strokeWidth="3" />
        </pattern>
        <pattern id="rl-sandgrain" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r="0.7" fill="#d9bd82" />
          <circle cx="6.5" cy="7" r="0.6" fill="#d9bd82" />
        </pattern>
        <pattern id="rl-dimple" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1" fill="#e2e6eb" />
        </pattern>
        <radialGradient id="rl-green" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#a8e28a" />
          <stop offset="100%" stopColor="#7fc861" />
        </radialGradient>
        <linearGradient id="rl-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a5dcf6" />
          <stop offset="100%" stopColor="#62b3e4" />
        </linearGradient>
        <radialGradient id="rl-sand" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#faefd2" />
          <stop offset="100%" stopColor="#e8d09a" />
        </radialGradient>
        <linearGradient id="rl-path" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d4d0c7" />
          <stop offset="50%" stopColor="#e6e3dc" />
          <stop offset="100%" stopColor="#d4d0c7" />
        </linearGradient>
        <radialGradient id="rl-ball" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f3f4f6" />
          <stop offset="100%" stopColor="#c3c9d2" />
        </radialGradient>
        <radialGradient id="rl-tree" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#8fd170" />
          <stop offset="100%" stopColor="#3f8a37" />
        </radialGradient>
        <radialGradient id="rl-marker" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#b8c2cf" />
        </radialGradient>
        <linearGradient id="rl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eaf4fd" />
          <stop offset="100%" stopColor="#f7fbff" />
        </linearGradient>
        <linearGradient id="rl-turf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9fd47a" />
          <stop offset="100%" stopColor="#79b957" />
        </linearGradient>
        <linearGradient id="rl-shaft" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6b7280" />
          <stop offset="50%" stopColor="#e5e7eb" />
          <stop offset="100%" stopColor="#6b7280" />
        </linearGradient>
        <linearGradient id="rl-iron" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3f4f6" />
          <stop offset="100%" stopColor="#9ca3af" />
        </linearGradient>
        <linearGradient id="rl-watch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4b5563" />
          <stop offset="100%" stopColor="#111827" />
        </linearGradient>
        <linearGradient id="rl-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a47648" />
          <stop offset="100%" stopColor="#6b4527" />
        </linearGradient>
        <pattern id="rl-pebble" width="26" height="22" patternUnits="userSpaceOnUse">
          <ellipse cx="5" cy="6" rx="2.2" ry="1.4" fill="#c49a6c" opacity="0.7" />
          <ellipse cx="17" cy="15" rx="1.6" ry="1.1" fill="#5a3b22" opacity="0.6" />
          <circle cx="21" cy="4" r="0.9" fill="#d6b48a" opacity="0.8" />
          <circle cx="9" cy="17" r="0.8" fill="#4a2f1b" opacity="0.6" />
        </pattern>
        <linearGradient id="rl-depth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0,0,0,0.16)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        <linearGradient id="rl-cup" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="50%" stopColor="#374151" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="rl-pole" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c7ccd4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

type P = { x: number; y: number };

function Fig({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 200" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

const Rough = () => <rect width="320" height="200" fill="url(#rl-rough)" />;
/** 옆에서 본 그림 바탕: 하늘과 잔디 (ground 높이) */
const SideBg = ({ ground = 168 }: { ground?: number }) => (
  <g>
    <rect width="320" height="200" fill="url(#rl-sky)" />
    <rect y={ground} width="320" height={200 - ground} fill="url(#rl-turf)" />
    <path d={Array.from({ length: 40 }, (_, i) => `M${i * 8 + 2} ${ground} l2 -5 l2 5`).join(" ")} fill="#9fd47a" />
  </g>
);

/** 글자 (잔디 무늬 위에서도 읽히게 흰 테두리) */
function T({
  x,
  y,
  children,
  a = "middle",
  c = C.ink,
  s = 11,
  w = 700,
}: P & { children: ReactNode; a?: "start" | "middle" | "end"; c?: string; s?: number; w?: number }) {
  const halo: CSSProperties = { paintOrder: "stroke" };
  return (
    <text x={x} y={y} textAnchor={a} fill={c} fontSize={s} fontWeight={w} stroke="#fff" strokeWidth={3} strokeLinejoin="round" style={halo}>
      {children}
    </text>
  );
}

/** 공 (그림자·음영). ghost 는 있을 것 같은 곳(점선) */
function Ball({ x, y, r = 5, ghost }: P & { r?: number; ghost?: boolean }) {
  if (ghost)
    return <circle cx={x} cy={y} r={r} fill="rgba(255,255,255,0.55)" stroke="#4b5563" strokeWidth={1.2} strokeDasharray="2 1.6" />;
  return (
    <g>
      <ellipse cx={x + r * 0.35} cy={y + r * 0.75} rx={r * 1.05} ry={r * 0.55} fill="rgba(0,0,0,0.2)" />
      <circle cx={x} cy={y} r={r} fill="url(#rl-ball)" stroke="#8b95a1" strokeWidth={0.8} />
    </g>
  );
}

/** 그린 (가장자리 프린지) */
const Green = ({ x, y, rx, ry }: P & { rx: number; ry: number }) => (
  <g>
    <ellipse cx={x} cy={y} rx={rx + 4} ry={ry + 4} fill="#93cf72" />
    <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="url(#rl-green)" />
  </g>
);

/** 홀과 깃대 (깃발은 펄럭이게, 땅에 그림자) */
const Flag = ({ x, y, c = C.red }: P & { c?: string }) => (
  <g>
    <line x1={x} y1={y} x2={x + 16} y2={y + 5} stroke="rgba(0,0,0,0.18)" strokeWidth={2} strokeLinecap="round" />
    <ellipse cx={x} cy={y} rx={4.2} ry={2.2} fill="#1f2937" />
    <line x1={x} y1={y} x2={x} y2={y - 24} stroke="#f8fafc" strokeWidth={2.2} strokeLinecap="round" />
    <line x1={x} y1={y} x2={x} y2={y - 24} stroke="#9ca3af" strokeWidth={0.6} />
    <path d={`M${x + 1} ${y - 24} q6 -2 13 2 q-4 3 0 7 q-7 -3 -13 -1z`} fill={c} stroke="rgba(0,0,0,0.15)" strokeWidth={0.6} />
  </g>
);

/** 나무 (그림자 + 둥근 수관 세 겹) */
const Tree = ({ x, y, r = 16 }: P & { r?: number }) => (
  <g>
    <ellipse cx={x + r * 0.35} cy={y + r * 0.55} rx={r * 1.25} ry={r * 0.8} fill="rgba(0,0,0,0.16)" />
    <circle cx={x - r * 0.55} cy={y + r * 0.15} r={r * 0.72} fill="url(#rl-tree)" />
    <circle cx={x + r * 0.55} cy={y + r * 0.2} r={r * 0.68} fill="url(#rl-tree)" />
    <circle cx={x} cy={y - r * 0.3} r={r * 0.8} fill="url(#rl-tree)" />
    <circle cx={x - r * 0.25} cy={y - r * 0.55} r={r * 0.22} fill="rgba(255,255,255,0.22)" />
  </g>
);

/** 말뚝 (작은 기둥) */
const Stake = ({ x, y, c }: P & { c: string }) => (
  <g>
    <ellipse cx={x + 3} cy={y + 1} rx={4} ry={1.6} fill="rgba(0,0,0,0.2)" />
    <rect x={x - 2.4} y={y - 11} width={4.8} height={11} rx={1} fill={c} stroke="rgba(0,0,0,0.35)" strokeWidth={0.6} />
    <rect x={x - 2.4} y={y - 11} width={1.8} height={11} fill="rgba(255,255,255,0.35)" />
    <ellipse cx={x} cy={y - 11} rx={2.4} ry={1.1} fill={c} stroke="rgba(0,0,0,0.3)" strokeWidth={0.5} />
  </g>
);
const Stakes = ({ pts, c }: { pts: P[]; c: string }) => (
  <g>
    {pts.map((p, i) => (
      <Stake key={i} {...p} c={c} />
    ))}
  </g>
);

/** 물결 (물 위 흰 줄) */
const Waves = ({ pts }: { pts: P[] }) => (
  <g stroke="rgba(255,255,255,0.7)" strokeWidth={1.4} fill="none" strokeLinecap="round">
    {pts.map((p, i) => (
      <path key={i} d={`M${p.x} ${p.y} q4 -3 8 0 t8 0`} />
    ))}
  </g>
);

const Ok = ({ x, y }: P) => (
  <g>
    <circle cx={x} cy={y + 1} r={8.5} fill="rgba(0,0,0,0.15)" />
    <circle cx={x} cy={y} r={8.5} fill={C.ok} stroke="#fff" strokeWidth={1.5} />
    <path d={`M${x - 3.6} ${y} l2.6 2.7 l5 -5.2`} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </g>
);
const No = ({ x, y }: P) => (
  <g>
    <circle cx={x} cy={y + 1} r={8.5} fill="rgba(0,0,0,0.15)" />
    <circle cx={x} cy={y} r={8.5} fill={C.bad} stroke="#fff" strokeWidth={1.5} />
    <path d={`M${x - 3.2} ${y - 3.2} l6.4 6.4 M${x + 3.2} ${y - 3.2} l-6.4 6.4`} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
  </g>
);

/** 공이 경계를 넘어간 지점 (X) */
const Cross = ({ x, y, c = C.amber }: P & { c?: string }) => (
  <g>
    <circle cx={x} cy={y} r={7} fill="#fff" stroke={c} strokeWidth={1.6} />
    <path d={`M${x - 3.2} ${y - 3.2} l6.4 6.4 M${x + 3.2} ${y - 3.2} l-6.4 6.4`} stroke={c} strokeWidth={2} strokeLinecap="round" />
  </g>
);

/** 화살촉: (x, y) 끝, angle 방향 */
const head = (x: number, y: number, angle: number, c: string) => {
  const l = 7;
  const w = 3.6;
  const bx = x - l * Math.cos(angle);
  const by = y - l * Math.sin(angle);
  const nx = -Math.sin(angle) * w;
  const ny = Math.cos(angle) * w;
  return <path d={`M${x} ${y} L${bx + nx} ${by + ny} L${bx - nx} ${by - ny}Z`} fill={c} />;
};

function Line({ from, to, c = C.ink, dash, w = 1.6, arrow }: { from: P; to: P; c?: string; dash?: string; w?: number; arrow?: boolean }) {
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={c} strokeWidth={w} strokeDasharray={dash} strokeLinecap="round" />
      {arrow && head(to.x, to.y, Math.atan2(to.y - from.y, to.x - from.x), c)}
    </g>
  );
}

/** 공이 날아간 길 (휘는 선, 끝에 화살촉) */
function Shot({ from, via, to, c = "#374151", dash = "4 3", arrow = true }: { from: P; via: P; to: P; c?: string; dash?: string; arrow?: boolean }) {
  const d = `M${from.x} ${from.y} Q${via.x} ${via.y} ${to.x} ${to.y}`;
  return (
    <g>
      <path d={d} fill="none" stroke="#fff" strokeWidth={3.4} strokeOpacity={0.6} />
      <path d={d} fill="none" stroke={c} strokeWidth={1.7} strokeDasharray={dash} />
      {arrow && head(to.x, to.y, Math.atan2(to.y - via.y, to.x - via.x), c)}
    </g>
  );
}

/** 드롭할 수 있는 반원: 기준점에서 r 안, 홀에 가깝지 않은 쪽 */
function HalfDisc({ at, r, hole, clip }: { at: P; r: number; hole: P; clip?: string }) {
  const t = Math.atan2(at.y - hole.y, at.x - hole.x);
  const p1 = { x: at.x + r * Math.cos(t - Math.PI / 2), y: at.y + r * Math.sin(t - Math.PI / 2) };
  const p2 = { x: at.x + r * Math.cos(t + Math.PI / 2), y: at.y + r * Math.sin(t + Math.PI / 2) };
  return (
    <path
      d={`M${p1.x} ${p1.y} A${r} ${r} 0 0 1 ${p2.x} ${p2.y}Z`}
      fill={C.relief}
      stroke={C.blue}
      strokeWidth={1.5}
      strokeDasharray="4 3"
      clipPath={clip ? `url(#${clip})` : undefined}
    />
  );
}

/** 홀 → 기준점 직선을 뒤로 늘린 끝 (y 까지) */
const backTo = (hole: P, at: P, y: number): P => ({ x: at.x + ((at.x - hole.x) * (y - at.y)) / (at.y - hole.y), y });

/** 뒤쪽 선 드롭 구역 (넓은 띠 + 점선) */
const BackBand = ({ from, to }: { from: P; to: P }) => (
  <g>
    <Line from={from} to={to} c={C.relief} w={18} />
    <Line from={from} to={to} c={C.blue} dash="4 3" />
  </g>
);

/** 페어웨이 (잔디 깎은 줄무늬, 세로 띠) */
const Fairway = ({ x, w }: { x: number; w: number }) => (
  <g>
    <rect x={x - 3} y={0} width={w + 6} height={200} fill="#bfe09f" />
    <rect x={x} y={0} width={w} height={200} fill="url(#rl-fairway)" />
  </g>
);

/** 말풍선 (그림자, 꼬리) */
function Bubble({ x, y, w, h = 36, tail, children }: P & { w: number; h?: number; tail: P; children: ReactNode }) {
  const bx = Math.min(Math.max(tail.x, x + 20), x + w - 20);
  const d = `M${x + 12} ${y} h${w - 24} q12 0 12 12 v${h - 24} q0 12 -12 12 H${bx + 8} L${tail.x} ${tail.y} L${bx - 8} ${y + h} H${x + 12} q-12 0 -12 -12 v${24 - h} q0 -12 12 -12z`;
  return (
    <g>
      <path d={d} fill="rgba(0,0,0,0.12)" transform="translate(1.5 2)" />
      <path d={d} fill="#fff" stroke="#374151" strokeWidth={1.3} strokeLinejoin="round" />
      <text x={x + w / 2} y={y + h / 2 + 4.5} textAnchor="middle" fontSize={13} fontWeight={800} fill={C.ink}>
        {children}
      </text>
    </g>
  );
}

/* ---------- 사람 ---------- */

/**
 * 팔다리 모양: 가운데 선(pts)을 부드러운 곡선(Catmull-Rom)으로 잇고, 점마다 굵기(ws)를 주어 끝이 둥근 모양으로 감싼다
 * (굵기가 줄어드는 허벅지→종아리, 위팔→아래팔을 자연스럽게 그린다)
 */
function limb(pts: P[], ws: number[]): string {
  const cs: P[] = [];
  const cw: number[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(n - 1, i + 2)]];
    for (let k = 0; k < 8; k++) {
      const t = k / 8;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
      cs.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      cw.push(ws[i] + (ws[i + 1] - ws[i]) * t);
    }
  }
  cs.push(pts[n - 1]);
  cw.push(ws[n - 1]);
  const L: P[] = [];
  const R: P[] = [];
  cs.forEach((p, i) => {
    const a = cs[Math.max(0, i - 1)];
    const b = cs[Math.min(cs.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const h = cw[i] / 2;
    L.push({ x: p.x + nx * h, y: p.y + ny * h });
    R.push({ x: p.x - nx * h, y: p.y - ny * h });
  });
  const f = (p: P) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  const e = cw[cw.length - 1] / 2;
  const s0 = cw[0] / 2;
  return (
    `M${f(L[0])} ${L.slice(1).map((p) => `L${f(p)}`).join(" ")} A${e} ${e} 0 0 0 ${f(R[R.length - 1])} ` +
    `${R.slice(0, -1).reverse().map((p) => `L${f(p)}`).join(" ")} A${s0} ${s0} 0 0 0 ${f(L[0])}Z`
  );
}

/** 옆에서 본 골프화 (뒤꿈치 x, 바닥 168, 앞코는 오른쪽) */
const SideShoe = ({ x, fill }: { x: number; fill: string }) => (
  <g>
    <path d={`M${x} 168 L${x} 161 Q${x} 156.5 ${x + 5} 156.5 L${x + 12} 156.5 Q${x + 16} 157.5 ${x + 19} 161.5 Q${x + 24} 163.5 ${x + 25} 168Z`} fill={fill} stroke="#94a3b8" strokeWidth={1} strokeLinejoin="round" />
    <path d={`M${x} 168 h25`} stroke="#475569" strokeWidth={2.2} strokeLinecap="round" />
    <path d={`M${x + 8} 159 l5 -1 M${x + 9} 161.5 l6 -1`} stroke="#cbd5e1" strokeWidth={1} strokeLinecap="round" />
  </g>
);

/**
 * 옆에서 본 골퍼: 오른쪽을 보고 허리를 숙여, 앞팔을 내려 무릎 높이(y 132)에서 공을 잡고 있다. 뒷팔은 자연스럽게 늘어뜨린다.
 * 발은 y 168 위. 그리는 차례: 그림자 → 뒷다리 → 뒷팔 → 엉덩이 → 앞다리 → 몸통 → 머리 → 앞팔
 */
function DropGolfer() {
  const shirtBack = "#1d4ed8";
  return (
    <g>
      <ellipse cx={104} cy={169} rx={38} ry={4} fill="rgba(0,0,0,0.18)" />
      {/* 뒷다리 · 뒷신발 */}
      <path d={limb([{ x: 98, y: 98 }, { x: 98, y: 131 }, { x: 93, y: 157 }], [18, 12.5, 9.5])} fill={C.pantsDark} />
      <SideShoe x={86} fill="#e5e7eb" />
      {/* 뒷팔 (몸 너머로 늘어뜨림) */}
      <path d={limb([{ x: 119, y: 63 }, { x: 124, y: 77 }], [12.5, 11.5])} fill={shirtBack} />
      <path d={limb([{ x: 124, y: 77 }, { x: 129, y: 91 }, { x: 133, y: 111 }], [8.5, 7.5, 6])} fill={C.skinDark} />
      <ellipse cx={134.5} cy={116} rx={4.2} ry={5.2} fill={C.skinDark} transform="rotate(-15 134.5 116)" />
      {/* 엉덩이 · 앞다리 · 앞신발 */}
      <path d={limb([{ x: 97, y: 99 }, { x: 107, y: 103 }], [22, 22])} fill={C.pants} />
      <path d={limb([{ x: 104, y: 100 }, { x: 114, y: 131 }, { x: 108, y: 157 }], [19, 13, 10])} fill={C.pants} />
      <path d="M109 112 q3 8 4 17" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={1.2} strokeLinecap="round" />
      <SideShoe x={102} fill="#f8fafc" />
      {/* 몸통 (폴로셔츠) · 벨트 */}
      <path d={limb([{ x: 103, y: 90 }, { x: 111, y: 78 }, { x: 122, y: 65 }], [24, 26.5, 24])} fill={C.shirt} />
      <path d="M91.5 88.5 L113.5 99.5" stroke={C.pantsDark} strokeWidth={4.5} strokeLinecap="round" />
      <rect x={100.5} y={91} width={5} height={4} rx={1} fill="#cbd5e1" transform="rotate(27 103 93)" />
      <path d="M93 90 Q99 76 108 67" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={3} strokeLinecap="round" />
      {/* 목 · 깃 */}
      <path d={limb([{ x: 125, y: 60 }, { x: 130, y: 52 }], [9, 8])} fill={C.skin} />
      <path d="M121.5 60.5 l5 6.5 l3.5 -8z" fill="#eff6ff" />
      {/* 머리: 귀 · 눈 · 코 · 모자 · 뒷머리 */}
      <circle cx={135.5} cy={43} r={10.5} fill={C.skin} />
      <path d="M137 52.5 q6 0.5 8.5 -4" fill="none" stroke={C.skinDark} strokeWidth={1} strokeLinecap="round" />
      <circle cx={131.5} cy={45} r={2.6} fill={C.skinDark} />
      <circle cx={140.5} cy={42.5} r={1.2} fill="#1f2937" />
      <path d="M139 39.5 l3.5 -0.6" stroke="#3f2d22" strokeWidth={1.1} strokeLinecap="round" />
      <path d="M145.3 42.5 q2.8 2.2 0.2 4.3" fill={C.skin} stroke={C.skinDark} strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M125.2 42 q-1.5 6 2.8 9.5 l2.4 -1.6 q-3 -3 -2.2 -7.9z" fill="#3f2d22" />
      <path d="M124.8 42.5 Q124.2 30.5 135.5 30.5 Q146.8 31 146.6 41.6 Z" fill={C.cap} />
      <path d="M144.4 39.8 q9.8 -0.6 13.4 3.4 q-6.6 2.2 -13.8 0.6z" fill="#0f172a" />
      <circle cx={135.5} cy={31} r={1.2} fill="#475569" />
      {/* 앞팔: 소매 · 위팔 · 아래팔 · 공을 잡은 손 */}
      <path d={limb([{ x: 125, y: 64 }, { x: 131, y: 79 }], [14, 12.5])} fill={C.shirtDark} />
      <path d={limb([{ x: 131, y: 79 }, { x: 138, y: 93 }, { x: 146, y: 118 }], [9, 8, 6.5])} fill={C.skin} />
    </g>
  );
}

/** 공을 잡은 손 (공 위로 손가락을 감싼다, DropGolfer 앞팔 끝) */
const DropHand = () => (
  <path d="M142.8 117.5 q5.5 -2.5 8.8 1.8 q2.6 3.8 1.2 8.6 q-1.6 2.2 -3.4 0.6 q0.4 -2.8 -1.6 -4.2 q-2.4 1.6 -4.2 0.2 q-2.2 -3.6 -0.8 -7z" fill={C.skin} stroke={C.skinDark} strokeWidth={0.9} strokeLinejoin="round" />
);

/** 상반신 (오른쪽을 본다). x 는 얼굴 가운데 */
function Bust({ x, shirt }: { x: number; shirt: string }) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${x - 34} 200 Q${x - 34} 158 ${x} 154 Q${x + 34} 158 ${x + 34} 200Z`} fill={shirt} />
      <path d={`M${x - 8} 155 l8 10 l8 -10`} fill="none" stroke="#fff" strokeWidth={2.4} />
      <rect x={x - 5} y={140} width={10} height={16} fill={C.skin} />
      <circle cx={x} cy={128} r={17} fill={C.skin} />
      <circle cx={x - 6} cy={131} r={3.4} fill={C.skinDark} />
      <circle cx={x + 8} cy={127} r={1.6} fill="#1f2937" />
      <path d={`M${x + 6} 137 q4 2 7 -1`} fill="none" stroke="#b45309" strokeWidth={1.4} />
      <path d={`M${x - 17} 126 Q${x - 18} 106 ${x} 106 Q${x + 17} 106 ${x + 17} 122 Z`} fill={C.cap} />
      <path d={`M${x + 14} 120 q14 0 20 5 q-10 3 -21 1z`} fill="#0f172a" />
    </g>
  );
}

/** 위에서 본 신발 (앞코가 rot 방향, 0 = 위) */
const Shoe = ({ x, y, rot }: P & { rot: number }) => (
  <g transform={`rotate(${rot} ${x} ${y})`}>
    <ellipse cx={x + 2} cy={y + 2} rx={7} ry={13} fill="rgba(0,0,0,0.15)" />
    <path d={`M${x - 6} ${y + 9} Q${x - 7.5} ${y - 4} ${x} ${y - 13} Q${x + 7.5} ${y - 4} ${x + 6} ${y + 9} Q${x} ${y + 14} ${x - 6} ${y + 9}Z`} fill="#f8fafc" stroke="#64748b" strokeWidth={1.2} />
    <path d={`M${x - 5} ${y + 6} Q${x} ${y + 11} ${x + 5} ${y + 6}`} fill="none" stroke="#94a3b8" strokeWidth={3} />
    <path d={`M${x - 2.5} ${y - 6} h5 M${x - 3} ${y - 2} h6 M${x - 3} ${y + 2} h6`} stroke="#cbd5e1" strokeWidth={1} />
  </g>
);

/** 위에서 본 퍼터 (헤드 가운데 (x, y), rot 0 = 헤드가 가로) */
const Putter = ({ x, y, rot }: P & { rot: number }) => (
  <g transform={`rotate(${rot} ${x} ${y})`}>
    <line x1={x} y1={y + 2} x2={x} y2={y + 22} stroke="url(#rl-shaft)" strokeWidth={2.6} strokeLinecap="round" />
    <rect x={x - 9} y={y - 3} width={18} height={6} rx={2.5} fill="#4b5563" stroke="#1f2937" strokeWidth={0.8} />
  </g>
);

/** 옆에서 본 아이언 (헤드 바닥이 (hx, hy), 그립 끝이 (gx, gy)) */
const Iron = ({ hx, hy, gx, gy }: { hx: number; hy: number; gx: number; gy: number }) => (
  <g strokeLinecap="round">
    <line x1={gx} y1={gy} x2={hx + 2} y2={hy - 12} stroke="url(#rl-shaft)" strokeWidth={3} />
    <line x1={gx} y1={gy} x2={gx + (hx - gx) * 0.22} y2={gy + (hy - gy) * 0.22} stroke="#111827" strokeWidth={5.5} />
    <path
      d={`M${hx - 2} ${hy - 13} L${hx + 4} ${hy - 12} L${hx + 18} ${hy - 4} Q${hx + 20} ${hy} ${hx + 15} ${hy} L${hx - 3} ${hy} Q${hx - 6} ${hy - 6} ${hx - 2} ${hy - 13}Z`}
      fill="url(#rl-iron)"
      stroke="#6b7280"
      strokeWidth={0.8}
    />
    <path d={`M${hx} ${hy - 3} h14`} stroke="#9ca3af" strokeWidth={0.8} />
  </g>
);

/**
 * 가까이서 본 땅: 위는 잔디 윗면(top~front, 뒤쪽은 살짝 어둡게), 앞은 잘라 낸 흙 단면(잔디 뿌리·자갈)
 */
function Block({ top, front, surface }: { top: number; front: number; surface: string }) {
  const soil = 200 - front - 7;
  return (
    <g>
      <rect y={top} width={320} height={front - top} fill={surface} />
      <rect y={top} width={320} height={front - top} fill="url(#rl-depth)" />
      <rect y={front} width={320} height={7} fill="#5d9c41" />
      <rect y={front + 7} width={320} height={soil} fill="url(#rl-soil)" />
      <rect y={front + 7} width={320} height={soil} fill="url(#rl-pebble)" />
      <path
        d={Array.from({ length: 27 }, (_, i) => `M${i * 12 + 5} ${front + 7} q2 5 -1 10`).join(" ")}
        fill="none"
        stroke="#3f6b2a"
        strokeWidth={1}
        opacity={0.45}
      />
    </g>
  );
}

/** 흰 알약 모양 글자 (흙·잔디 위 설명) */
function Pill({ x, y, w, c, children }: P & { w: number; c: string; children: ReactNode }) {
  return (
    <g>
      <rect x={x - w / 2 + 1} y={y - 10} width={w} height={24} rx={12} fill="rgba(0,0,0,0.18)" />
      <rect x={x - w / 2} y={y - 12} width={w} height={24} rx={12} fill="#fff" />
      <text x={x} y={y + 4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill={c}>
        {children}
      </text>
    </g>
  );
}

/** 크게 그린 아이언: 헤드 뒤꿈치 바닥이 (x, y), s 배 크기, 샤프트는 (gx, gy) 까지 */
function BigIron({ x, y, s = 2, gx, gy }: P & { s?: number; gx: number; gy: number }) {
  const hx = x + 1.5 * s;
  const hy = y - 16 * s;
  return (
    <g>
      <line x1={gx} y1={gy} x2={hx} y2={hy} stroke="url(#rl-shaft)" strokeWidth={2.2 * s} strokeLinecap="round" />
      <line x1={gx} y1={gy} x2={gx + (hx - gx) * 0.22} y2={gy + (hy - gy) * 0.22} stroke="#111827" strokeWidth={3.8 * s} strokeLinecap="round" />
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <path d="M-1 -13 L4 -12.5 L19 -4.5 Q22 -1 18.5 0.2 L-1.5 0.2 Q-4.5 -5 -1 -13Z" fill="url(#rl-iron)" stroke="#6b7280" strokeWidth={0.6} />
        <path d="M2 -3.2 h14 M3 -5.8 h11 M4.5 -8.4 h7" stroke="#9ca3af" strokeWidth={0.5} />
        <path d="M-1 -13 L-0.4 -16.5 L3.4 -16 L4 -12.5Z" fill="#111827" />
      </g>
    </g>
  );
}

const BLADE = ["#4f8f37", "#5d9c41", "#6fae4f", "#7dbb5a"];
/** 풀잎 줄 (from~to, 뿌리 base). flat 범위는 땅에 눕힌다 (눌린 풀) */
function Blades({ from, to, base, min, max, seed = 1, step = 4.2, flat }: { from: number; to: number; base: number; min: number; max: number; seed?: number; step?: number; flat?: [number, number] }) {
  let r = seed;
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const out: ReactNode[] = [];
  for (let gx = from; gx <= to; gx += step) {
    const x = gx + (rnd() - 0.5) * 2;
    const h = min + rnd() * (max - min);
    const lean = (rnd() - 0.5) * 10;
    const col = BLADE[Math.floor(rnd() * BLADE.length)];
    if (flat && x > flat[0] && x < flat[1])
      out.push(<path key={gx} d={`M${x + 2} ${base} Q${x - 8} ${base - 3} ${x - 18} ${base - 1.5} Q${x - 8} ${base - 1} ${x - 1.5} ${base}Z`} fill="#8cc46a" stroke="#5d9c41" strokeWidth={0.5} />);
    else
      out.push(<path key={gx} d={`M${x - 1.6} ${base} Q${x - 0.5 + lean * 0.3} ${base - h * 0.55} ${x + lean} ${base - h} Q${x + 0.8 + lean * 0.3} ${base - h * 0.55} ${x + 1.6} ${base}Z`} fill={col} />);
  }
  return <g>{out}</g>;
}

/* ---------- 쪽마다 그림 ---------- */

function Tee() {
  return (
    <Fig label="티잉 구역: 두 티 마커를 이은 선에서 뒤로 두 클럽 길이">
      <Rough />
      <rect x={66} y={34} width={188} height={150} rx={16} fill="#bfe09f" />
      <rect x={70} y={38} width={180} height={142} rx={14} fill="url(#rl-fairway)" />
      <rect x={110} y={80} width={100} height={60} fill={C.relief} stroke={C.blue} strokeWidth={1.5} strokeDasharray="4 3" />
      <Line from={{ x: 110, y: 80 }} to={{ x: 210, y: 80 }} c="#1f2937" w={2} />
      {[110, 210].map((mx) => (
        <g key={mx}>
          <ellipse cx={mx + 2} cy={84} rx={8} ry={4} fill="rgba(0,0,0,0.2)" />
          <circle cx={mx} cy={79} r={7} fill="url(#rl-marker)" stroke="#64748b" strokeWidth={1} />
        </g>
      ))}
      <T x={98} y={76} a="end">
        티 마커
      </T>
      <Line from={{ x: 224, y: 82 }} to={{ x: 224, y: 138 }} c={C.blue} />
      <Line from={{ x: 219, y: 82 }} to={{ x: 229, y: 82 }} c={C.blue} />
      <Line from={{ x: 219, y: 138 }} to={{ x: 229, y: 138 }} c={C.blue} />
      <T x={232} y={107} a="start" c={C.blue}>
        두 클럽
      </T>
      <T x={232} y={121} a="start" c={C.blue}>
        길이
      </T>
      <Ball x={150} y={116} />
      <Ok x={168} y={116} />
      <Ball x={174} y={58} />
      <No x={192} y={58} />
      <T x={204} y={62} a="start" c={C.bad}>
        선 앞은 2벌타
      </T>
      <T x={160} y={162} c={C.blue}>
        티잉 구역
      </T>
      <Line from={{ x: 36, y: 150 }} to={{ x: 36, y: 62 }} c="#374151" arrow />
      <T x={36} y={168} c={C.soft} s={10}>
        홀 방향
      </T>
    </Fig>
  );
}

function Ob() {
  return (
    <Fig label="OB: 흰 말뚝 밖으로 나간 공은 찾아도 칠 수 없고 친 곳에서 다시">
      <Rough />
      <rect x={232} y={0} width={88} height={200} fill="url(#rl-out)" />
      <Tree x={292} y={152} r={16} />
      <Fairway x={70} w={110} />
      <Line from={{ x: 232, y: 0 }} to={{ x: 232, y: 200 }} c="#f8fafc" w={2.4} />
      <Line from={{ x: 232, y: 0 }} to={{ x: 232, y: 200 }} c="#9ca3af" w={1} dash="5 4" />
      <Stakes pts={[26, 66, 106, 146, 186].map((y) => ({ x: 232, y }))} c="#ffffff" />
      <T x={276} y={24} s={14} w={900} c="#374151">
        OB
      </T>
      <T x={276} y={40} s={10} c={C.soft}>
        흰 말뚝 밖
      </T>
      <Shot from={{ x: 125, y: 168 }} via={{ x: 230, y: 130 }} to={{ x: 264, y: 74 }} />
      <Ball x={270} y={66} />
      <No x={287} y={84} />
      <T x={276} y={108}>
        찾아도
      </T>
      <T x={276} y={122}>
        못 쳐요
      </T>
      <Ball x={125} y={170} />
      <T x={125} y={191} c={C.blue}>
        1벌타, 여기서 다시
      </T>
      <Line from={{ x: 36, y: 130 }} to={{ x: 36, y: 50 }} c="#374151" arrow />
      <T x={36} y={148} c={C.soft} s={10}>
        홀 방향
      </T>
    </Fig>
  );
}

function Provisional() {
  return (
    <Fig label="잠정구: 치기 전에 잠정구 칠게요라고 말한다">
      <Rough />
      <Fairway x={110} w={100} />
      <Tree x={262} y={58} r={22} />
      <Tree x={294} y={100} r={17} />
      <Shot from={{ x: 160, y: 172 }} via={{ x: 250, y: 140 }} to={{ x: 258, y: 82 }} c="#6b7280" />
      <T x={262} y={40} s={20} w={900} c="#374151">
        ?
      </T>
      <Shot from={{ x: 160, y: 172 }} via={{ x: 140, y: 120 }} to={{ x: 152, y: 78 }} c={C.blue} dash="0" />
      <Ball x={152} y={70} />
      <T x={152} y={56} c={C.blue}>
        잠정구
      </T>
      <Ball x={160} y={176} />
      <Bubble x={12} y={104} w={120} tail={{ x: 150, y: 168 }}>
        잠정구 칠게요
      </Bubble>
    </Fig>
  );
}

function ProvisionalPlay() {
  const hole = { x: 160, y: 34 };
  return (
    <Fig label="원구가 있을 것 같은 곳보다 홀에 가까운 곳에서 잠정구를 치면 잠정구가 내 공이 된다">
      <Rough />
      <Fairway x={100} w={120} />
      <Green x={160} y={28} rx={34} ry={20} />
      <circle cx={hole.x} cy={hole.y} r={110} fill={C.amberFill} stroke={C.amber} strokeWidth={1.5} strokeDasharray="5 4" />
      <Flag {...hole} />
      <Tree x={270} y={108} r={19} />
      <Ball x={256} y={106} ghost />
      <T x={262} y={144} s={10} c={C.soft}>
        원구가 있을 것
      </T>
      <T x={262} y={157} s={10} c={C.soft}>
        같은 곳
      </T>
      <Ball x={146} y={98} />
      <T x={140} y={72} c={C.amber}>
        여기서 치면
      </T>
      <T x={140} y={86} c={C.amber}>
        잠정구가 내 공
      </T>
      <Ball x={150} y={172} />
      <Ok x={168} y={172} />
      <T x={110} y={176} a="end" c={C.ok}>
        아직 잠정구
      </T>
    </Fig>
  );
}

function Search() {
  return (
    <Fig label="공은 3분 동안 찾을 수 있다">
      <Rough />
      <ellipse cx={164} cy={146} rx={44} ry={7} fill="rgba(0,0,0,0.14)" />
      <rect x={152} y={28} width={16} height={10} rx={3} fill="url(#rl-watch)" />
      <rect x={156} y={36} width={8} height={7} fill="#374151" />
      <circle cx={160} cy={92} r={52} fill="url(#rl-watch)" />
      <circle cx={160} cy={92} r={45} fill="#fff" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return (
          <line
            key={i}
            x1={160 + 39 * Math.sin(a)}
            y1={92 - 39 * Math.cos(a)}
            x2={160 + 43 * Math.sin(a)}
            y2={92 - 43 * Math.cos(a)}
            stroke="#6b7280"
            strokeWidth={i % 3 === 0 ? 2.2 : 1.2}
          />
        );
      })}
      <path d="M160 92 L160 49 A43 43 0 0 1 197.2 70.5Z" fill="rgba(37,99,235,0.2)" />
      <line x1={160} y1={92} x2={194} y2={72.5} stroke={C.blue} strokeWidth={2.6} strokeLinecap="round" />
      <circle cx={160} cy={92} r={3.6} fill={C.blue} />
      <T x={160} y={122} s={18} w={900}>
        3:00
      </T>
      <Ball x={58} y={178} r={5} />
      {[34, 46, 60, 72, 252, 266, 280].map((x, i) => (
        <path key={x} d={`M${x} 186 q2 -10 5 -16 q-1 8 2 16 q2 -12 6 -18 q-2 10 1 18z`} fill={i % 2 ? "#6fae4f" : "#5d9c41"} />
      ))}
      <T x={160} y={180} c={C.soft}>
        찾기 시작한 때부터
      </T>
    </Fig>
  );
}

function WrongBall() {
  const big = (x: number, mark: ReactNode) => (
    <g>
      <ellipse cx={x + 10} cy={124} rx={30} ry={8} fill="rgba(0,0,0,0.16)" />
      <circle cx={x} cy={92} r={31} fill="url(#rl-ball)" stroke="#9ca3af" strokeWidth={1} />
      <circle cx={x} cy={92} r={31} fill="url(#rl-dimple)" opacity={0.6} />
      <text x={x} y={100} textAnchor="middle" fontSize={11} fontWeight={800} fill="#6b7280">
        MG 3
      </text>
      {mark}
    </g>
  );
  return (
    <Fig label="다른 사람 공을 치면 2벌타, 치기 전에 내 공 표시를 확인한다">
      <Rough />
      {big(100, <path d="M80 82 q20 -12 40 0" fill="none" stroke={C.blue} strokeWidth={3.4} strokeLinecap="round" />)}
      {big(
        220,
        <g fill={C.red}>
          <circle cx={209} cy={80} r={3} />
          <circle cx={231} cy={80} r={3} />
        </g>
      )}
      <Ok x={126} y={66} />
      <No x={246} y={66} />
      <T x={100} y={148}>
        내 공 (내 표시)
      </T>
      <T x={220} y={148} c={C.bad}>
        다른 사람 공
      </T>
      <T x={160} y={182} c={C.soft} w={600}>
        같은 브랜드·번호라도 표시가 달라요
      </T>
    </Fig>
  );
}

function PaPlay() {
  return (
    <Fig label="페널티 구역 안의 공도 그대로 칠 수 있다">
      <Rough />
      <path d="M30 80 Q160 52 290 80 L290 200 L30 200Z" fill="#c3dfa6" />
      <path d="M52 112 Q160 92 268 112 L268 200 L52 200Z" fill="url(#rl-water)" />
      <path d="M52 112 Q160 92 268 112" fill="none" stroke="#7a9a5b" strokeWidth={2} opacity={0.5} />
      <Waves pts={[{ x: 90, y: 140 }, { x: 150, y: 128 }, { x: 210, y: 146 }, { x: 120, y: 176 }, { x: 196, y: 182 }]} />
      <path d="M30 80 Q160 52 290 80" fill="none" stroke={C.red} strokeWidth={2.2} strokeDasharray="7 4" />
      <Stakes pts={[{ x: 30, y: 82 }, { x: 95, y: 68 }, { x: 160, y: 64 }, { x: 225, y: 68 }, { x: 290, y: 82 }]} c={C.red} />
      <Ball x={176} y={86} />
      <Ok x={194} y={86} />
      <T x={160} y={34} c={C.ok}>
        그대로 치면 벌타 없음
      </T>
      <T x={160} y={160} c="#1e3a8a">
        빨간 선 안쪽이 페널티 구역
      </T>
      <T x={160} y={174} c="#1e3a8a" w={600} s={10}>
        (물이 없어도 돼요)
      </T>
    </Fig>
  );
}

function PaYellow() {
  const hole = { x: 150, y: 30 };
  const x = { x: 186, y: 124 };
  const end = backTo(hole, x, 200);
  return (
    <Fig label="노란 말뚝: 1벌타, 공이 넘어간 지점과 홀을 잇는 선의 뒤쪽에 드롭">
      <Rough />
      <Green x={150} y={26} rx={40} ry={20} />
      <rect x={0} y={74} width={320} height={50} fill="url(#rl-water)" />
      <Waves pts={[{ x: 30, y: 96 }, { x: 110, y: 104 }, { x: 250, y: 92 }, { x: 280, y: 110 }]} />
      <Line from={{ x: 0, y: 74 }} to={{ x: 320, y: 74 }} c={C.yellow} w={2.2} dash="7 4" />
      <Line from={{ x: 0, y: 124 }} to={{ x: 320, y: 124 }} c={C.yellow} w={2.2} dash="7 4" />
      <Stakes pts={[30, 110, 230, 290].map((sx) => ({ x: sx, y: 126 }))} c={C.yellow} />
      <Flag {...hole} />
      <Line from={hole} to={x} c="#374151" dash="3 3" w={1.2} />
      <BackBand from={x} to={end} />
      <Shot from={{ x: 90, y: 180 }} via={{ x: 150, y: 150 }} to={{ x: 214, y: 98 }} />
      <Ball x={90} y={182} />
      <Cross {...x} />
      <T x={198} y={142} a="start" c={C.amber}>
        넘어간 지점
      </T>
      <T x={244} y={170} a="start" c={C.blue}>
        이 선 뒤쪽
      </T>
      <T x={244} y={184} a="start" c={C.blue}>
        어디든 드롭
      </T>
      <T x={90} y={198} c={C.soft} w={600} s={10}>
        또는 친 곳에서 다시
      </T>
    </Fig>
  );
}

function PaRed() {
  const hole = { x: 116, y: 26 };
  const x = { x: 80, y: 105 };
  return (
    <Fig label="빨간 말뚝: 1벌타, 공이 넘어간 지점에서 두 클럽 이내에 드롭">
      <defs>
        <clipPath id="rl-clip-red">
          <rect x={80} y={0} width={240} height={200} />
        </clipPath>
      </defs>
      <Rough />
      <Fairway x={100} w={110} />
      <Green x={124} y={20} rx={34} ry={18} />
      <rect x={0} y={0} width={80} height={200} fill="#c3dfa6" />
      <rect x={0} y={0} width={62} height={200} fill="url(#rl-water)" />
      <Waves pts={[{ x: 14, y: 60 }, { x: 30, y: 130 }, { x: 10, y: 172 }]} />
      <Line from={{ x: 80, y: 0 }} to={{ x: 80, y: 200 }} c={C.red} w={2.2} dash="7 4" />
      <Stakes pts={[20, 60, 150, 190].map((y) => ({ x: 80, y }))} c={C.red} />
      <Flag {...hole} />
      <HalfDisc at={x} r={46} hole={hole} clip="rl-clip-red" />
      <Shot from={{ x: 200, y: 186 }} via={{ x: 120, y: 120 }} to={{ x: 36, y: 84 }} />
      <Ball x={200} y={188} />
      <Cross {...x} />
      <T x={92} y={92} a="start" c={C.amber}>
        넘어간 지점
      </T>
      <T x={88} y={176} a="start" c={C.blue}>
        두 클럽 이내
      </T>
      <T x={88} y={190} a="start" c={C.blue}>
        (홀에 가깝지 않게)
      </T>
      <T x={32} y={30} c={C.red} s={10}>
        페널티
      </T>
      <T x={32} y={43} c={C.red} s={10}>
        구역
      </T>
    </Fig>
  );
}

function Unplayable() {
  const hole = { x: 150, y: 30 };
  const ball = { x: 248, y: 116 };
  const end = backTo(hole, ball, 200);
  return (
    <Fig label="언플레이어블: 1벌타, 두 클럽 이내 또는 홀과 공을 잇는 선 뒤쪽 또는 친 곳에서 다시">
      <Rough />
      <Fairway x={100} w={100} />
      <Green x={150} y={24} rx={36} ry={18} />
      <Flag {...hole} />
      <Line from={hole} to={ball} c="#374151" dash="3 3" w={1.2} />
      <HalfDisc at={ball} r={42} hole={hole} />
      <BackBand from={ball} to={end} />
      <Tree x={254} y={104} r={20} />
      <Ball {...ball} />
      <Shot from={{ x: 130, y: 182 }} via={{ x: 210, y: 170 }} to={{ x: 240, y: 126 }} c="#6b7280" />
      <Ball x={130} y={184} />
      <T x={214} y={112} a="end" c={C.blue}>
        ① 두 클럽 이내
      </T>
      <T x={302} y={196} a="end" c={C.blue}>
        ② 선 뒤쪽
      </T>
      <T x={122} y={166} a="end" c={C.blue}>
        ③ 친 곳에서
      </T>
    </Fig>
  );
}

function CartPath() {
  const hole = { x: 110, y: 30 };
  const near = { x: 228, y: 118 };
  return (
    <Fig label="카트 도로: 가운데 선을 기준으로 공이 있는 쪽 가장 가까운 지점에서 한 클럽 이내, 벌타 없음">
      <Rough />
      <Fairway x={36} w={124} />
      <Green x={100} y={24} rx={36} ry={18} />
      <rect x={172} y={0} width={40} height={200} fill="url(#rl-path)" />
      <Line from={{ x: 172, y: 0 }} to={{ x: 172, y: 200 }} c="#a8a29e" w={1.6} />
      <Line from={{ x: 212, y: 0 }} to={{ x: 212, y: 200 }} c="#a8a29e" w={1.6} />
      <Line from={{ x: 192, y: 0 }} to={{ x: 192, y: 200 }} c="#f59e0b" w={1.8} dash="7 5" />
      <T x={192} y={194} s={10} c="#b45309">
        가운데 선
      </T>
      <Flag {...hole} />
      <HalfDisc at={near} r={26} hole={hole} />
      <Ball x={202} y={116} />
      <circle cx={near.x} cy={near.y} r={3} fill={C.blue} />
      <Line from={{ x: 209, y: 116 }} to={{ x: 223, y: 118 }} c={C.blue} arrow />
      <T x={236} y={86} a="start" c={C.blue}>
        공이 있는 쪽
      </T>
      <T x={236} y={100} a="start" c={C.blue}>
        가까운 지점
      </T>
      <T x={256} y={164} a="start" c={C.blue}>
        한 클럽
      </T>
      <Ball x={152} y={120} ghost />
      <No x={136} y={120} />
      <T x={136} y={150} c={C.bad}>
        먼 쪽으로
      </T>
      <T x={136} y={164} c={C.bad}>
        빼면 안 돼요
      </T>
    </Fig>
  );
}

/** 공이 움직였을 때: 바람 · 나 · 다른 공 세 칸 */
function BallMoved() {
  const cols = [53, 160, 267];
  const wind = (cx: number) => (
    <g stroke="#60a5fa" strokeWidth={2} fill="none" strokeLinecap="round">
      <path d={`M${cx - 40} 48 q10 -7 20 0 t20 0`} />
      <path d={`M${cx - 32} 60 q10 -7 20 0 t20 0`} />
      <path d={`M${cx - 40} 72 q8 -6 16 0`} />
    </g>
  );
  return (
    <Fig label="공이 움직였을 때: 바람은 그 자리에서, 내가 움직이면 1벌타 후 제자리, 다른 공·동반자는 벌타 없이 제자리">
      <Rough />
      <Line from={{ x: 106.5, y: 8 }} to={{ x: 106.5, y: 192 }} c="rgba(255,255,255,0.9)" w={1.2} />
      <Line from={{ x: 213.5, y: 8 }} to={{ x: 213.5, y: 192 }} c="rgba(255,255,255,0.9)" w={1.2} />
      {[
        ["바람·경사", cols[0]],
        ["내가 건드림", cols[1]],
        ["동반자·다른 공", cols[2]],
      ].map(([t, cx]) => (
        <T key={t} x={cx as number} y={24} s={11.5}>
          {t}
        </T>
      ))}
      {/* 바람 */}
      {wind(cols[0] + 6)}
      <Ball x={cols[0] - 16} y={104} ghost />
      <Line from={{ x: cols[0] - 9, y: 106 }} to={{ x: cols[0] + 8, y: 114 }} c="#6b7280" arrow />
      <Ball x={cols[0] + 16} y={117} />
      <Ok x={cols[0] + 18} y={142} />
      <T x={cols[0]} y={172} c={C.ok}>
        멈춘 자리에서
      </T>
      <T x={cols[0]} y={186} c={C.ok} s={10}>
        벌타 없음
      </T>
      {/* 나 */}
      <Shoe x={cols[1] - 36} y={96} rot={70} />
      <Ball x={cols[1] - 16} y={104} ghost />
      <Line from={{ x: cols[1] - 9, y: 106 }} to={{ x: cols[1] + 8, y: 114 }} c="#6b7280" arrow />
      <Ball x={cols[1] + 16} y={117} />
      <Shot from={{ x: cols[1] + 14, y: 126 }} via={{ x: cols[1], y: 138 }} to={{ x: cols[1] - 15, y: 112 }} c={C.blue} dash="3 2" />
      <T x={cols[1]} y={172} c={C.amber}>
        1벌타
      </T>
      <T x={cols[1]} y={186} c={C.amber} s={10}>
        원래 자리에 놓기
      </T>
      {/* 다른 공 */}
      <Ball x={cols[2] + 26} y={62} />
      <g stroke="#9ca3af" strokeWidth={1.4} strokeLinecap="round">
        <line x1={cols[2] + 34} y1={54} x2={cols[2] + 42} y2={46} />
        <line x1={cols[2] + 38} y1={60} x2={cols[2] + 46} y2={52} />
      </g>
      <Line from={{ x: cols[2] + 20, y: 70 }} to={{ x: cols[2] - 10, y: 98 }} c="#6b7280" dash="3 3" arrow />
      <Ball x={cols[2] - 16} y={104} ghost />
      <Line from={{ x: cols[2] - 9, y: 106 }} to={{ x: cols[2] + 8, y: 114 }} c="#6b7280" arrow />
      <Ball x={cols[2] + 16} y={117} />
      <Shot from={{ x: cols[2] + 14, y: 126 }} via={{ x: cols[2], y: 138 }} to={{ x: cols[2] - 15, y: 112 }} c={C.blue} dash="3 2" />
      <T x={cols[2]} y={172} c={C.ok}>
        벌타 없이
      </T>
      <T x={cols[2]} y={186} c={C.ok} s={10}>
        원래 자리에 놓기
      </T>
    </Fig>
  );
}

/** 가까이서 본 러프 한 칸 (x 부터 너비 160): press 면 클럽으로 공 뒤 풀을 눌러 다진다 */
function LieScene({ x, press }: { x: number; press: boolean }) {
  const ground = 128;
  const flat: [number, number] | undefined = press ? [x + 28, x + 92] : undefined;
  return (
    <g>
      <rect x={x} y={ground} width={160} height={8} fill="#5d9c41" />
      <rect x={x} y={ground + 8} width={160} height={64} fill="url(#rl-soil)" />
      <rect x={x} y={ground + 8} width={160} height={64} fill="url(#rl-pebble)" />
      <Blades from={x + 2} to={x + 158} base={ground + 1} min={18} max={34} seed={press ? 7 : 3} flat={flat} />
      <BigIron x={x + 46} y={press ? ground + 1 : ground - 22} s={2} gx={x + 2} gy={-12} />
      <Ball x={x + 106} y={114} r={13} />
      <Blades from={x + 4} to={x + 156} base={ground + 2} min={8} max={18} step={9} seed={press ? 11 : 5} flat={flat} />
      {press && (
        <g>
          <Line from={{ x: x + 58, y: 52 }} to={{ x: x + 58, y: 78 }} c={C.bad} w={2.4} arrow />
          <Line from={{ x: x + 80, y: 52 }} to={{ x: x + 80, y: 78 }} c={C.bad} w={2.4} arrow />
          <T x={x + 69} y={44} c={C.bad} s={13} w={900}>
            꾹
          </T>
        </g>
      )}
      {press ? <No x={x + 140} y={24} /> : <Ok x={x + 140} y={24} />}
      <Pill x={x + 80} y={176} w={124} c={press ? C.bad : C.ok}>
        {press ? "눌러 다지면 2벌타" : "가볍게 대면 OK"}
      </Pill>
    </g>
  );
}

function ImproveLie() {
  return (
    <Fig label="공 뒤 러프를 클럽으로 눌러 다지면 2벌타, 가볍게 대는 건 괜찮다">
      <rect width="320" height="200" fill="url(#rl-sky)" />
      <LieScene x={0} press={false} />
      <LieScene x={160} press />
      <Line from={{ x: 160, y: 0 }} to={{ x: 160, y: 200 }} c="#fff" w={2} />
    </Fig>
  );
}

function Divot() {
  const top = 100;
  return (
    <Fig label="디봇 자국에 들어간 공은 벌타 없이 뺄 수 없고 그대로 친다">
      <defs>
        <clipPath id="rl-clip-divot">
          <path d="M0 0 H320 V120 H190 A42 10 0 0 1 106 120 H0Z" />
        </clipPath>
      </defs>
      <rect width="320" height="200" fill="url(#rl-sky)" />
      <Block top={top} front={134} surface="url(#rl-fairway)" />
      {/* 디봇 자국: 모래로 메운 홈 */}
      <ellipse cx={148} cy={120} rx={42} ry={10} fill="#b98d57" />
      <ellipse cx={148} cy={120} rx={42} ry={10} fill="url(#rl-sandgrain)" />
      <path d="M106 120 A42 10 0 0 1 190 120" fill="none" stroke="#6b4527" strokeWidth={3} opacity={0.55} />
      <path d="M106 120 A42 10 0 0 0 190 120" fill="none" stroke="#8fc46f" strokeWidth={1.6} />
      <g clipPath="url(#rl-clip-divot)">
        <Ball x={146} y={122} r={12} />
      </g>
      {/* 떨어져 나간 디봇 */}
      <ellipse cx={258} cy={124} rx={22} ry={4} fill="rgba(0,0,0,0.18)" />
      <path d="M236 121 L238 113 Q256 108 274 113 L276 121 Q256 125 236 121Z" fill="#8b6a3e" />
      <path d="M238 113 Q256 106 274 113 Q256 117 238 113Z" fill="#7cbf57" />
      <path d="M244 121 q1 4 -1 6 M256 123 q1 4 -1 6 M268 121 q1 4 -1 6" fill="none" stroke="#6b4527" strokeWidth={1} />
      <Line from={{ x: 148, y: 132 }} to={{ x: 148, y: 152 }} c="#fff" w={1.4} />
      <Pill x={148} y={166} w={78} c="#78350f">
        디봇 자국
      </Pill>
      <Pill x={256} y={166} w={108} c={C.soft}>
        떨어져 나간 디봇
      </Pill>
      <Ok x={180} y={92} />
      <T x={148} y={66} c={C.ok} s={13}>
        있는 그대로 쳐요
      </T>
      <Shot from={{ x: 134, y: 106 }} via={{ x: 96, y: 66 }} to={{ x: 60, y: 104 }} c="#9ca3af" dash="3 3" />
      <Ball x={52} y={114} r={9} ghost />
      <No x={52} y={88} />
      <T x={52} y={48} c={C.bad}>
        벌타 없이
      </T>
      <T x={52} y={62} c={C.bad}>
        빼면 안 돼요
      </T>
    </Fig>
  );
}

function Embedded() {
  const top = 96;
  return (
    <Fig label="자기 자국에 박힌 공은 벌타 없이, 바로 뒤 지점에서 한 클럽 이내에 드롭">
      <defs>
        <clipPath id="rl-clip-embed">
          <path d="M0 0 H320 V116 H226 A20 6 0 0 1 186 116 H0Z" />
        </clipPath>
      </defs>
      <rect width="320" height="200" fill="url(#rl-sky)" />
      <Block top={top} front={132} surface="url(#rl-fairway)" />
      {/* 멀리 홀 */}
      <line x1={300} y1={top + 6} x2={300} y2={top - 32} stroke="#f8fafc" strokeWidth={2.2} />
      <path d={`M301 ${top - 32} q7 -2 14 2 q-4 3 0 7 q-7 -3 -14 -1z`} fill={C.red} />
      <T x={296} y={top - 40} s={10} c={C.soft}>
        홀 방향
      </T>
      {/* 드롭 구역: 바로 뒤 지점에서 한 클럽, 홀에 가깝지 않은 쪽 */}
      <path d="M178 104 A42 11 0 0 0 178 126Z" fill={C.relief} stroke={C.blue} strokeWidth={1.4} strokeDasharray="4 3" />
      <circle cx={178} cy={115} r={3} fill={C.blue} />
      <Ball x={150} y={114} r={8} ghost />
      {/* 피치 마크와 박힌 공 */}
      <ellipse cx={206} cy={116} rx={20} ry={6} fill="#5b3a1f" />
      <ellipse cx={206} cy={116} rx={22} ry={7.5} fill="none" stroke="#b98d57" strokeWidth={2.4} />
      <g clipPath="url(#rl-clip-embed)">
        <Ball x={206} y={118} r={12} />
      </g>
      {[[184, 108], [229, 110], [196, 124], [222, 123]].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r={1.4} fill="#6b4527" />
      ))}
      <Shot from={{ x: 202, y: 102 }} via={{ x: 186, y: 50 }} to={{ x: 156, y: 102 }} c={C.blue} dash="3 2" />
      <T x={146} y={74} a="end" c={C.blue}>
        바로 뒤 지점에서
      </T>
      <Line from={{ x: 206, y: 126 }} to={{ x: 206, y: 154 }} c="#fff" w={1.4} />
      <Pill x={220} y={168} w={124} c="#78350f">
        자기 자국에 박힌 공
      </Pill>
      <Line from={{ x: 150, y: 124 }} to={{ x: 116, y: 154 }} c="#fff" w={1.4} />
      <Pill x={92} y={168} w={112} c={C.blue}>
        한 클럽 이내 드롭
      </Pill>
      <Ok x={30} y={30} />
      <T x={46} y={34} a="start" c={C.ok} s={13}>
        벌타 없음
      </T>
    </Fig>
  );
}

function WrongGreen() {
  const hole = { x: 290, y: 30 };
  const near = { x: 138, y: 122 };
  return (
    <Fig label="옆 그린: 반드시 빼고, 가장 가까운 지점에서 한 클럽 이내에 드롭">
      <Rough />
      <Green x={290} y={24} rx={34} ry={18} />
      <Green x={200} y={92} rx={54} ry={54} />
      <Flag x={222} y={80} c="#f8fafc" />
      <Flag {...hole} />
      <T x={290} y={58} s={10}>
        내 홀
      </T>
      <T x={208} y={128} c="#14532d">
        옆 그린
      </T>
      <HalfDisc at={near} r={26} hole={hole} />
      <Ball x={164} y={108} />
      <No x={180} y={98} />
      <circle cx={near.x} cy={near.y} r={3} fill={C.blue} />
      <Line from={{ x: 159, y: 111 }} to={{ x: 142, y: 120 }} c={C.blue} arrow />
      <T x={112} y={96} a="end" c={C.blue}>
        그린 밖 가장
      </T>
      <T x={112} y={110} a="end" c={C.blue}>
        가까운 지점
      </T>
      <T x={104} y={172} a="end" c={C.blue}>
        한 클럽 이내
      </T>
      <T x={204} y={178} c={C.bad}>
        그대로 치면 2벌타
      </T>
    </Fig>
  );
}

function Drop() {
  return (
    <Fig label="드롭은 무릎 높이에서 똑바로 떨어뜨린다">
      <SideBg ground={168} />
      <DropGolfer />
      <Line from={{ x: 40, y: 131 }} to={{ x: 304, y: 131 }} c={C.blue} dash="5 4" w={1.5} />
      <T x={304} y={124} a="end" c={C.blue}>
        무릎 높이
      </T>
      <Ball x={150} y={130} r={4.6} />
      <DropHand />
      <Line from={{ x: 150, y: 139 }} to={{ x: 150, y: 161 }} c={C.blue} arrow />
      <Ok x={169} y={150} />
      <Line from={{ x: 160, y: 64 }} to={{ x: 304, y: 64 }} c="#9ca3af" dash="3 4" w={1.2} />
      <Ball x={226} y={64} ghost />
      <No x={244} y={64} />
      <T x={304} y={88} a="end" c={C.bad}>
        어깨 높이는
      </T>
      <T x={304} y={102} a="end" c={C.bad}>
        예전 방식
      </T>
    </Fig>
  );
}

/** 옆에서 본 벙커 한 칸 (x 부터 너비 150) */
function SandScene({ x, touch }: { x: number; touch: boolean }) {
  const bx = x + 96;
  const sand = `M${x + 22} 120 Q${x + 34} 122 ${x + 40} 132 Q${x + 80} 160 ${x + 150} 148 L${x + 150} 200 L${x + 22} 200Z`;
  return (
    <g>
      <path d={`M${x} 118 L${x + 22} 118 Q${x + 34} 120 ${x + 40} 130 Q${x + 80} 158 ${x + 150} 146 L${x + 150} 200 L${x} 200Z`} fill="url(#rl-turf)" />
      <path d={sand} fill="url(#rl-sand)" />
      <path d={sand} fill="url(#rl-sandgrain)" />
      <Ball x={bx} y={143} r={6.5} />
      <Iron hx={bx - 28} hy={touch ? 151 : 141} gx={x + 30} gy={22} />
      {touch && <path d={`M${bx - 34} 152 q4 -4 8 0 q4 -4 8 0`} fill="none" stroke="#c9a663" strokeWidth={1.4} />}
      {touch ? <No x={bx - 18} y={174} /> : <Ok x={bx - 18} y={118} />}
    </g>
  );
}

function BunkerSand() {
  return (
    <Fig label="벙커에서 치기 전에 클럽이 공 앞뒤 모래에 닿으면 2벌타">
      <rect width="320" height="200" fill="url(#rl-sky)" />
      <SandScene x={4} touch={false} />
      <SandScene x={166} touch />
      <Line from={{ x: 160, y: 14 }} to={{ x: 160, y: 196 }} c="#d1d5db" w={1} />
      <T x={84} y={192} c={C.ok}>
        띄우면 괜찮아요
      </T>
      <T x={244} y={192} c={C.bad}>
        모래에 대면 2벌타
      </T>
    </Fig>
  );
}

function BunkerUnplayable() {
  const hole = { x: 168, y: 26 };
  const ball = { x: 156, y: 104 };
  const edgeY = 110 + 46 * Math.sqrt(1 - ((backTo(hole, ball, 154).x - 160) / 96) ** 2);
  const edge = backTo(hole, ball, edgeY);
  const end = backTo(hole, ball, 200);
  return (
    <Fig label="벙커 언플레이어블: 벙커 안에 드롭하면 1벌타, 벙커 밖 뒤쪽은 2벌타">
      <defs>
        <clipPath id="rl-clip-bunker">
          <ellipse cx={160} cy={110} rx={96} ry={46} />
        </clipPath>
      </defs>
      <rect width="320" height="200" fill="url(#rl-fairway)" />
      <Green x={168} y={20} rx={44} ry={20} />
      <Flag {...hole} />
      <ellipse cx={160} cy={112} rx={100} ry={50} fill="#8fbf6b" />
      <ellipse cx={160} cy={110} rx={96} ry={46} fill="url(#rl-sand)" />
      <ellipse cx={160} cy={110} rx={96} ry={46} fill="url(#rl-sandgrain)" />
      <path d="M64 110 A96 46 0 0 1 256 110" fill="none" stroke="rgba(120,90,40,0.25)" strokeWidth={4} />
      <HalfDisc at={ball} r={34} hole={hole} clip="rl-clip-bunker" />
      <Line from={ball} to={edge} c={C.relief} w={16} />
      <Line from={edge} to={end} c="rgba(234,88,12,0.25)" w={16} />
      <Line from={edge} to={end} c={C.amber} dash="4 3" />
      <Line from={hole} to={ball} c="#374151" dash="3 3" w={1.2} />
      <Ball {...ball} />
      <T x={226} y={118} c={C.blue}>
        1벌타
      </T>
      <T x={226} y={132} c={C.blue} s={10}>
        (벙커 안)
      </T>
      <T x={170} y={186} a="start" c={C.amber}>
        2벌타 (벙커 밖 뒤쪽)
      </T>
    </Fig>
  );
}

function Flagstick() {
  const top = 108;
  return (
    <Fig label="깃대를 꽂은 채 퍼트해도 벌타가 없다">
      <rect width="320" height="200" fill="url(#rl-sky)" />
      <Block top={top} front={140} surface="url(#rl-green)" />
      {/* 홀 컵: 앞을 잘라 속이 보이게 */}
      <rect x={193} y={138} width={34} height={44} fill="url(#rl-cup)" />
      <path d="M193 138 V182 M227 138 V182" stroke="#e5e7eb" strokeWidth={2} />
      <ellipse cx={210} cy={182} rx={17} ry={4} fill="#e5e7eb" />
      <ellipse cx={210} cy={138} rx={17} ry={4.5} fill="#111827" stroke="#e5e7eb" strokeWidth={1.4} />
      {/* 깃대 · 깃발 */}
      <rect x={207.5} y={12} width={5} height={170} rx={2} fill="url(#rl-pole)" stroke="#9ca3af" strokeWidth={0.6} />
      <path d="M213 13 q15 -6 32 3 q-8 7 0 16 q-16 -8 -32 -2z" fill={C.red} />
      <path d="M213 13 q15 -6 32 3 q-8 7 0 16" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
      {/* 굴러와 깃대에 맞고 들어가는 공 */}
      <Shot from={{ x: 70, y: 128 }} via={{ x: 140, y: 126 }} to={{ x: 186, y: 128 }} c={C.blue} dash="3 3" />
      {[[150, 124], [144, 129], [152, 134]].map(([lx, ly]) => (
        <line key={ly} x1={lx} y1={ly} x2={lx + 18} y2={ly} stroke="rgba(255,255,255,0.85)" strokeWidth={1.6} strokeLinecap="round" />
      ))}
      <Ball x={198} y={128} r={9} />
      <path d="M205 118 l-3 -4 M209 116 v-5 M213 118 l3 -4" stroke="#f59e0b" strokeWidth={1.6} strokeLinecap="round" />
      <Line from={{ x: 199, y: 146 }} to={{ x: 199, y: 170 }} c="#93c5fd" w={2} arrow />
      <Ok x={30} y={32} />
      <T x={46} y={36} a="start" c={C.ok} s={13}>
        꽂은 채 쳐도 OK
      </T>
      <Pill x={96} y={172} w={164} c={C.ok}>
        깃대에 맞고 들어가도 홀인
      </Pill>
    </Fig>
  );
}

/** 위에서 본 퍼트 한 칸 (x 부터 너비 150): 홀 · 퍼트 선 · 공 · 발 · 퍼터 */
function PuttScene({ x, straddle }: { x: number; straddle: boolean }) {
  const cx = x + 75;
  return (
    <g>
      <ellipse cx={cx} cy={30} rx={7} ry={4.2} fill="#1f2937" />
      <path d={`M${cx - 7} 30 a7 4.2 0 0 0 14 0`} fill="none" stroke="#f8fafc" strokeWidth={1} />
      <Line from={{ x: cx, y: 126 }} to={{ x: cx, y: 40 }} c="#fff" dash="4 4" w={2} />
      {straddle ? (
        <>
          <Shoe x={cx - 17} y={164} rot={0} />
          <Shoe x={cx + 17} y={164} rot={0} />
          <Putter x={cx} y={143} rot={0} />
        </>
      ) : (
        <>
          <Shoe x={cx - 36} y={120} rot={90} />
          <Shoe x={cx - 36} y={150} rot={90} />
          <Putter x={cx - 8} y={134} rot={90} />
        </>
      )}
      <Ball x={cx} y={134} r={5.5} />
    </g>
  );
}

function Straddle() {
  return (
    <Fig label="퍼트 선을 가랑이 사이에 두고 치면 2벌타, 선 옆에 서서 친다">
      <rect width="320" height="200" fill="url(#rl-green)" />
      <PuttScene x={6} straddle />
      <PuttScene x={164} straddle={false} />
      <Line from={{ x: 160, y: 14 }} to={{ x: 160, y: 196 }} c="rgba(255,255,255,0.8)" w={1} />
      <No x={124} y={160} />
      <Ok x={268} y={160} />
      <T x={81} y={196} c={C.bad}>
        선 위에 서면 2벌타
      </T>
      <T x={239} y={196} c="#14532d">
        선 옆에 서면 OK
      </T>
    </Fig>
  );
}

function Advice() {
  return (
    <Fig label="몇 번 쳤어요라고 묻는 사람과 알려 준 사람 모두 2벌타">
      <rect width="320" height="200" fill="url(#rl-sky)" />
      <path d="M0 176 Q80 166 160 172 T320 168 V200 H0Z" fill="#cfe6b3" />
      <Bust x={78} shirt={C.shirt} />
      <g transform="translate(482 0) scale(-1 1)">
        <Bust x={240} shirt={C.shirt2} />
      </g>
      <Bubble x={14} y={36} w={126} tail={{ x: 84, y: 96 }}>
        몇 번 쳤어요?
      </Bubble>
      <Bubble x={180} y={36} w={126} tail={{ x: 236, y: 96 }}>
        7번이요
      </Bubble>
      {[124, 196].map((x) => (
        <g key={x}>
          <rect x={x - 21} y={128} width={42} height={20} rx={10} fill={C.bad} />
          <text x={x} y={142} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">
            2벌타
          </text>
        </g>
      ))}
    </Fig>
  );
}

function DoubleHit() {
  return (
    <Fig label="한 번 스윙에 공이 두 번 맞아도 1타로 센다">
      <SideBg ground={160} />
      <path d="M40 54 Q96 176 176 116" fill="none" stroke="#9ca3af" strokeWidth={1.4} strokeDasharray="4 4" />
      <Iron hx={112} hy={159} gx={92} gy={30} />
      <Ball x={146} y={153} r={6.5} />
      <Line from={{ x: 156, y: 153 }} to={{ x: 190, y: 153 }} c="#6b7280" arrow />
      {[
        [136, 126],
        [172, 112],
      ].map(([x, y]) => (
        <g key={x}>
          <path
            d={Array.from({ length: 16 }, (_, i) => {
              const r = i % 2 ? 11 : 19;
              const t = (i * Math.PI) / 8;
              return `${i ? "L" : "M"}${x + r * Math.cos(t)} ${y + r * 0.8 * Math.sin(t)}`;
            }).join(" ") + "Z"}
            fill="#fde68a"
            stroke="#f59e0b"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fontWeight={900} fill="#b45309">
            탁!
          </text>
        </g>
      ))}
      <T x={258} y={104} s={24} w={900} c={C.ok}>
        = 1타
      </T>
      <T x={258} y={126} c={C.soft} w={600}>
        벌타 없음
      </T>
    </Fig>
  );
}

export const FIGURES: Record<string, () => ReactNode> = {
  tee: Tee,
  ob: Ob,
  provisional: Provisional,
  "provisional-play": ProvisionalPlay,
  search: Search,
  "wrong-ball": WrongBall,
  "ball-moved": BallMoved,
  "improve-lie": ImproveLie,
  divot: Divot,
  embedded: Embedded,
  "pa-play": PaPlay,
  "pa-yellow": PaYellow,
  "pa-red": PaRed,
  unplayable: Unplayable,
  "cart-path": CartPath,
  "wrong-green": WrongGreen,
  drop: Drop,
  "bunker-sand": BunkerSand,
  "bunker-unplayable": BunkerUnplayable,
  flagstick: Flagstick,
  straddle: Straddle,
  advice: Advice,
  "double-hit": DoubleHit,
};
