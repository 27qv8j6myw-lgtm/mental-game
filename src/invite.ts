/*
 * 링크로 바로 참여: 초대 링크(https://…/?join=1234)로 들어오면 코드를 기기에 적어 두었다가
 * 로그인을 마치고 홈이 열리면 그 라운드에 바로 참여한다.
 * (로그인 리디렉트 동안 주소의 값이 사라지므로 기기에 보관. Supabase 로그인이 ?code= 를 쓰므로 이름은 join)
 */

const KEY = "mentalgame-invite";
/** 이보다 오래된 초대는 버린다 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** 초대 링크 */
export const inviteLink = (code: string) => `${window.location.origin}/?join=${code}`;

/** 앱을 열 때 한 번: 주소의 ?join= 을 기기에 옮기고 주소에서는 지운다 */
export function captureInvite() {
  try {
    const url = new URL(window.location.href);
    const code = (url.searchParams.get("join") ?? "").replace(/\D/g, "").slice(0, 4);
    if (!url.searchParams.has("join")) return;
    if (code.length === 4) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    url.searchParams.delete("join");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* 저장소를 쓸 수 없으면 직접 코드를 입력하면 된다 */
  }
}

/** 기다리는 초대 코드를 꺼낸다 (한 번 꺼내면 지운다) */
export function takeInvite(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code: string; at: number } | null;
    localStorage.removeItem(KEY);
    return v && Date.now() - v.at < MAX_AGE_MS ? v.code : null;
  } catch {
    return null;
  }
}
