const CACHE_NAME = 'mg2022-pwa-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css?v=20260820_fix',
  './app.js?v=20260820_fix',
  './course_data.js?v=20260820_fix',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  // Ignore requests to external services or Google Drive / Youtube
  const url = new URL(event.request.url);
  if (!url.pathname.endsWith('.html') && !url.pathname.endsWith('.js') && !url.pathname.endsWith('.css') && !url.pathname.endsWith('.png') && !url.pathname.endsWith('.svg')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Если сеть доступна, берем свежий файл и обновляем кэш
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // Если нет интернета, достаем из кэша
        return caches.match(event.request);
      })
  );
});
