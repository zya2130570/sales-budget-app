// Flow PWA Service Worker — V44
// Provides offline support by caching the app shell on install.
// Uses a "network-first" strategy for navigation, falling back to cache.

const CACHE_NAME = 'flow-v44'
const SHELL_ASSETS = [
  '/',
  '/index.html',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Only handle GET requests
  if (request.method !== 'GET') return
  // Skip Supabase / API calls — always go to network
  const url = new URL(request.url)
  if (url.hostname.includes('supabase') || url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses for the app shell
        if (response.ok && (request.mode === 'navigate' || request.destination === 'script' || request.destination === 'style')) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request).then(cached => cached ?? caches.match('/')))
  )
})
