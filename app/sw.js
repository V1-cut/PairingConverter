// Offline cache for the app shell. Bump VERSION whenever app files change.
const VERSION = 'pairing-converter-v3';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './core.js',
  './ics.js',
  './files.js',
  './email.js',
  './email-ui.js',
  './airports.js',
  './polyfills.js',
  './pdf-worker.js',
  './manifest.webmanifest',
  './vendor/pdf.min.mjs',
  './vendor/pdf.worker.min.mjs',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Android "Share to Pairings": hand the shared PDFs to the page
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const pdfs = form.getAll('pdfs');
      const cache = await caches.open('shared-files');
      await Promise.all(pdfs.map((f, i) => cache.put(`./shared/${i}`, new Response(f, { headers: { 'x-name': encodeURIComponent(f.name) } }))));
      return Response.redirect('./?shared=' + pdfs.length, 303);
    })());
    return;
  }

  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // Cache first, refresh in the background
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cached => {
      const fresh = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || fresh;
    }),
  );
});
