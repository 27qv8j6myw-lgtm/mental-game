/*
 * 한 문단에 문장이 둘 이상이면 마침표 뒤에서 줄을 바꾼다.
 * 다음 문장이 윗줄 중간에서 시작해 두 줄에 걸쳐 끊기지 않게 (예: "…저장돼요. 방장이" ↵ "확정하면…").
 * 문구마다 <br> 을 넣는 대신 화면에 그려진 글자를 고쳐서, 새 화면·새 문구도 저절로 맞는다.
 * 팝업(alert·confirm·prompt)도 같은 규칙으로 문장마다 줄을 바꾼다
 */

/** 한글 뒤 마침표·물음표·느낌표 다음 빈칸 (다음 글자가 가운뎃점·닫는 괄호면 그대로) */
const BETWEEN = /([가-힣][.?!])[  ]+(?=[^\s·)])/g;
/** 글자 조각 끝의 문장 끝 + 빈칸 (뒤에 <b> 같은 다른 조각이 이어질 때) */
const AT_END = /([가-힣][.?!])[  ]+$/;
/** 앞 조각이 문장 끝으로 끝났는지 */
const ENDS_SENTENCE = /[가-힣][.?!]$/;

export const breakSentences = (s: string) => s.replace(BETWEEN, "$1\n");

/** 고친 글자를 담은 요소 (index.css 에서 줄바꿈을 그대로 보여 준다) */
const MARK = "sentences";
const SKIP = "input, textarea, select, [contenteditable], svg, script, style";

function fixText(t: Text) {
  const v = t.nodeValue;
  const el = t.parentElement;
  if (!v || !el || el.closest(SKIP)) return;
  let next = breakSentences(v);
  if (t.nextSibling) next = next.replace(AT_END, "$1\n");
  const prev = t.previousSibling?.textContent;
  if (prev && ENDS_SENTENCE.test(prev)) next = next.replace(/^[  ]+(?=\S)/, "\n");
  if (next === v) return;
  // 한 줄로 자르는 칸(nowrap·말줄임)은 그대로 둔다
  if (!(MARK in el.dataset) && getComputedStyle(el).whiteSpace !== "normal") return;
  el.dataset[MARK] = "";
  t.nodeValue = next;
}

function fixTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return fixText(root as Text);
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) fixText(n as Text);
}

export function watchSentences() {
  // 팝업: 문장마다 줄을 바꿔 띄운다 (앱에서는 iOS 알림 창으로 그대로 넘어간다)
  const { alert, confirm, prompt } = window;
  window.alert = (m?: unknown) => alert.call(window, breakSentences(String(m ?? "")));
  window.confirm = (m?: string) => confirm.call(window, breakSentences(m ?? ""));
  window.prompt = (m?: string, d?: string) => prompt.call(window, breakSentences(m ?? ""), d);

  // 화면 글자: 처음 한 번, 그 뒤로는 바뀔 때마다 (React 가 글자를 바꾸면 다시 고친다)
  fixTree(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") fixText(r.target as Text);
      else r.addedNodes.forEach(fixTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
}
