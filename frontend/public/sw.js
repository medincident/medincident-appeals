
const CACHE_VERSION = "aimi-v5";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSETS_CACHE = `${CACHE_VERSION}-assets`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = "/offline";

const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/shield.svg",
  "/icons/shield-maskable.svg",
  "/icons/shield-monochrome.svg",
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
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "clear-shell") {
    event.waitUntil(
      Promise.all([
        caches.delete(SHELL_CACHE),
        caches.delete(RUNTIME_CACHE),
      ]).then(() =>
        caches.open(SHELL_CACHE).then((cache) =>
          Promise.all(
            SHELL_ASSETS.map((url) =>
              cache.add(new Request(url, { cache: "reload" })).catch(() => {})
            )
          )
        )
      )
    );
  }
});

function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
  );
}

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

function isRuntimeAsset(url, request) {
  if (request.destination === "image" || request.destination === "font") return true;
  if (url.pathname.startsWith("/_next/image")) return true;
  return false;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API не трогаем — токены и ПДн не должны попадать в кэш.
  if (url.pathname.startsWith("/api/")) return;

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request, ASSETS_CACHE));
    return;
  }

  if (isRuntimeAsset(url, request)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          return res;
        } catch (err) {
          const cache = await caches.open(SHELL_CACHE);
          const fallback = await cache.match(OFFLINE_URL);
          if (fallback) return fallback;
          throw err;
        }
      })()
    );
  }
});
