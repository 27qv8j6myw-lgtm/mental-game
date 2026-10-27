import type { ReactNode } from "react";
import cartPathImg from "./img/cart-path.svg";
import dropImg from "./img/drop.svg";

/*
 * 일러스트 배경 룰 그림 (카트 도로 · 드롭): Hugging Face 로 그린 평면 일러스트를 Adobe 로 벡터화한 배경 위에
 * R&A 규칙 그림처럼 표시를 얹는다. 구제 구역은 연어색, 기준점은 검은 점, 클럽 길이는 갈고리 달린 검은 선.
 * 좌표는 배경 그림에서 잰 값이다 (320×200 칸에 꽉 채운 기준)
 */

type P = { x: number; y: number };

const K = {
  ink: "#1d1d1b",
  relief: "#d9a28d",
  red: "#b3262e",
  ok: "#3f8a3a",
  blue: "#2563eb",
};

const f = (p: P) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
const unit = (x: number, y: number): P => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/** 배경 그림 한 장을 칸에 꽉 채운다 */
function Scene({ src, label, children }: { src: string; label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 200" role="img" aria-label={label}>
      <image href={src} x={0} y={0} width={320} height={200} preserveAspectRatio="xMidYMid slice" />
      {children}
    </svg>
  );
}

/** 그림 위 글씨 (흰 테두리로 어디서나 읽히게) */
function Text({ x, y, children, a = "start", s = 9, w = 700, c = K.ink }: P & { children: ReactNode; a?: "start" | "middle" | "end"; s?: number; w?: number; c?: string }) {
  return (
    <text x={x} y={y} textAnchor={a} fontSize={s} fontWeight={w} fill={c} letterSpacing="-0.02em" stroke="#fff" strokeWidth={2.8} strokeLinejoin="round" paintOrder="stroke">
      {children}
    </text>
  );
}

/** 화살표 (끝에 삼각형) */
function Arrow({ from, to }: { from: P; to: P }) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const l = 4.2;
  const w = 2.2;
  const b = { x: to.x - l * Math.cos(a), y: to.y - l * Math.sin(a) };
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      <line x1={from.x} y1={from.y} x2={b.x} y2={b.y} stroke={K.ink} strokeWidth={0.9} />
      <path
        d={`M${f(to)} L${f({ x: b.x - w * Math.sin(a), y: b.y + w * Math.cos(a) })} L${f({ x: b.x + w * Math.sin(a), y: b.y - w * Math.cos(a) })}Z`}
        fill={K.ink}
        stroke="#fff"
        strokeWidth={0.6}
        paintOrder="stroke"
      />
    </g>
  );
}

/** 클럽 길이 표시: 검은 선 + 양 끝 갈고리 (헤드 쪽은 크게) */
function Club({ from, to, side = 1 }: { from: P; to: P; side?: 1 | -1 }) {
  const u = unit(to.x - from.x, to.y - from.y);
  const n = { x: -u.y * side, y: u.x * side };
  const hook = (p: P, s: number, back: number) =>
    `M${f(p)} Q${f({ x: p.x + n.x * s + u.x * back * 0.2, y: p.y + n.y * s + u.y * back * 0.2 })} ${f({ x: p.x + n.x * s + u.x * back, y: p.y + n.y * s + u.y * back })}`;
  return (
    <g stroke={K.ink} strokeWidth={1.3} fill="none" strokeLinecap="round">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      <path d={hook(to, 2.6, -2.2)} strokeWidth={1.8} />
      <path d={hook(from, 1.4, 1.2)} />
    </g>
  );
}

/** 벌타 배지: 1·2 벌타(빨강) 또는 벌타 없음(초록) */
function Badge({ x, y, n }: P & { n: 1 | 2 | "free" }) {
  const free = n === "free";
  return (
    <g filter="url(#rl-lift)">
      <circle cx={x} cy={y} r={15} fill="#fff" />
      <circle cx={x} cy={y - 1.6} r={10} fill={free ? K.ok : K.red} />
      {free ? (
        <path d={`M${x - 4.4} ${y - 1.6} l3 3.1 l5.8 -6`} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <text x={x} y={y + 2.2} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">
          +{n}
        </text>
      )}
      <text x={x} y={y + 12.4} textAnchor="middle" fontSize={4.6} fontWeight={800} fill={free ? K.ok : K.red}>
        {free ? "벌타 없음" : "벌타"}
      </text>
    </g>
  );
}

/** 맞음 ✓ / 틀림 ✕ 동그라미 */
function Mark({ x, y, ok }: P & { ok: boolean }) {
  return (
    <g filter="url(#rl-lift)">
      <circle cx={x} cy={y} r={7.5} fill={ok ? "#4f8f35" : K.red} stroke="#fff" strokeWidth={1.2} />
      {ok ? (
        <path d={`M${x - 3.4} ${y} l2.4 2.5 l4.6 -4.8`} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={`M${x - 2.6} ${y - 2.6} l5.2 5.2 M${x + 2.6} ${y - 2.6} l-5.2 5.2`} stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
      )}
    </g>
  );
}

/** 칸 위 머리띠 (허용 = 초록, 안 됨 = 빨강) */
function Head({ x, w, title, ok }: { x: number; w: number; title: string; ok: boolean }) {
  return (
    <g>
      <rect x={x} y={0} width={w} height={17} fill={ok ? "#5f8f3e" : "#b0473a"} />
      <text x={x + 7} y={12} fontSize={9.5} fontWeight={800} fill="#fff" letterSpacing="-0.02em">
        {title}
      </text>
      <Mark x={x + w - 11} y={29} ok={ok} />
    </g>
  );
}

/** 공 · 기준점 */
function Ball({ x, y, r = 3.2 }: P & { r?: number }) {
  return (
    <g>
      <ellipse cx={x + r * 0.35} cy={y + r * 0.8} rx={r * 1.1} ry={r * 0.4} fill="rgba(0,0,0,0.28)" />
      <circle cx={x} cy={y} r={r} fill="#fff" stroke="#b9bec6" strokeWidth={0.5} />
    </g>
  );
}
const Ref = ({ x, y }: P) => <circle cx={x} cy={y} r={2.6} fill={K.ink} stroke="#fff" strokeWidth={0.7} />;

/**
 * 골프화 발자국 (앞창 + 뒤꿈치, 징 자국). 발끝이 dir 쪽을 본다. 비스듬히 본 만큼 폭을 줄인다.
 * left 면 왼발
 */
function ShoePrint({ at, dir, s = 1, left }: { at: P; dir: P; s?: number; left?: boolean }) {
  const deg = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
  const sole = "M5.6 0 C5.6 -2.2 3.6 -2.9 1.6 -2.8 C-0.4 -2.7 -1.4 -2.3 -1.8 -1.7 C-2.2 -1.1 -2.2 1.2 -1.8 1.8 C-1.4 2.4 -0.2 2.3 1.6 2.6 C3.8 2.9 5.6 2.2 5.6 0Z";
  const heel = "M-3.2 -1.8 C-3.2 -2.4 -4.4 -2.3 -5.2 -2.1 C-6.2 -1.8 -6.4 -0.8 -6.4 0 C-6.4 0.8 -6.2 1.8 -5.2 2.1 C-4.4 2.3 -3.2 2.4 -3.2 1.8Z";
  const spikes = [
    [3.8, -1.2],
    [3.9, 1.1],
    [1.6, -1.6],
    [1.7, 1.6],
    [-0.4, -1.3],
    [-0.3, 1.3],
    [-4.8, -1.1],
    [-4.8, 1.1],
  ];
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${deg.toFixed(1)}) scale(${s} ${s * 0.8}) scale(1 ${left ? -1 : 1})`}>
      <path d={sole} fill="rgba(28,30,34,0.7)" stroke="rgba(255,255,255,0.9)" strokeWidth={0.45} />
      <path d={heel} fill="rgba(28,30,34,0.7)" stroke="rgba(255,255,255,0.9)" strokeWidth={0.45} />
      {spikes.map(([sx, sy], i) => (
        <circle key={i} cx={sx} cy={sy} r={0.42} fill="rgba(255,255,255,0.55)" />
      ))}
    </g>
  );
}

/**
 * 오른손잡이 어드레스 자세: 두 발은 공→핀 직선과 나란히 일렬로 서고, 발끝은 그 직선에 90도로 공을 본다
 * (핀이 몸 왼쪽). 공(ball)에서 핀(pin) 방향을 t, 몸이 보는 방향을 face 라 하면 왼쪽 = t
 */
function stance(ball: P, pin: P, s: number) {
  const t = unit(pin.x - ball.x, pin.y - ball.y);
  const face = { x: -t.y, y: t.x };
  const back = 13 * s; // 공에서 발 가운데까지
  const half = 7 * s; // 두 발 사이 절반
  const c = { x: ball.x - face.x * back, y: ball.y - face.y * back };
  return {
    face,
    t,
    lead: { x: c.x + t.x * half, y: c.y + t.y * half }, // 왼발 (핀 쪽)
    trail: { x: c.x - t.x * half, y: c.y - t.y * half }, // 오른발
  };
}

/** 발 모양 바깥 점들 (길 위에 걸치는지 볼 때) */
function footPoints(at: P, dir: P, s: number) {
  const n = { x: -dir.y, y: dir.x };
  return [
    { x: at.x + dir.x * 5.6 * s, y: at.y + dir.y * 5.6 * s },
    { x: at.x - dir.x * 6.4 * s, y: at.y - dir.y * 6.4 * s },
    { x: at.x + n.x * 2.6 * s, y: at.y + n.y * 2.6 * s },
    { x: at.x - n.x * 2.6 * s, y: at.y - n.y * 2.6 * s },
  ];
}

/* ───────── 카트 도로 ───────── */

/** 배경 그림에서 잰 길 가장자리 (y: 왼쪽 x, 오른쪽 x) */
const EDGES: [number, number, number][] = [
  [194, -7.7, 51.8], [186, -1.4, 56.6], [178, 4.8, 61.5], [170, 11.1, 66.3], [162, 17.5, 71.2], [154, 24, 76.2], [146, 30.7, 81.3],
  [138, 37.2, 86.3], [130, 43.6, 90.8], [122, 50.1, 94.9], [114, 56.6, 99], [106, 63, 103.1], [98, 69.7, 108.1], [90, 76.4, 113.4],
  [82, 82.8, 119.9], [74, 89.5, 126.2], [66, 96.4, 126.8], [58, 103.1, 137.2], [50, 110, 142.5], [42, 116.7, 147.9],
];
function edge(y: number, side: 1 | 2) {
  if (y >= EDGES[0][0]) return EDGES[0][side];
  for (let i = 0; i < EDGES.length - 1; i++) {
    const [y0, y1] = [EDGES[i][0], EDGES[i + 1][0]];
    if (y <= y0 && y >= y1) return EDGES[i][side] + ((EDGES[i + 1][side] - EDGES[i][side]) * (y0 - y)) / (y0 - y1);
  }
  return EDGES[EDGES.length - 1][side];
}
const mid = (y: number) => (edge(y, 1) + edge(y, 2)) / 2;
const onPath = (p: P) => p.x > edge(p.y, 1) - 1.5 && p.x < edge(p.y, 2) + 1.5;
const centerLine = [200, ...EDGES.map((e) => e[0])].map((y) => `${mid(Math.min(194, y)).toFixed(1)},${y}`).join(" ");
/** 깃대 (그림 속 홀) */
const PIN = { x: 197.9, y: 113.6 };
/** 길 오른쪽 · 왼쪽 땅 (구제 구역 자르기) */
const rightOfPath = `M${EDGES.map((e) => `${e[2] + 1.5} ${e[0]}`).join(" L")} L330 42 L330 210 L${EDGES[0][2] + 1.5} 210Z`;
const leftOfPath = `M${EDGES.map((e) => `${e[1] - 1.5} ${e[0]}`).join(" L")} L-10 42 L-10 210 L${EDGES[0][1] - 1.5} 210Z`;

/** 기준점 둘레 한 클럽 (비스듬히 본 타원) 중 홀에 가깝지 않은 반쪽 */
function awayHalf(ref: P, R: number) {
  const t = unit(PIN.x - ref.x, PIN.y - ref.y);
  const a0 = Math.atan2(t.y, t.x) + Math.PI / 2;
  const pts = Array.from({ length: 33 }, (_, i) => {
    const a = a0 + (Math.PI * i) / 32;
    return { x: ref.x + R * Math.cos(a), y: ref.y + R * 0.55 * Math.sin(a) };
  });
  return `M${f(ref)} ` + pts.map((p) => `L${f(p)}`).join(" ") + "Z";
}

/** 가장 가까운 구제 지점: 공과 두 발이 모두 길 밖에 나오는 곳 (공 높이 by 에서 옆으로 찾는다) */
function nearestRelief(by: number, dirX: 1 | -1, s: number) {
  const start = dirX > 0 ? edge(by, 2) + 2 : edge(by, 1) - 2;
  for (let i = 0; i < 200; i++) {
    const ref = { x: start + dirX * i * 0.5, y: by };
    const st = stance(ref, PIN, s);
    const pts = [ref, ...footPoints(st.lead, st.face, s), ...footPoints(st.trail, st.face, s)];
    if (pts.every((p) => !onPath(p))) return { ref, st };
  }
  const ref = { x: start, y: by };
  return { ref, st: stance(ref, PIN, s) };
}

function CartPathFigure({ side }: { side: "left" | "right" }) {
  const right = side === "right";
  const by = right ? 178 : 92;
  const s = right ? 1.35 : 1.15;
  const ball = { x: mid(by) + (right ? 1 : -1) * (edge(by, 2) - mid(by)) * 0.55, y: by };
  const { ref, st } = nearestRelief(by, right ? 1 : -1, s);
  const R = right ? 30 : 32;
  const clipId = right ? "rl-cart-r" : "rl-cart-l";
  // 클럽 길이 선: 왼쪽 그림은 홀 반대쪽으로, 오른쪽 그림은 발자국을 피해 아래쪽으로 (비스듬히 본 만큼 세로를 줄인다)
  const clubDir = right ? { x: Math.cos(1.75), y: Math.sin(1.75) } : { x: -st.t.x, y: -st.t.y };
  const clubEnd = { x: ref.x + clubDir.x * R, y: ref.y + clubDir.y * R * 0.55 };
  return (
    <Scene
      src={cartPathImg}
      label={
        right
          ? "카트 도로: 공이 가운데 선 오른쪽이면 오른쪽, 공과 두 발이 모두 도로 밖에 나오는 가장 가까운 지점에서 한 클럽 이내, 벌타 없음"
          : "카트 도로: 공이 가운데 선 왼쪽이면 왼쪽, 가장 가까운 지점에서 한 클럽 이내, 벌타 없음"
      }
    >
      <clipPath id={clipId}>
        <path d={right ? rightOfPath : leftOfPath} />
      </clipPath>
      <polyline points={centerLine} fill="none" stroke="#fff" strokeWidth={1.3} strokeDasharray="4 3" />
      <path d={awayHalf(ref, R)} fill={K.relief} opacity={0.9} clipPath={`url(#${clipId})`} />
      <Club from={ref} to={clubEnd} side={right ? 1 : -1} />
      <ShoePrint at={st.lead} dir={st.face} s={s} left />
      <ShoePrint at={st.trail} dir={st.face} s={s} />
      <Ref {...ref} />
      <Ball {...ball} r={right ? 3.2 : 3} />
      <Text x={142} y={30} s={10} w={800}>
        카트 도로
      </Text>
      {right ? (
        <>
          <Text x={142} y={64}>
            가운데 선
          </Text>
          <Arrow from={{ x: 140, y: 64 }} to={{ x: mid(70) + 2, y: 70 }} />
          <Text x={8} y={150}>
            원래 공 자리
          </Text>
          <Text x={8} y={159} s={7.6} w={600}>
            (가운데 선 오른쪽)
          </Text>
          <Arrow from={{ x: 30, y: 162 }} to={{ x: ball.x - 2, y: ball.y - 3 }} />
          <Text x={150} y={140}>
            가장 가까운 구제 지점 (기준점)
          </Text>
          <Arrow from={{ x: 148, y: 140 }} to={{ x: ref.x + 2, y: ref.y - 2.6 }} />
          <Text x={150} y={166}>
            구제 구역 · 한 클럽
          </Text>
          <Arrow from={{ x: 148, y: 166 }} to={{ x: ref.x + 12, y: ref.y + 7 }} />
          <Text x={150} y={194}>
            발도 도로 밖에 있어야 해요
          </Text>
          <Arrow from={{ x: 148, y: 192 }} to={{ x: st.trail.x + 2, y: st.trail.y + 3 }} />
        </>
      ) : (
        <>
          <Text x={142} y={56}>
            가운데 선
          </Text>
          <Arrow from={{ x: 140, y: 56 }} to={{ x: mid(64) + 2, y: 64 }} />
          <Text x={150} y={92}>
            원래 공 자리
          </Text>
          <Text x={150} y={101} s={7.6} w={600}>
            (가운데 선 왼쪽)
          </Text>
          <Arrow from={{ x: 148, y: 94 }} to={{ x: ball.x + 3.4, y: ball.y }} />
          <Text x={4} y={56}>
            가장 가까운 구제 지점 (기준점)
          </Text>
          <Arrow from={{ x: 56, y: 59 }} to={{ x: ref.x - 0.6, y: ref.y - 3 }} />
          <Text x={4} y={124}>
            구제 구역 · 한 클럽
          </Text>
          <Arrow from={{ x: 30, y: 116 }} to={{ x: (ref.x + clubEnd.x) / 2 - 2, y: ref.y + 6 }} />
          <Text x={4} y={184} s={8.4} w={600}>
            공과 두 발이 모두 도로 밖인 가장 가까운 곳
          </Text>
        </>
      )}
      <Badge x={298} y={24} n="free" />
    </Scene>
  );
}

/** 카트 도로는 공이 가운데 선 왼쪽 · 오른쪽 두 장 */
export function CartPathIllust() {
  return (
    <>
      <CartPathFigure side="left" />
      <div className="rl-fig-gap" />
      <CartPathFigure side="right" />
    </>
  );
}

/* ───────── 드롭 ───────── */

/** 아래로 떨어지는 길 (점선 + 화살촉 + 떨어진 자리) */
function Fall({ x, from, to, c }: { x: number; from: number; to: number; c: string }) {
  return (
    <g>
      <line x1={x} y1={from} x2={x} y2={to - 4} stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
      <line x1={x} y1={from} x2={x} y2={to - 4} stroke={c} strokeWidth={1.3} strokeDasharray="2.6 2.2" />
      <path d={`M${x - 3} ${to - 5} L${x} ${to} L${x + 3} ${to - 5}Z`} fill={c} stroke="#fff" strokeWidth={0.6} paintOrder="stroke" />
      <ellipse cx={x} cy={to + 1.6} rx={4.4} ry={1.4} fill="rgba(0,0,0,0.22)" />
    </g>
  );
}

/** 높이 표시 (점선 + 글씨). gap: 공 자리는 비워 둔다 */
function Level({ x1, x2, y, c, label, lx, la = "start", faint, gap }: { x1: number; x2: number; y: number; c: string; label: string; lx: number; la?: "start" | "end"; faint?: boolean; gap?: number }) {
  const segs: [number, number][] = gap == null ? [[x1, x2]] : [[x1, gap - 6], [gap + 6, x2]];
  return (
    <g opacity={faint ? 0.75 : 1}>
      {segs.map(([a, b]) => (
        <g key={a}>
          <line x1={a} y1={y} x2={b} y2={y} stroke="#fff" strokeWidth={2.4} />
          <line x1={a} y1={y} x2={b} y2={y} stroke={c} strokeWidth={1.2} strokeDasharray="3 2.4" />
        </g>
      ))}
      <Text x={lx} y={y - 4} a={la} s={8.6} w={800} c={c}>
        {label}
      </Text>
    </g>
  );
}

export function DropIllust() {
  const ok = { x: 100.4, y: 148.4, ground: 191 };
  const no = { x: 281, y: 56.1, ground: 191 };
  return (
    <Scene src={dropImg} label="드롭은 무릎 높이에서 똑바로 떨어뜨린다. 어깨 높이는 예전 방식이라 안 된다">
      {/* 배경에서 지운 클럽·바닥 공 자리의 가는 테두리 덮기 (잔디색) */}
      <ellipse cx={101.2} cy={182.4} rx={6.4} ry={7.8} fill="rgb(116,170,121)" />
      <ellipse cx={242.9} cy={176.4} rx={4.4} ry={4.2} fill="rgb(115,168,121)" />
      <rect x={245} y={176.8} width={18.6} height={3} rx={1.5} fill="rgb(115,168,121)" />
      <ellipse cx={169.1} cy={191.6} rx={3.6} ry={3.6} fill="rgb(107,158,111)" />
      <Level x1={4} x2={154} y={ok.y} c={K.blue} label="무릎 높이" lx={150} la="end" gap={ok.x} />
      <Fall x={ok.x} from={ok.y + 4} to={ok.ground} c={K.blue} />
      <Level x1={166} x2={316} y={no.y} c={K.red} label="어깨 높이" lx={168} gap={no.x} />
      <Level x1={166} x2={316} y={ok.y} c={K.blue} label="무릎 높이" lx={168} faint gap={no.x} />
      <Fall x={no.x} from={no.y + 4.5} to={no.ground} c={K.red} />
      <Head x={0} w={158} title="허용 · 무릎 높이에서" ok />
      <Head x={162} w={158} title="안 돼요 · 예전 방식" ok={false} />
      <rect x={158} y={0} width={4} height={200} fill="#fff" />
    </Scene>
  );
}
