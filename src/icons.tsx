import { useState } from "react";
import type { Gender } from "./types";
import { genderEmoji } from "./util";

type IconName =
  | "camera"
  | "flag"
  | "trophy"
  | "layers"
  | "plus"
  | "close"
  | "finish"
  | "user"
  | "logout"
  | "share"
  | "chevronLeft"
  | "chevronRight"
  | "male"
  | "female"
  | "birdie"
  | "spark"
  | "gear"
  | "trash"
  | "info"
  | "chart"
  | "refresh"
  | "hook"
  | "slice"
  | "ring"
  | "short";

const PATHS: Record<IconName, JSX.Element> = {
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h11l-2 3.5L17 11H6" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 13v4M9 20h6M10 20v-2h4v2" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 13l9 5 9-5M3 18l9 5 9-5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  finish: (
    <>
      <path d="M5 21V4" />
      <path d="M5 4h4v4h4V4h4v4h-4v4h4v4h-4v-4H9v4H5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.6 15.4 6.4M8.6 13.4l6.8 4.2" />
    </>
  ),
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  male: (
    <>
      <circle cx="10" cy="14" r="5" />
      <path d="M14 10l6-6M15 4h5v5" />
    </>
  ),
  female: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7M9 18h6" />
    </>
  ),
  birdie: (
    <>
      <path d="M16 7a3 3 0 1 0-6 0c0 4-4 4-4 8a6 6 0 0 0 12 0c0-2-1-3-2-4" />
      <path d="M16 7c1-1 3-1 4 0M9 9h.01" />
    </>
  ),
  spark: (
    <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V6M17 16v-8" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  // 티샷: 곧게 가다 왼쪽으로 휘는 공(훅) / 오른쪽으로 휘는 공(슬라이스) / 적중
  hook: (
    <>
      <path d="M15 21C15 13 13 8 6 6" />
      <path d="M6 6l2.5 3.7M6 6l4.1-1.8" />
    </>
  ),
  slice: (
    <>
      <path d="M9 21C9 13 11 8 18 6" />
      <path d="M18 6l-2.5 3.7M18 6l-4.1-1.8" />
    </>
  ),
  ring: <circle cx="12" cy="12" r="6.5" />,
  // 짧거나 안 뜬 티샷: 아래 화살표
  short: (
    <>
      <path d="M12 5v13" />
      <path d="M7 13l5 5 5-5" />
    </>
  ),
  // 스코어카드 사진으로 기록 추가
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.9,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

export function KakaoLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#000"
        d="M12 3C6.48 3 2 6.54 2 10.9c0 2.82 1.87 5.3 4.69 6.7-.15.53-.97 3.4-1 3.62 0 0-.02.17.09.24.11.06.24.01.24.01.32-.04 3.7-2.42 4.28-2.83.55.08 1.12.12 1.7.12 5.52 0 10-3.54 10-7.9S17.52 3 12 3z"
      />
    </svg>
  );
}

export function GoogleLogo({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** 구글 프로필 사진 URL을 표시 크기에 맞게 정규화(고해상도 요청) */
function normalizePhoto(url: string, size: number): string {
  const px = Math.min(256, Math.max(96, Math.round(size * 3)));
  // lh3.googleusercontent.com/...=s96-c 형태 → 원하는 크기로
  if (/=s\d+-c/.test(url)) return url.replace(/=s\d+-c/, `=s${px}-c`);
  if (/googleusercontent\.com/.test(url) && !url.includes("=")) {
    return `${url}=s${px}-c`;
  }
  return url;
}

/**
 * 참가자/사용자 아바타.
 * 로그인 프로필 사진이 있으면 사진을, 로드 실패하거나 없으면 폴백(성별/사람) 아이콘을 표시한다.
 */
export function Avatar({
  photoUrl,
  gender,
  size = 36,
  fallback = "gender",
}: {
  photoUrl?: string | null;
  gender?: Gender;
  size?: number;
  fallback?: "gender" | "user";
}) {
  const [err, setErr] = useState(false);
  const showPhoto = !!photoUrl && !err;
  return (
    <span
      className="avatar"
      data-gender={showPhoto ? undefined : gender ?? "male"}
      style={{ width: size, height: size }}
    >
      {showPhoto ? (
        <img
          src={normalizePhoto(photoUrl!, size)}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setErr(true)}
        />
      ) : fallback === "user" ? (
        <Icon name="user" size={Math.round(size * 0.56)} />
      ) : (
        <span className="avatar-emoji" style={{ fontSize: Math.round(size * 0.62) }}>
          {genderEmoji(gender ?? "male")}
        </span>
      )}
    </span>
  );
}
