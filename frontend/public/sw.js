/* global clients */
// MyCoinwise – Service Worker (PWA)
const CACHE_NAME = 'mycoinwise-v4';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // ✅ Never intercept non-GET requests (POST/PUT/DELETE go straight to network)
  if (e.request.method !== 'GET') return;

  // ✅ Never intercept or cache API calls or local development/Vite assets
  if (
    e.request.url.includes('/api/') ||
    e.request.url.includes('onrender.com') ||
    e.request.url.includes('localhost') ||
    e.request.url.includes('127.0.0.1') ||
    e.request.url.includes('/@')
  ) {
    return;
  }

  const url = new URL(e.request.url);
  const isStaticAsset = url.pathname.startsWith('/assets/') ||
    /\.(woff2?|ttf|otf|png|jpg|jpeg|webp|avif|svg|ico)$/i.test(url.pathname);

  if (isStaticAsset) {
    // True cache-first for immutable hashed static assets (0ms response from CacheStorage)
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Stale-while-revalidate for navigation HTML and other GET requests
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// Push notifications for budget alerts
self.addEventListener('push', (e) => {
  const data = e.data?.json() || { title: 'MyCoinwise', body: 'Budget alert!' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'mycoinwise-alert',
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
