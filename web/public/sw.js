/*
 * FarmFlow service worker — what makes the web marketplace installable ("Add to Home Screen" on
 * iPhone / iPad, "Install app" on desktop) and usable on patchy mobile data.
 *
 *   /app/*  (hashed JS/CSS bundles)  cache-first; a new deploy ships new file names
 *   /icons/*, /images/*              cache-first
 *   /api/market, /api/meta, /api/listing, /api/seller
 *                                     network-first with a short timeout, falling back to the last copy
 *   page navigations (same origin)   network-first, falling back to the last copy of that page, then to
 *                                     the cached home page (the app shell)
 *
 * Push notifications (Firebase Cloud Messaging, see src/push.ts): every push is shown — iPhone /
 * iPad require it — with FarmFlow's icon and the monochrome sunrise badge; a tap focuses an open
 * FarmFlow window (or opens one) on the notification's link, /notifications by default.
 *
 * Never touched: anything cross-origin (Firebase Auth / Firestore / Storage, Stripe, fonts), any
 * non-GET request (sign-in, donations), and Firebase Hosting's reserved /__/ paths (the auth handler).
 * Bump VERSION to drop every old cache on the next visit.
 */
const VERSION = 'v2';
const STATIC = `ff-static-${VERSION}`;
const DATA = `ff-data-${VERSION}`;
const PAGES = `ff-pages-${VERSION}`;
const PAGE_LIMIT = 40;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add('/')).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  const keep = new Set([STATIC, DATA, PAGES]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ff-') && !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)]);
    if (res.ok) {
      cache.put(request, res.clone()).then(() => trim(cacheName, PAGE_LIMIT));
    }
    return res;
  } catch (err) {
    const hit = (await cache.match(request)) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;

  if (url.pathname.startsWith('/app/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/images/')) {
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGES, '/'));
  }
});

// ---- Push notifications ----
const PUSH_ICON = '/icons/icon-192.png';
const PUSH_BADGE = '/icons/badge-96.png';
const PUSH_LINK = '/notifications';

self.addEventListener('push', (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { notification: { body: event.data && event.data.text() } }; }
  const n = msg.notification || {};
  const data = msg.data || {};
  // Only ever open our own pages from a notification.
  let link = PUSH_LINK;
  try {
    const u = new URL(data.link || (msg.fcmOptions && msg.fcmOptions.link) || PUSH_LINK, self.location.origin);
    if (u.origin === self.location.origin) link = u.pathname + u.search;
  } catch { /* keep the default */ }
  event.waitUntil(self.registration.showNotification(n.title || 'FarmFlow', {
    body: n.body || '',
    icon: n.icon || PUSH_ICON,
    badge: n.badge || PUSH_BADGE,
    tag: msg.fcmMessageId || undefined,
    data: { link },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || PUSH_LINK;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      return open.navigate(link).catch(() => undefined);
    }
    return self.clients.openWindow(link);
  })());
});
