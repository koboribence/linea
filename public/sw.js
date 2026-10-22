// Keeps map tiles the app has already downloaded, so a route's area loads from the device the
// next time (e.g. a second video of the same neighbourhood). Only stores what the map itself
// requested; it never downloads anything extra.

const CACHE = 'linea-map-tiles-v1';
/** Roughly 100–200 MB at most; the oldest tiles go first. */
const MAX_TILES = 2000;
/** Tiles, fonts and icons; the tile paths carry a data version, so they never go stale. */
const CACHED = [
  /^https:\/\/tiles\.openfreemap\.org\/(planet|fonts|sprites)\//,
  /^https:\/\/tiles\.mapterhorn\.com\/\d+\/\d+\/\d+\.webp$/,
];

let trimTimer;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // The planet's index (which data version is current) must stay fresh
  const isTile = CACHED.some((pattern) => pattern.test(request.url)) && /\.\w+$/.test(request.url);
  if (request.method !== 'GET' || !isTile) return;
  event.respondWith(fromCacheOrNetwork(event));
});

async function fromCacheOrNetwork(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  // The map gets the tile at once; storing it happens alongside
  if (response.ok) {
    event.waitUntil(
      cache
        .put(event.request, response.clone())
        .then(() => scheduleTrim(cache))
        .catch(() => undefined),
    );
  }
  return response;
}

/** Drops the oldest entries above the limit, once the downloads calm down. */
function scheduleTrim(cache) {
  clearTimeout(trimTimer);
  trimTimer = setTimeout(async () => {
    const keys = await cache.keys();
    const excess = keys.length - MAX_TILES;
    for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
  }, 5000);
}
