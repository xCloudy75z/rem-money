// Spending Tracker — service worker
// Stale-while-revalidate for the navigation shell, cache-first for other assets.
// Version is injected by scripts/build.js (__VERSION__ → "2.0.0" etc.)
var CACHE_NAME = 'st-__VERSION__';
var PRECACHE = ['./', './index.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; })
             .map(function (n) { return caches.delete(n); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  // Navigation requests: try the actual URL first (cache then network);
  // fall back to cached index.html as the offline app shell only as a last resort.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match(req).then(function (matchedExact) {
        if (matchedExact) {
          // Refresh in background
          fetch(req).then(function (r) {
            if (r && r.ok) {
              var copy = r.clone();
              caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
            }
          }).catch(function () {});
          return matchedExact;
        }
        return fetch(req).then(function (r) {
          if (r && r.ok) {
            var copy = r.clone();
            caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
          }
          return r;
        }).catch(function () {
          // Offline + no exact match → return the shell so SPA can boot
          return caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Everything else: cache-first, fall back to network and cache the response
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (r) {
        if (r && r.ok && (req.url.indexOf('http') === 0)) {
          var copy = r.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        }
        return r;
      });
    })
  );
});

// Allow the page to trigger an immediate update when a new SW is waiting.
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
