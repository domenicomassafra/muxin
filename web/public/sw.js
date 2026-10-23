/* Plancia offline behavior. API, session, owner documents, and HTML are never cached. */
const CACHE_NAME = 'plancia-static-v1';
const CACHE_PREFIX = 'plancia-static-';
const OFFLINE_PAGE = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#111111"><title>Plancia · Offline</title>
<style>html{color-scheme:dark;font:16px system-ui,sans-serif;background:#111;color:#f5f5f5}body{max-width:34rem;margin:18vh auto;padding:1.5rem}h1{font-size:1.6rem}p{line-height:1.6;color:#ccc}a{display:inline-block;padding:.75rem 1rem;border:1px solid #aaa;border-radius:.6rem;color:inherit}</style></head>
<body><main><h1>Plancia non raggiungibile</h1><p>La connessione è assente. Per proteggere i dati owner, le informazioni operative non sono disponibili offline.</p><a href="/">Riprova</a></main></body></html>`;

const offlineResponse = () => new Response(OFFLINE_PAGE, {
  status: 503,
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  },
});

const isVersionedAsset = (url, destination) =>
  (destination === 'script' || destination === 'style') &&
  /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(url.pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Only the root application document receives a generic offline notice;
  // backend routes, login, /agents and every other document stay network-only.
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(offlineResponse));
    return;
  }

  // Vite's content-hashed JS/CSS is public code. No API, JSON, cookies, HTML,
  // workspace files, photos or arbitrary image responses enter Cache Storage.
  if (!isVersionedAsset(url, request.destination)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    const cacheControl = response.headers.get('Cache-Control') || '';
    const type = response.headers.get('Content-Type') || '';
    const expectedType = request.destination === 'script' ? /javascript/i : /text\/css/i;
    if (response.ok && response.type === 'basic' && expectedType.test(type) &&
        /(?:^|,)\s*public(?:\s*,|\s*$)/i.test(cacheControl) &&
        !/no-store|private/i.test(cacheControl)) {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
