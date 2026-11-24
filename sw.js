// とんまとラボ：ホーム画面に追加したときのための service worker
// ・ページとスクリプトは「ネット優先」（更新がすぐ反映される。圏外のときだけ保存済みを使う）
// ・画像とフォントは「保存済み優先」（速く表示する）
// ・カウンターAPIなど別ドメインへの通信には手を出さない
const CACHE = 'tonmato-v3'; // 画像を差し替えたら番号を上げる（古い保存分を消すため）

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com';
  if (!sameOrigin && !isFont) return;

  const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname) || isFont;
  if (isImage) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match(new URL('./', self.registration.scope).href))));
});
