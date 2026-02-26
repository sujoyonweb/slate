// Bumped to v2.4 to trigger the update on user devices
const CACHE_NAME = 'slate-core-v1.0.0';

// The critical skeleton that must be cached on the very first install
const APP_SHELL = [
  './',
  './index.html',
  './css/variables.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/animations.css',
  './js/app.js',
  './js/state.js',
  './js/ui.js',
  './js/events.js',
  './js/storage.js',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

// 1. INSTALLATION: Cache the App Shell silently in the background
self.addEventListener('install', (event) => {
  // THE FIX: No self.skipWaiting() here. 
  // The update will patiently wait until the user completely closes the app.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Slate SW] Installing & Caching App Shell');
      return cache.addAll(APP_SHELL);
    })
  );
});

// 2. ACTIVATION: The Silent Garbage Collector
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // Destroy old versions to free up phone storage
          if (cache !== CACHE_NAME) {
            console.log('[Slate SW] Purging old cache:', cache);
            return caches.delete(cache); 
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all open pages gracefully
  );
});

// 3. FETCH: The "Stale-While-Revalidate" Engine with Strict Security
self.addEventListener('fetch', (event) => {
  // STRICT SHIELD: We don't cache API calls, browser extensions, or POST requests
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      
      // The background network fetch
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Only cache valid, successful responses
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If the internet is down, fail silently (the user is offline)
        console.log('[Slate SW] Offline mode active.');
      });

      // THE MAGIC: Return the instant cache if it exists, otherwise wait for the network.
      return cachedResponse || fetchPromise;
    })
  );
});