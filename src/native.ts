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

/* ---- 앱에 요청하고 답 받기: 앱이 window.mgNative.reply(id, 결과) 로 돌려준다 ---- */

const pending = new Map<number, (payload: unknown) => void>();
let nextId = 1;
(window as unknown as { mgNative: unknown }).mgNative = {
  reply(id: number, payload: unknown) {
    const done = pending.get(id);
    pending.delete(id);
    done?.(payload);
  },
};

function ask<T>(type: string, data: Record<string, unknown>): Promise<T> {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve as (payload: unknown) => void);
    bridge()?.postMessage({ type, id, ...data });
  });
}

export interface AppleLoginResult {
  /** Apple 이 준 신원 토큰 (Supabase signInWithIdToken 에 넘긴다) */
  idToken?: string;
  /** 처음 로그인할 때만 Apple 이 알려 주는 이름 */
  fullName?: string;
  /** 인증 코드 (회원 탈퇴 때 Apple 토큰 취소에 쓴다. 빌드 3 부터) */
  authCode?: string;
  cancelled?: boolean;
  error?: string;
}

/** 아이폰의 Apple 로그인 창을 연다. nonce 는 원래 값의 SHA-256 (토큰에 그대로 담겨 돌아온다) */
export const requestAppleLogin = (nonceHash: string) => ask<AppleLoginResult>("apple", { nonce: nonceHash });

export interface SaveImageResult {
  saved?: boolean;
  /** 사진 보관함 권한을 거절함 */
  denied?: boolean;
  error?: string;
}

/** 이미지(PNG base64)를 아이폰 사진 보관함에 바로 저장한다 (iOS 앱에서만) */
export const saveImageToPhotos = (base64: string) => ask<SaveImageResult>("saveImage", { data: base64 });

/** 앱 버전 (User-Agent 끝 "MentalGameApp/1.0.1"). 앱이 아니면 null */
export function nativeVersion(): number[] | null {
  const m = /MentalGameApp\/([\d.]+)/.exec(navigator.userAgent);
  return m ? m[1].split(".").map(Number) : null;
}
/** 앱 버전이 v 이상인지 (새 기능을 그 버전부터 부를 때) */
export function nativeAtLeast(v: string): boolean {
  const have = nativeVersion();
  if (!have) return false;
  const want = v.split(".").map(Number);
  for (let i = 0; i < Math.max(have.length, want.length); i++) {
    const a = have[i] ?? 0;
    const b = want[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

export interface LocationResult {
  lat?: number;
  lon?: number;
  /** 위치 권한을 거절함 */
  denied?: boolean;
  error?: string;
}

/** 지금 대략적인 위치 한 번 (iOS 앱 1.0.1 부터. 라운드 날씨에만 쓰고 저장하지 않는다) */
export const requestNativeLocation = () => ask<LocationResult>("location", {});

