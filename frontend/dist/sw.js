/* global clients */
// MyCoinwise – Service Worker (PWA)
const CACHE_NAME = 'mycoinwise-v3';
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

  // ✅ Never intercept or cache API calls — bypass SW fetch handler so Axios/browser handle errors natively
  if (e.request.url.includes('/api/') || e.request.url.includes('onrender.com')) {
    return;
  }

  // Cache-first for static assets (JS, CSS, images)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
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
