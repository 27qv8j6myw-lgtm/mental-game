/*
 * 링크로 바로 참여: 초대 링크(https://…/?join=1234)로 들어오면 코드를 기기에 적어 두었다가
 * 로그인을 마치고 홈이 열리면 그 라운드에 바로 참여한다.
 * (로그인 리디렉트 동안 주소의 값이 사라지므로 기기에 보관. Supabase 로그인이 ?code= 를 쓰므로 이름은 join)
 *
 * 아이폰에 멘탈게임 앱이 있으면 같은 링크가 앱에서 열린다 (유니버설 링크: public/.well-known/apple-app-site-association,
 * 앱 빌드 5부터). 카카오톡처럼 앱 안 브라우저에서 열리면 앱이 바로 열리지 않아, 로그인 화면에서 '앱에서 열기'를 보여 준다
 */

const KEY = "mentalgame-invite";
/** 이보다 오래된 초대는 버린다 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** App Store 의 멘탈게임 */
export const APP_STORE_URL = "https://apps.apple.com/kr/app/id6825780377";

/** 초대 링크 */
export const inviteLink = (code: string) => `${window.location.origin}/?join=${code}`;

/**
 * 아이폰 앱에서 바로 여는 주소 (앱이 없으면 열리지 않는다).
 * 값 이름을 join 으로 둬서, 이 주소를 따로 처리하지 않는 1.0 앱도 웹을 /?join=1234 로 열어 그대로 참여된다
 * (code 로 두면 1.0 앱이 로그인 결과로 알고 ?code= 로 넘겨 로그인 오류가 난다)
 */
export const appJoinLink = (code: string) => `kr.mentalgame.golf://join?join=${code}`;

/** "2026-11-02" → "11월 2일 (일)". 형식이 다르면 그대로 */
function dayLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${Number(m[2])}월 ${Number(m[3])}일 (${"일월화수목금토"[d.getDay()]})`;
}

/**
 * 카톡 등으로 보내는 초대 메시지. 문단마다 빈 줄을 두고, 링크도 글 안에 넣어 순서를 고정한다
 * (공유 창에 url 을 따로 주면 앱마다 링크를 맨 앞·맨 뒤에 붙여 문단이 흐트러진다)
 */
export function inviteMessage(r: {
  code: string;
  course: string;
  date: string;
  teeTime: string;
  holes: number;
  /** "타당 1,000원 · 현금" 같은 게임 방식 한 줄 */
  game: string;
}): string {
  const when = [r.date && dayLabel(r.date), r.teeTime, `${r.holes}홀`].filter(Boolean).join(" · ");
  return [
    "⛳ 멘탈게임 라운드에 초대해요",
    [r.course && `📍 ${r.course}`, when && `📅 ${when}`, r.game && `🏌️ ${r.game}`].filter(Boolean).join("\n"),
    `🔑 초대 코드: ${r.code}`,
    `👉 링크를 누르면 바로 참여돼요\n${inviteLink(r.code)}`,
    "· 앱을 설치하지 않아도 돼요\n· 아이폰에 멘탈게임 앱이 있으면 앱에서 열려요",
  ].join("\n\n");
}

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

function read(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { code: string; at: number } | null;
    return v && Date.now() - v.at < MAX_AGE_MS ? v.code : null;
  } catch {
    return null;
  }
}

/** 기다리는 초대 코드를 보기만 한다 (로그인 화면 안내용) */
export const peekInvite = (): string | null => read();

/** 기다리는 초대 코드를 꺼낸다 (한 번 꺼내면 지운다) */
export function takeInvite(): string | null {
  const code = read();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return code;
}

/** 아이폰·아이패드의 브라우저인지 (멘탈게임 앱 안이 아니라) */
export function isAppleMobileBrowser(): boolean {
  const ua = navigator.userAgent;
  if (/MentalGameApp\//.test(ua)) return false;
  // 아이패드는 데스크톱 Safari 처럼 보이기도 해서 터치 여부로 가린다
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
