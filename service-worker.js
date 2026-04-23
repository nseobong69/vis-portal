/* ═══════════════════════════════════════════════
   VIS Portal — Service Worker
   Cache version: bump CACHE_VER when you update the app
   ═══════════════════════════════════════════════ */
const CACHE_VER = 'vis-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

/* ── Install: pre-cache core shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VER).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => {
      // Non-fatal: app still works online if caching fails
      console.warn('[SW] Pre-cache failed:', err);
    })
  );
  self.skipWaiting();
});

/* ── Activate: purge old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VER)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch strategy ── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 1. Supabase API — always network-first (live data)
  if (url.includes('supabase.co') || url.includes('supabase.io')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Offline fallback for API: return cached if any
        return caches.match(event.request);
      })
    );
    return;
  }

  // 2. Cloudinary — network-first (images can update)
  if (url.includes('cloudinary.com') || url.includes('res.cloudinary.com')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. CDN scripts (jspdf, supabase-js, fontawesome, etc.) — cache-first
  if (
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('cdn.jsdelivr.net') ||
    url.includes('cdn.sheetjs.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VER).then(cache => cache.put(event.request, copy));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 4. App shell (index.html, manifest, icons) — cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_VER).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
