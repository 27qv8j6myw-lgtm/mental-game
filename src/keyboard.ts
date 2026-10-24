/*
 * iOS 키보드: 입력칸을 누르면 키보드가 올라오면서 보이는 영역(visual viewport)만 아래로 밀려,
 * 문서 맨 위에 붙인 상단 바가 화면 위로 밀려 나간다. 밀린 만큼(--vv-top) 상단 바를 내려 보이는 영역 맨 위에 둔다 (index.css).
 * 입력 중일 때만 따라간다 (평소 스크롤·튕김에는 움직이지 않게)
 */
const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.matches("input, textarea, select") || el.isContentEditable);
};

export function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement.style;
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const top = typing() ? Math.max(0, Math.round(vv.offsetTop)) : 0;
      root.setProperty("--vv-top", `${top}px`);
    });
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  document.addEventListener("focusin", update);
  // 키보드가 내려가는 동안에도 보이는 영역이 돌아오니 조금 뒤에 한 번 더
  document.addEventListener("focusout", () => {
    update();
    setTimeout(update, 300);
  });
}
