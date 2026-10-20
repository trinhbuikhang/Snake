// Moonlit Serpent service worker.
//
// Cache strategy:
// - Navigations (index.html): network-first, so a fresh deploy is never
//   shadowed by a stale app shell. Falls back to the cached shell offline.
// - Hashed static assets (assets/*): cache-first. Filenames are
//   content-addressed, so a cached copy can never be stale.
//
// Bump CACHE when the precache list or this strategy changes; on activate
// every older moonlit-serpent-* cache is deleted.
const CACHE = 'moonlit-serpent-v3'
const CORE = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('moonlit-serpent-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations: network-first — a new deploy must always win over cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return res
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./'))),
    )
    return
  }

  // Static assets: cache-first (hashed filenames are content-addressed).
  event.respondWith(
    caches.match(request, { ignoreSearch: false }).then(
      (hit) =>
        hit ||
        fetch(request)
          .then((res) => {
            // Cache a copy of every successful same-origin response for offline play.
            if (res && (res.status === 200 || res.type === 'opaque')) {
              const copy = res.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return res
          })
          .catch(() => caches.match('./index.html')),
    ),
  )
})
