/* Версія кешу — підіймай разом із CODE_VERSION в index.html */
const CACHE = 'search-v107';
const CORE = ['./', './index.html', './manifest.json'];
const EXTRA = ['./favicon.png', './apple-touch-icon.png'];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* Ядро обов'язкове: без нього офлайн не працюватиме, тож помилка зупиняє установку */
    await Promise.all(CORE.map(a => c.add(new Request(a, { cache: 'reload' }))));
    /* Іконки не критичні */
    await Promise.all(EXTRA.map(a => c.add(new Request(a, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Мережа з таймаутом → кеш. Нова версія видна з першого запуску,
   а при відсутності зв'язку (або слабкому) відкривається кеш. */
async function networkFirst(req, fallbackKey) {
  const c = await caches.open(CACHE);
  const fromCache = async () =>
    (await c.match(req, { ignoreSearch: true })) ||
    (fallbackKey && (await c.match(fallbackKey))) ||
    Response.error();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS);
    const r = await fetch(req, { signal: ctrl.signal, cache: 'no-cache' });
    clearTimeout(timer);
    if (r && r.ok) {
      c.put(fallbackKey || req, r.clone()).catch(() => {});
      return r;
    }
    return await fromCache();
  } catch (_) {
    return await fromCache();
  }
}

/* Кеш одразу, оновлення у фоні (для іконок, маніфесту тощо) */
async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE);
  const cached = await c.match(req, { ignoreSearch: true });
  const net = fetch(req)
    .then(r => { if (r && r.ok) c.put(req, r.clone()); return r; })
    .catch(() => null);
  return cached || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* Google Sheets та інші чужі запити не чіпаємо: дані кешує сам застосунок */
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, './index.html'));
    return;
  }
  e.respondWith(staleWhileRevalidate(req));
});
