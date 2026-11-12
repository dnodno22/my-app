/* Версія кешу — підіймай разом із CODE_VERSION в index.html */
const CACHE = 'search-v194';
const CORE = ['./', './index.html', './manifest.json'];
const EXTRA = ['./favicon.png', './apple-touch-icon.png', './icon-192.png'];

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

let pendingUpdate = false;
self.addEventListener('message', e => {
  /* Застосунок після старту питає, чи не з'явилась нова версія, поки він завантажувався */
  if (e.data === 'hello' && pendingUpdate && e.source) {
    pendingUpdate = false;
    e.source.postMessage({ type: 'app-updated' });
  }
});
async function tellClients(msg) {
  const all = await self.clients.matchAll({ type: 'window' });
  all.forEach(c => c.postMessage(msg));
}

/* Швидкий старт: одразу віддаємо кеш, а свіжу версію перевіряємо у фоні.
   Якщо сторінка змінилась — повідомляємо застосунок (він сам перезавантажиться,
   якщо ще нічого не встиг зробити). Без кешу — звичайна мережа. */
async function cacheFirstRefresh(req, key, isPage) {
  const c = await caches.open(CACHE);
  const cached = await c.match(key, { ignoreSearch: true });
  /* копія для порівняння: сам cached піде у відповідь і його тіло буде спожите */
  const forCompare = cached ? cached.clone() : null;
  const refresh = (async () => {
    try {
      const r = await fetch(isPage ? key : req, { cache: 'no-cache' });
      if (r && r.ok) {
        let changed = false;
        if (isPage && forCompare) {
          try {
            changed = (await r.clone().text()) !== (await forCompare.text());
          } catch (_) {}
        }
        await c.put(key, r.clone());
        if (changed) {
          pendingUpdate = true;
          await tellClients({ type: 'app-updated' });
        }
      }
      return r;
    } catch (_) {
      return null;
    }
  })();
  if (cached) {
    return { res: cached, refresh };
  }
  const r = await refresh;
  return { res: r || Response.error(), refresh: null };
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* Google Sheets та інші чужі запити не чіпаємо: дані кешує сам застосунок */
  if (url.origin !== location.origin) return;
  const isPage = req.mode === 'navigate';
  const key = isPage ? './index.html' : req;
  e.respondWith((async () => {
    const { res, refresh } = await cacheFirstRefresh(req, key, isPage);
    if (refresh) e.waitUntil(refresh);
    return res;
  })());
});
