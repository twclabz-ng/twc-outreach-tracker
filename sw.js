/* TWC Labs Outreach — Service Worker
 * Never intercept Apps Script API traffic. */

const VERSION = 'v4.0.0';
const SHELL_CACHE   = 'twc-shell-' + VERSION;
const RUNTIME_CACHE = 'twc-runtime-' + VERSION;

const BASE = self.location.pathname.replace(/\/sw\.js$/, '') || '';

const SHELL_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/app.js',
  BASE + '/styles.css',
  BASE + '/manifest.json',
  BASE + '/offline.html',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS).catch(err => console.warn('Precache partial:', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    url.hostname === 'script.google.com' ||
    url.hostname === 'script.googleusercontent.com' ||
    url.hostname.endsWith('.googleusercontent.com')
  ) return;

  if (request.method !== 'GET') return;

  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !url.hostname.includes('jsdelivr') && !url.hostname.includes('fonts.')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          return response;
        })
        .catch(() => caches.match(BASE + '/index.html'))
        .catch(() => caches.match(BASE + '/offline.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'TWC Labs Outreach', {
      body: data.body || 'New referral update',
      icon: BASE + '/icons/icon-192.png',
      badge: BASE + '/icons/icon-96.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || BASE + '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || BASE + '/'));
});
