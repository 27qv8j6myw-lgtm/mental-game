/**
 * 카카오톡 등 앱 안의 브라우저(인앱 웹뷰) 감지.
 * 구글은 웹뷰에서의 로그인을 막아(403 disallowed_useragent) 외부 브라우저로 열도록 안내한다.
 */
export interface InAppBrowser {
  name: string;
  kakao: boolean;
}

const KNOWN: [RegExp, string][] = [
  [/NAVER\(inapp/i, "네이버 앱"],
  [/DaumApps/i, "다음 앱"],
  [/Instagram/i, "인스타그램"],
  [/FBAN|FBAV/i, "페이스북"],
  [/\bLine\//i, "라인"],
  [/\bBAND\//i, "밴드"],
  [/everytimeApp/i, "에브리타임"],
];

export function detectInApp(ua: string = navigator.userAgent): InAppBrowser | null {
  if (/KAKAOTALK/i.test(ua)) return { name: "카카오톡", kakao: true };
  for (const [re, name] of KNOWN) if (re.test(ua)) return { name, kakao: false };
  // 그 밖의 안드로이드 웹뷰는 UA 에 "; wv)" 가 붙는다
  if (/Android/i.test(ua) && /;\s*wv\)/.test(ua)) return { name: "앱 안 브라우저", kakao: false };
  return null;
}

/**
 * 외부 브라우저로 다시 연다.
 * 카카오톡: 전용 스킴 / 안드로이드: 크롬 인텐트 / 그 외(iOS 등): 열 방법이 없어 링크를 복사한다.
 */
export async function openExternal(
  inApp: InAppBrowser,
  url: string = window.location.href
): Promise<"opened" | "copied" | "failed"> {
  if (inApp.kakao) {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return "opened";
  }
  if (/Android/i.test(navigator.userAgent)) {
    const target = url.replace(/^https?:\/\//, "");
    window.location.href = `intent://${target}#Intent;scheme=https;package=com.android.chrome;end`;
    return "opened";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
