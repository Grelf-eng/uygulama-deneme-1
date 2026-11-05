const CACHE_NAME = 'kamu-ilan-pwa-v7';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API isteklerini Service Worker sarmalamadan doğrudan tarayıcıya bırak
  if (url.pathname.startsWith('/api/')) return;

  // Uygulama kabuğu: önce ağdan güncelini dene, çevrimdışıysa önbellekten aç
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html'))),
  );
});

// Bildirime tıklandığında uygulamayı aç ve doğrudan o ilana yönlendir
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const jobId = data.jobId;
  const targetUrl = jobId ? `/#job-${jobId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (jobId) {
            client.postMessage({ type: 'OPEN_JOB', jobId: Number(jobId) });
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

// Web Push bildirimini sistem çekmecesine düşür
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Kamu İlan Asistanı', body: event.data ? event.data.text() : 'Yeni ilan bildirimi' };
  }

  const title = data.title || '🎯 Size uygun 1 yeni ilan çıktı!';
  const options = {
    body: data.body || 'Profilinize uygun yeni kamu ilanı yayınlandı.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      jobId: data.jobId || (data.data && data.data.jobId) || null,
      url: data.url || '/',
    },
    actions: [
      { action: 'open', title: 'İlanı İncele' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
