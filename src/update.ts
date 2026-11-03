/*
 * 새 버전 자동 반영
 * 홈 화면에 추가한 앱(PWA)은 백그라운드에서 다시 열면 예전 화면을 그대로 보여준다.
 * 앱이 다시 보일 때마다 배포된 version.json 을 확인해, 새 버전이면 새로고침한다.
 * 입력 중이거나 스코어 수정·설정 시트처럼 저장 전 내용이 있는 화면에서는 건너뛰고 다음에 다시 확인한다.
 * 화면을 켜 둔 채 배포되면 나중에 여는 화면 조각을 못 받으니, 그때는 newVersionDeployed 로 보고 새로고침을 권한다.
 */

/** 너무 자주 확인하지 않도록 최소 간격 */
const CHECK_GAP_MS = 60_000;
let lastCheck = 0;
let reloading = false;

async function deployedVersion(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

const RELOADED_KEY = "mg-reloaded-for";
const readReloadedFor = () => {
  try {
    return sessionStorage.getItem(RELOADED_KEY);
  } catch {
    return null;
  }
};
const writeReloadedFor = (v: string) => {
  try {
    sessionStorage.setItem(RELOADED_KEY, v);
  } catch {
    /* 저장이 막힌 환경이면 그냥 새로고침만 한다 */
  }
};

/** 새로고침하면 날아갈 내용이 화면에 있는지 */
function hasUnsavedWork(): boolean {
  const el = document.activeElement as HTMLElement | null;
  const typing =
    !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  // 홀 수정 바(.edit-bar), 저장 안 한 내 기록·기록 모드 초안([data-unsaved]), 정산 설정 수정 등 열린 시트(.modal-backdrop)
  const editing = !!document.querySelector(".edit-bar, [data-unsaved], .modal-backdrop");
  return typing || editing;
}

async function check() {
  if (reloading || document.visibilityState !== "visible") return;
  const now = Date.now();
  if (now - lastCheck < CHECK_GAP_MS) return;
  lastCheck = now;

  const latest = await deployedVersion();
  if (!latest || latest === __APP_VERSION__) return;
  // 이 버전 때문에 이미 한 번 새로고침했는데도 예전 화면이면(캐시 등) 계속 새로고침하지 않는다
  if (readReloadedFor() === latest) return;
  if (hasUnsavedWork()) {
    lastCheck = 0; // 다음에 다시 보일 때 바로 확인
    return;
  }
  reloading = true;
  writeReloadedFor(latest);
  window.location.reload();
}

/** 화면 조각(골프 룰·사용 방법 등)을 못 받았을 때: 새 버전이 배포돼서 예전 파일을 찾은 것인지. 개발 서버·통신이 안 되면 false */
export async function newVersionDeployed(): Promise<boolean> {
  if (!import.meta.env.PROD) return false;
  const latest = await deployedVersion();
  return !!latest && latest !== __APP_VERSION__;
}

const REOPEN_KEY = "mg-reopen";
/** 새로고침한 뒤 이 시간 안에 뜬 화면만 다시 연다 */
const REOPEN_MS = 15_000;

/** 새 버전으로 새로고침한다. reopen 은 새로고침한 뒤 바로 열 화면 */
export function reloadForUpdate(reopen?: string) {
  try {
    if (reopen) sessionStorage.setItem(REOPEN_KEY, JSON.stringify({ key: reopen, at: Date.now() }));
  } catch {
    /* 기억하지 못하면 다시 열지 않을 뿐 */
  }
  window.location.reload();
}

/** 새로고침 전에 열던 화면이면 true (한 번만) */
export function takeReopen(key: string): boolean {
  try {
    const v = JSON.parse(sessionStorage.getItem(REOPEN_KEY) ?? "null") as { key: string; at: number } | null;
    if (!v || v.key !== key) return false;
    sessionStorage.removeItem(REOPEN_KEY);
    return Date.now() - v.at < REOPEN_MS;
  } catch {
    return false;
  }
}

/** 배포 환경에서만: 앱이 다시 보일 때 새 버전을 확인한다 */
export function startUpdateCheck() {
  if (!import.meta.env.PROD) return;
  document.addEventListener("visibilitychange", () => void check());
  window.addEventListener("focus", () => void check());
  // Safari 가 페이지를 메모리에서 되살린 경우(뒤로 가기 캐시)
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) void check();
  });
}
