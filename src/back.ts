import { useEffect, useRef } from "react";

/*
 * 기기 뒤로가기 (안드로이드 뒤로 버튼·iOS 뒤로 쓸기·브라우저 뒤로)
 * 화면 이동은 React 상태로만 하므로 그대로 두면 뒤로가기에 앱이 닫힌다.
 * 하위 화면·시트를 열 때마다 기록(history)을 하나 쌓고, 뒤로가기가 오면 맨 위 화면의 닫기를 부른다.
 * 앱 안의 X·닫기로 닫으면 쌓아 둔 기록을 함께 걷어 낸다.
 */

interface Entry {
  /** 닫기. false 를 돌려주면 닫지 않고 그 화면에 남는다 (저장 안 한 초안이 있을 때 등) */
  onBack: () => boolean | void;
}

const stack: Entry[] = [];
/** 앱이 스스로 걷어 내는 중이라 무시할 뒤로가기 수 */
let ignorePops = 0;
/** 이번 차례에 걷어 낼 기록 수 (여러 화면이 한꺼번에 닫히면 한 번에) */
let pendingPops = 0;

window.addEventListener("popstate", () => {
  if (ignorePops > 0) {
    ignorePops -= 1;
    return;
  }
  const top = stack[stack.length - 1];
  if (!top) return;
  if (top.onBack() === false) {
    // 남는다: 방금 빠진 기록을 다시 쌓는다
    history.pushState({ mgBack: true }, "");
    return;
  }
  stack.pop();
});

function popLater(n: number) {
  pendingPops += n;
  queueMicrotask(() => {
    if (pendingPops === 0) return;
    const k = pendingPops;
    pendingPops = 0;
    ignorePops += 1;
    history.go(-k);
  });
}

/**
 * active 인 동안 뒤로가기를 onBack 으로 받는다 (하위 화면·시트·탭).
 * onBack 이 false 를 돌려주면 그 화면에 남는다
 */
export function useBack(active: boolean, onBack: () => boolean | void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { onBack: () => ref.current() };
    stack.push(entry);
    history.pushState({ mgBack: true }, "");
    return () => {
      const i = stack.indexOf(entry);
      // 뒤로가기로 닫힌 게 아니라 앱 안에서 닫혔다: 쌓아 둔 기록을 걷어 낸다
      if (i >= 0) {
        stack.splice(i, 1);
        popLater(1);
      }
    };
  }, [active]);
}
