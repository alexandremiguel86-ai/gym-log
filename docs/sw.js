/* Service worker: cache-first do shell, para o app abrir sem rede.
 *
 * Suba o numero de CACHE a cada deploy que mude index/app/styles, senao o
 * iPhone continua servindo a versao antiga do cache indefinidamente.
 */

var CACHE = 'gymlog-v1';

var SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './exercises.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;

  // O POST para o Apps Script nunca passa pelo cache.
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) {
        // Atualiza em segundo plano para o proximo carregamento.
        fetch(req)
          .then(function (res) {
            if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res); });
          })
          .catch(function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
