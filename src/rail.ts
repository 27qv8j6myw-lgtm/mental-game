import { useSyncExternalStore } from "react";

/*
 * 옆에 카메라·상태 막대가 있는 폰(예: iPhone Duo)
 * 세로 화면에서 오른쪽 안전 영역이 넓으면 그 막대가 있는 폰으로 보고 <html data-rail="right"> 를 붙인다.
 * 그러면 아래 탭이 오른쪽 막대 안에 세로로 선다 (index.css). 막대 위쪽은 시계·와이파이 자리(--status-h)
 * 펼쳐서 화면이 넓어지면 대시보드 화면으로 (useUnfolded)
 *
 * 시계·와이파이가 가리는 높이는 앱(빌드 4~)이 window.mgLayout 으로 넘겨 준다. 없으면 CSS 기본값
 */

/** 이 폭보다 넓으면 옆 막대로 본다 (일반 아이폰 세로 화면은 0) */
const RAIL_MIN = 40;
/** 위 안전 영역이 이보다 크면 펼친 채 돌려서 막대가 위로 온 것으로 본다 (일반 아이폰은 많아야 62) */
const TOP_RAIL_MIN = 72;
/** 옆 막대가 있고 화면이 이 폭 이상이면 펼친 것으로 본다 (접으면 466, 펼치면 951) */
const UNFOLDED_MIN = 700;

/** 앱이 넘겨 주는 값 (CSS px). 없는 값은 0·null */
interface NativeLayout {
  cornerW?: number;
  cornerH?: number;
  side?: "right" | "left" | null;
  hingeX?: number | null;
}
declare global {
  interface Window {
    __mgLayout?: NativeLayout;
    mgLayout?: (l: NativeLayout) => void;
    __duoCheck?: () => string[];
  }
}

/** 개발 서버의 듀오 흉내: ?duo=1 로 켜고 ?duo=0 으로 끈다 (브라우저에는 옆 막대 안전 영역이 없어서) */
const DUO_KEY = "mentalgame-duo";
/** iPhone Duo 시뮬레이터에서 잰 값: 오른쪽 막대 84pt, 아래 홈 표시줄 34pt */
const SIM = { right: 84, bottom: 34 };

function duoSim(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const q = new URLSearchParams(window.location.search).get("duo");
    if (q === "1") localStorage.setItem(DUO_KEY, "1");
    if (q === "0") localStorage.removeItem(DUO_KEY);
    return localStorage.getItem(DUO_KEY) === "1";
  } catch {
    return false;
  }
}

let unfolded = false;
let sideRail = false;
/** 앱이 넘긴 시계 칸 높이 (CSS px). 0 이면 모른다 (1.0 앱 · 브라우저) */
let nativeStatusH = 0;
const listeners = new Set<() => void>();
const root = () => document.documentElement;

export function watchSideRail() {
  const sim = duoSim();
  // 폭은 오른쪽, 높이는 위 안전 영역과 같은 보이지 않는 상자. 앱(웹뷰)은 화면이 뜬 뒤에야 안전 영역을 알려 줘서 크기가 바뀔 때마다 다시 본다
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;" +
    "width:env(safe-area-inset-right, 0px);height:env(safe-area-inset-top, 0px)";
  document.body.appendChild(probe);
  if (sim) {
    root().style.setProperty("--safe-right", `${SIM.right}px`);
    root().style.setProperty("--safe-bottom", `${SIM.bottom}px`);
    simStatus();
  }

  const update = () => {
    const box = probe.getBoundingClientRect();
    const rail = sim || box.width >= RAIL_MIN;
    // 펼친 채 돌리면 막대가 위로 온다: 위 바를 그 막대 안에 넣고 화면 폭을 다 쓴다 (index.css)
    if (rail) root().dataset.rail = "right";
    else if (box.height >= TOP_RAIL_MIN) root().dataset.rail = "top";
    else delete root().dataset.rail;
    const next = rail && window.innerWidth >= UNFOLDED_MIN;
    if (next) root().dataset.unfolded = "";
    else delete root().dataset.unfolded;
    if (next !== unfolded || rail !== sideRail) {
      unfolded = next;
      sideRail = rail;
      listeners.forEach((l) => l());
    }
    placeRailActions();
  };

  // 앱이 넘긴 시계·와이파이 높이 (먼저 왔으면 window.__mgLayout 에 남아 있다)
  const applyNative = (l: NativeLayout | undefined) => {
    nativeStatusH = l?.cornerH && l.side !== "left" ? Math.round(l.cornerH) : 0;
    if (nativeStatusH) root().style.setProperty("--native-status-h", `${nativeStatusH}px`);
    else root().style.removeProperty("--native-status-h");
  };
  window.mgLayout = (l) => {
    applyNative(l);
    update();
  };
  applyNative(window.__mgLayout);

  update();
  // 화면이 바뀌어 아래 탭·라운드 버튼 줄이 생기거나 바뀌면 막대 버튼 캡슐 자리를 다시 잡는다 (그리기 전에 불린다)
  new MutationObserver(placeRailActions).observe(document.body, { childList: true, subtree: true });
  if (typeof ResizeObserver === "function") new ResizeObserver(update).observe(probe);
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  if (import.meta.env.DEV) window.__duoCheck = duoCheck;
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

/** 옆 막대가 있는 폰을 펼쳤는지 */
export function useUnfolded() {
  return useSyncExternalStore(subscribe, () => unfolded);
}

/** 옆 막대가 있는 폰인지 (접힘·펼침 모두) */
export function useSideRail() {
  return useSyncExternalStore(subscribe, () => sideRail);
}

/** 막대 안에 두는 것 (아래 탭 · 막대 버튼 · 라운드 아래 줄) */
const RAIL_ITEMS = ".tabbar, .rail-actions, .play-bar, .round-end, .round-exit";
/** 막대 아래쪽에 쌓이는 것 (아래 탭 · 라운드 아래 줄) */
const RAIL_DOCK = ".tabbar, .play-bar, .round-end, .round-exit";

/**
 * 막대 버튼 캡슐(+ · 알림 · 라운드 탭) 자리 (index.css .rail-actions 의 bottom).
 * 노래를 틀거나 실시간 현황이 뜨면 막대 위쪽 시계 칸이 길어진다.
 * - 앱(빌드 4~)이 시계 칸 높이를 넘기면: 시계 바로 아래. 길어지면 따라 내려가고, 아래 탭(라운드는 아래 버튼 줄) 위에서 멈춘다
 * - 모르면(1.0 앱 · 브라우저): 길어져도 가려지지 않게 아래 탭 바로 위
 */
function placeRailActions() {
  let dockTop = Infinity;
  if (sideRail)
    document.querySelectorAll<HTMLElement>(RAIL_DOCK).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) dockTop = Math.min(dockTop, r.top);
    });
  const h = window.innerHeight;
  // 가장 낮은 자리: 아래 탭 바로 위 (탭이 없는 화면은 CSS 기본값 --float-bottom)
  let bottom = dockTop === Infinity ? 0 : h - dockTop + 10;
  const cap = sideRail && nativeStatusH ? document.querySelector<HTMLElement>(".rail-actions") : null;
  if (cap) {
    const underClock = h - (nativeStatusH + 12) - cap.offsetHeight;
    bottom = Math.max(bottom, underClock);
  }
  const next = bottom ? `${Math.round(bottom)}px` : "";
  if (root().style.getPropertyValue("--rail-actions-bottom") !== next) {
    if (next) root().style.setProperty("--rail-actions-bottom", next);
    else root().style.removeProperty("--rail-actions-bottom");
  }
  // 처음 자리를 잡은 뒤부터만 움직임을 부드럽게 (화면을 열 때 아래에서 미끄러져 올라오지 않게)
  if (sideRail && !railMoves) {
    railMoves = true;
    setTimeout(() => (root().dataset.railMoves = ""), 300);
  }
}
let railMoves = false;

/**
 * 개발용 점검: 오른쪽 막대로 삐져나간 본문 버튼·카드, 시계·와이파이와 겹친 막대 버튼.
 * 화면마다 javascript 로 window.__duoCheck() 를 불러 [] 인지 본다
 */
function duoCheck(): string[] {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;right:0;visibility:hidden;pointer-events:none;width:var(--safe-right, 0px);height:var(--status-h, 0px)";
  document.body.append(probe);
  const rail = probe.getBoundingClientRect();
  probe.remove();
  const out: string[] = [];
  if (rail.width === 0) return out;
  document
    .querySelectorAll<HTMLElement>("button, a, input, select, textarea, [role=button], .card, .round-item, .navbtn")
    .forEach((el) => {
      if (el.closest(".duo-sim")) return;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || st.visibility === "hidden" || st.opacity === "0") return;
      const name = `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).trim().split(/\s+/).join(".") : ""} "${(el.textContent ?? "").trim().slice(0, 20)}"`;
      const inRailItem = !!el.closest(RAIL_ITEMS);
      if (!inRailItem && r.right > rail.left + 1) out.push(`막대 침범: ${name}`);
      if (inRailItem && r.top < rail.bottom - 1 && r.right > rail.left) out.push(`시계와 겹침: ${name}`);
    });
  return out;
}

/** 개발용 흉내: 오른쪽 막대 위쪽에 가짜 시계·와이파이 */
function simStatus() {
  const bar = document.createElement("div");
  bar.className = "duo-sim duo-sim-bar";
  bar.innerHTML = "<b>9:41</b><span>●●●</span><span>100</span>";
  document.body.append(bar);
}
