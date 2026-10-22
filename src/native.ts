/*
 * iOS 앱(멘탈게임 앱의 웹뷰) 안에서 열렸을 때 앱과 주고받기.
 * 앱은 window.webkit.messageHandlers.mg 통로를 열어 두고, 요청을 받아 앱 기능으로 처리한다 (ios/MentalGame/Web/WebController.swift)
 */

interface Bridge {
  postMessage: (message: unknown) => void;
}

const bridge = (): Bridge | null =>
  (window as unknown as { webkit?: { messageHandlers?: { mg?: Bridge } } }).webkit?.messageHandlers?.mg ?? null;

/** iOS 앱 안에서 열렸는지 */
export const isNativeApp = (): boolean => !!bridge();

/** 앱에서 로그인한 뒤 돌아오는 주소 (Supabase Authentication > URL Configuration > Redirect URLs 에 등록) */
export const NATIVE_LOGIN_REDIRECT = "kr.mentalgame.golf://login-callback";

/**
 * 로그인 창을 앱의 시스템 로그인 창에서 연다 (구글은 앱 안 웹뷰에서의 로그인을 막는다).
 * 끝나면 앱이 로그인 결과를 붙여 이 웹을 다시 연다
 */
export function openNativeLogin(url: string) {
  bridge()?.postMessage({ type: "oauth", url });
}
