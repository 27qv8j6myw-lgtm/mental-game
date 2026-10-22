import { useSyncExternalStore } from "react";

/*
 * 옆에 카메라·상태 막대가 있는 폰(예: iPhone Duo)
 * 세로 화면에서 오른쪽 안전 영역이 넓으면 그 막대가 있는 폰으로 보고 <html data-rail="right"> 를 붙인다.
 * 그러면 아래 탭이 오른쪽 막대 안(와이파이 아래)에 세로로 선다 (index.css)
 * 펼쳐서 화면이 넓어지면 라운드 화면을 왼쪽 정산 · 오른쪽 홀 진행 두 칸으로 나눈다 (useUnfolded)
 */

/** 이 폭보다 넓으면 옆 막대로 본다 (일반 아이폰 세로 화면은 0) */
const RAIL_MIN = 40;
/** 위 안전 영역이 이보다 크면 펼친 채 돌려서 막대가 위로 온 것으로 본다 (일반 아이폰은 많아야 62) */
const TOP_RAIL_MIN = 72;
/** 옆 막대가 있고 화면이 이 폭 이상이면 펼친 것으로 본다 (접으면 470쯤, 펼치면 950쯤) */
const UNFOLDED_MIN = 700;

let unfolded = false;
const listeners = new Set<() => void>();

export function watchSideRail() {
  // 폭은 오른쪽, 높이는 위 안전 영역과 같은 보이지 않는 상자. 앱(웹뷰)은 화면이 뜬 뒤에야 안전 영역을 알려 줘서 크기가 바뀔 때마다 다시 본다
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;" +
    "width:env(safe-area-inset-right, 0px);height:env(safe-area-inset-top, 0px)";
  document.body.appendChild(probe);
  const update = () => {
    const box = probe.getBoundingClientRect();
    const rail = box.width >= RAIL_MIN;
    // 펼친 채 돌리면 막대가 위로 온다: 위 바를 그 막대 안에 넣고 화면 폭을 다 쓴다 (index.css)
    if (rail) document.documentElement.dataset.rail = "right";
    else if (box.height >= TOP_RAIL_MIN) document.documentElement.dataset.rail = "top";
    else delete document.documentElement.dataset.rail;
    const next = rail && window.innerWidth >= UNFOLDED_MIN;
    if (next) document.documentElement.dataset.unfolded = "";
    else delete document.documentElement.dataset.unfolded;
    if (next !== unfolded) {
      unfolded = next;
      listeners.forEach((l) => l());
    }
  };
  update();
  if (typeof ResizeObserver === "function") new ResizeObserver(update).observe(probe);
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
}

/** 옆 막대가 있는 폰을 펼쳤는지 */
export function useUnfolded() {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => unfolded
  );
}
