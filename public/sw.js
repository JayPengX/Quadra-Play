// Quadra Sportsbook's (Odds Study's) service worker: keeps the page's own files so the app opens
// without a connection (with the last prices it saved) and can be installed.
// Odds, scores and sync go to other sites and are never touched here;
// team and league logos are kept (see the end of this file).
//
// A file with a ?v= version (every deploy stamps one) is served from the
// cache first, since that exact version never changes; the page itself from
// the cache too, refreshed behind it (pageFirst); anything else from the
// network first, the cache only when offline.
// One copy per file is kept: a new version replaces the old one.
const CACHE = 'quadra-odds-v1';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      // Only this app's own old copies: the other Quadra apps share this site
      // (and its caches), and the logos are kept for all of them.
      .then(keys => Promise.all(keys.filter(k => k.startsWith('quadra-odds-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function keep(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);
  // Drop older versions of the same file.
  for (const old of await cache.keys()) {
    const o = new URL(old.url);
    if (o.pathname === url.pathname && o.search !== url.search) await cache.delete(old);
  }
  await cache.put(request, response);
}

async function networkFirst(request) {
  try {
    // The page itself is checked with the server every time (a cheap 304
    // when unchanged): GitHub Pages lets browsers keep it 10 minutes, which
    // would open the last deploy's page right after a new one. By address,
    // since a navigation can't be re-sent with options.
    const response = request.mode === 'navigate' ? await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'manual' }) : await fetch(request);
    await keep(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await caches.match(request, { ignoreSearch: request.mode === 'navigate' })) || (request.mode === 'navigate' && (await caches.match('./')));
    if (cached) return cached;
    throw error;
  }
}

// Opening the app: the page kept here at once (no wait for the network,
// even on a poor connection), refreshed in the background for next time.
// A newer deploy is caught by the kit's watchUpdates right after opening,
// which reloads under a ?v= address: that one always asks the network.
async function pageFirst(event) {
  const kept = await caches.match(event.request, { ignoreSearch: true });
  const fresh = networkFirst(event.request);
  if (!kept) return fresh;
  event.waitUntil(fresh.catch(() => {}));
  return kept;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await keep(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (isLogo(request, url)) return event.respondWith(logo(event));
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/version.json')) return;
  if (request.mode === 'navigate' && !url.searchParams.has('v')) return event.respondWith(pageFirst(event));
  event.respondWith(url.searchParams.has('v') && request.mode !== 'navigate' ? cacheFirst(request) : networkFirst(request));
});

// The page lists the files it loaded before this worker was in charge, so
// the very first visit already works offline next time.
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache') return;
  const urls = (event.data.urls || []).filter(u => new URL(u).origin === self.location.origin && !u.endsWith('/version.json'));
  event.waitUntil(
    Promise.all(
      urls.map(u =>
        caches.match(u).then(hit => hit || fetch(u).then(r => keep(new Request(u), r)).catch(() => {}))
      )
    )
  );
});

// ---- Team and league logos ----------------------------------------------------
// ESPN tells browsers to keep a logo for 2 seconds, so without this every
// open downloaded every logo again. Logos are kept here instead, in one
// cache every Quadra app on this site shares (Sportsbook and Fixtures show
// the same clubs): served straight from the device, and checked again in
// the background once a week. Keep in sync with the other apps' sw.js.
const LOGO_CACHE = 'quadra-logos-v1';
const LOGO_HOSTS = ['a.espncdn.com', 'r2.thesportsdb.com'];
const LOGO_FRESH_MS = 7 * 24 * 3600 * 1000;
const LOGO_MAX = 800;
const LOGO_AGE = 'x-quadra-cached-at';

const isLogo = (request, url) => request.method === 'GET' && request.destination === 'image' && LOGO_HOSTS.includes(url.hostname);
// When a logo was saved: on the copy itself (ESPN's, readable), or on a
// small note beside it (TheSportsDB's, which the page may not read).
const logoNote = url => `${self.registration.scope}__logo-saved?u=${encodeURIComponent(url)}`;

async function saveLogo(url) {
  const cache = await caches.open(LOGO_CACHE);
  const now = String(Date.now());
  if (new URL(url).hostname === 'a.espncdn.com') {
    // ESPN allows reading its logos (CORS): kept with the time saved.
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const copy = new Response(await res.blob(), { headers: { 'content-type': res.headers.get('content-type') || 'image/png', [LOGO_AGE]: now } });
    await cache.put(url, copy.clone());
    trimLogos(cache);
    return copy;
  }
  // Not readable (TheSportsDB): kept as the page would get it.
  const res = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
  if (res.type !== 'opaque' && !res.ok) return null;
  await cache.put(url, res.clone());
  await cache.put(logoNote(url), new Response(now));
  trimLogos(cache);
  return res;
}

async function logoAge(cache, url, hit) {
  const saved = hit.type === 'opaque' ? await (await cache.match(logoNote(url)))?.text() : hit.headers.get(LOGO_AGE);
  return Date.now() - (Number(saved) || 0);
}

// Oldest out first once there are too many.
let trimming = false;
async function trimLogos(cache) {
  if (trimming || Math.random() > 0.05) return;
  trimming = true;
  try {
    const keys = (await cache.keys()).filter(k => !k.url.includes('__logo-saved'));
    for (const old of keys.slice(0, Math.max(0, keys.length - LOGO_MAX))) {
      await cache.delete(old);
      await cache.delete(logoNote(old.url));
    }
  } finally {
    trimming = false;
  }
}

async function logo(event) {
  const url = event.request.url;
  const cache = await caches.open(LOGO_CACHE);
  const hit = await cache.match(url);
  if (hit) {
    if ((await logoAge(cache, url, hit)) > LOGO_FRESH_MS) event.waitUntil(saveLogo(url).catch(() => {}));
    return hit;
  }
  return (await saveLogo(url).catch(() => null)) || fetch(event.request);
}

self.addEventListener('notificationclick', event => {
  // A Quadra notice (quadra.mjs notify): open the app where it points.
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => c.url.startsWith(self.registration.scope));
      if (!open) return self.clients.openWindow(url);
      return open.focus().then(c => (url !== c.url && 'navigate' in c ? c.navigate(url) : c));
    })
  );
});

// A notice the Worker sent while the app was closed (Shared-Proxy/push.js):
// shown as it came; a tap opens the app where it points.
self.addEventListener('push', event => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data?.text() || '' };
  }
  const icon = new URL('./icons/icon-192.png', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(data.title || 'Quadra', { body: data.body || '', tag: data.tag || undefined, icon, badge: icon, data: { url: data.url || self.registration.scope } }));
});
