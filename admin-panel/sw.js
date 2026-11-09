/* ============================================================
 * SprichDe — Service Worker (oflayn rejim)
 * Strategiya:
 *   - Sahifalar (navigatsiya): avval internet, bo'lmasa kesh
 *   - CSS/JS/ikonkalar: avval kesh, fonda yangilanadi
 *   - Shriftlar/rasmlar (Google Fonts, Unsplash): avval kesh
 * Versiyani o'zgartirish uchun CACHE_VERSION ni oshiring.
 * ============================================================ */

const CACHE_VERSION = 'v17';
const PRECACHE = 'sprichde-static-' + CACHE_VERSION;
const RUNTIME = 'sprichde-runtime-' + CACHE_VERSION;

// Ilova "qobig'i" — birinchi ochilishda keshlanadi
const ASSETS = [
  './index.html',
  './register.html',
  './app.html',
  './journey.html',
  './trial.html',
  './invite.html',
  './styles.css',
  './theme.css',
  './auth.js',
  './theme.js',
  './pwa.js',
  './manifest.json',
  './admin.html',
  './app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

const PRECACHE_PATHS = new Set(
  ASSETS.map(function (url) {
    try { return new URL(url, self.location).pathname; } catch (e) { return url; }
  })
);

// ---------- O'rnatish ----------
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(PRECACHE).then(function (cache) {
      // Bittasi topilmasa ham qolganlari keshlansin
      return Promise.all(
        ASSETS.map(function (url) {
          return cache.add(url).catch(function () {});
        })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

// ---------- Faollashtirish ----------
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== PRECACHE && key !== RUNTIME; })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

// ---------- So'rovlarni ushlash ----------
self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Sahifa ochilishi — avval internet, keyin kesh
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Bizning statik fayllar — avval kesh, fonda yangilash
  if (url.origin === self.location.origin && PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, PRECACHE));
    return;
  }

  // Shriftlar va rasmlar — avval kesh (oflaynda ham ko'rinadi)
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'images.unsplash.com'
  ) {
    event.respondWith(cacheFirst(request, RUNTIME));
  }
});

// ---------- Strategiyalar ----------
async function networkFirst(request) {
  const cache = await caches.open(PRECACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
      return response;
    }
    // 4xx/5xx javob (masalan, server o'chiq yoki proksi xatosi) —
    // avval keshdan ko'ramiz, shunda oflayn rejim ishonchli ishlaydi.
    const cachedError = await cache.match(request, { ignoreSearch: true });
    if (cachedError) return cachedError;
    return response;
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const fallback = await cache.match('./index.html');
    if (fallback) return fallback;
    return new Response('Oflayn rejim: sahifa topilmadi.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });

  const network = fetch(request)
    .then(function (response) {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(function () { return cached; });

  return cached || network;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Opaque (no-cors) javoblar ham keshlanadi
    if (response) cache.put(request, response.clone());
    return response;
  } catch (e) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}
