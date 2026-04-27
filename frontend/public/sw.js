// AI MedIncident PWA service worker.
// Стратегия: network-first для навигации с fallback на закэшированную оболочку,
// cache-first для статических ассетов (иконки, манифест).

const CACHE_VERSION = "aimi-v3";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSETS_CACHE = `${CACHE_VERSION}-assets`;
const OFFLINE_URL = "/offline";

const SHELL_ASSETS = [
  "/",
  "/appeals",
  "/profile",
  "/offline",
  "/manifest.webmanifest",
  "/icons/shield.svg",
  "/icons/shield-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNavigationRequest(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/_next/static/")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Никогда не кэшируем авторизацию и server actions.
  if (
    url.pathname.startsWith("/api/auth") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, res.clone()).catch(() => {});
          return res;
        } catch (err) {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          const fallback = await cache.match(OFFLINE_URL);
          if (fallback) return fallback;
          const shell = await cache.match("/");
          if (shell) return shell;
          throw err;
        }
      })()
    );
  }
});
