/*
 * 서비스 워커: 골프장처럼 신호가 없을 때도 앱 화면이 열리게 한다.
 * - 화면(HTML): 통신이 되면 늘 새로 받고(새 버전 반영), 안 되면 마지막으로 받은 화면
 * - /assets/ (빌드 파일, 이름에 해시가 있어 바뀌지 않음): 한 번 받으면 보관해 두고 쓴다
 * - 글꼴(외부): 보관본을 먼저 쓰고 뒤에서 새로 받아 둔다
 * - 서버(Supabase)·version.json 은 건드리지 않는다 (늘 통신, 저장 대기열은 앱이 따로 처리)
 */
const SHELL = "mg-shell-v1";
const ASSETS = "mg-assets-v1";
const FONTS = "mg-fonts-v1";
const KEEP = [SHELL, ASSETS, FONTS];

const FONT_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

/** index.html 이 쓰는 빌드 파일 목록 */
const assetsIn = (html) => [...new Set(html.match(/\/assets\/[^"')\s]+/g) || [])];

/** 빌드 파일 하나를 보관본에서 꺼내거나 받아서 보관한다 */
async function ensureAsset(assets, path) {
  const hit = await assets.match(path);
  if (hit) return hit;
  try {
    const r = await fetch(path);
    if (r.ok) {
      await assets.put(path, r.clone());
      return r;
    }
  } catch {
    /* 다음에 다시 받는다 */
  }
  return null;
}

/**
 * 받은 화면을 보관하고, 그 화면이 쓰는 빌드 파일도 미리 받아 둔다.
 * 나중에 불러오는 조각(골프장 목록 등)도 JS 안의 "./이름-해시.js" 를 찾아 함께 받는다. 예전 빌드 파일은 지운다
 */
async function keepShell(res) {
  const html = await res.clone().text();
  const shell = await caches.open(SHELL);
  await shell.put("/index.html", res.clone());
  const assets = await caches.open(ASSETS);
  const wanted = new Set(assetsIn(html));
  const queue = [...wanted];
  while (queue.length > 0) {
    const path = queue.shift();
    const r = await ensureAsset(assets, path);
    if (!r || !path.endsWith(".js")) continue;
    const text = await r.clone().text();
    for (const m of text.matchAll(/["'`]\.\/([A-Za-z0-9_.-]+\.(?:js|css))["'`]/g)) {
      const next = "/assets/" + m[1];
      if (!wanted.has(next)) {
        wanted.add(next);
        queue.push(next);
      }
    }
  }
  // 지금 화면이 쓰지 않는 예전 빌드 파일 정리
  const keys = await assets.keys();
  const keepSet = wanted;
  await Promise.all(
    keys.map((req) => {
      const path = new URL(req.url).pathname;
      return keepSet.has(path) ? null : assets.delete(req);
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/index.html", { cache: "no-store" });
        if (res.ok) await keepShell(res);
      } catch {
        /* 통신이 없으면 다음 접속 때 보관한다 */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 화면: 통신 먼저, 안 되면 보관본
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
            event.waitUntil(keepShell(res.clone()));
          }
          return res;
        } catch {
          const cached = await caches.match("/index.html", { cacheName: SHELL });
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 빌드 파일: 보관본 먼저 (파일 이름이 내용마다 달라 바뀌지 않는다)
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const assets = await caches.open(ASSETS);
        const hit = await assets.match(url.pathname);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await assets.put(url.pathname, res.clone());
        return res;
      })()
    );
    return;
  }

  // 아이콘·manifest: 보관본이 있으면 쓰고 뒤에서 새로 받는다
  if (url.origin === self.location.origin && /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }

  // 글꼴
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, FONTS));
  }
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (hit) return hit;
  return (await fresh) || Response.error();
}
