/* ============================================================
   FSBS Intern – Service Worker
   Offline-Support & PWA-Installierung
   ============================================================ */

const CACHE = 'fsbs-v13';

/* Statische App-Shell – bei Installation vorher cachen */
const PRECACHE = [
  '/',
  '/login',
  '/members',
  '/anwaerter',
  '/bewerbungen',
  '/bewerbung',
  '/rechnungen',
  '/mv',
  '/protokoll',
  '/zeugnisse',
  '/abstimmung',
  '/zutritte',
  '/zutritte-liste',
  '/nutzer',
  '/style.css',
  '/theme.js',
  '/app-shell.js',
  '/mobile-nav.css',
  '/mobile-nav.js',
  '/logo.png',
  '/logo-mark-light.png',
  '/logo-mark-dark.png',
  '/logo2.png',
  '/favicon/site.webmanifest',
  '/favicon/apple-touch-icon.png',
  '/favicon/android-chrome-192x192.png',
  '/favicon/android-chrome-512x512.png',
  '/favicon/favicon.ico',
];

/* ---------- Install ---------- */
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* ---------- Activate: alte Caches löschen ---------- */
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- Fetch-Strategie ---------- */
self.addEventListener('fetch', evt => {
  const { request } = evt;
  const url = new URL(request.url);

  /* Nur GET cachen */
  if (request.method !== 'GET') return;

  /* Externe APIs immer live abrufen (Supabase, Google Apps Script, CDNs) */
  const skipHosts = [
    'supabase.co', 'googleapis.com', 'googleusercontent.com',
    'google.com', 'unpkg.com', 'cdn.jsdelivr.net'
  ];
  if (skipHosts.some(h => url.hostname.includes(h))) return;

  /* HTML-Seiten: Network-first (immer frischer Inhalt, Fallback auf Cache).
     Die Seiten laufen ohne Endung – /zutritte etwa liefert GitHub Pages
     aus zutritte.html aus. Die Prüfung auf .html bleibt trotzdem: Wer
     einen alten Link mit Endung aufruft, landet ebenfalls hier. */
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    evt.respondWith(
      fetch(request)
        .then(res => {
          if (res && res.ok) {
            caches.open(CACHE).then(c => c.put(request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(request).then(cached =>
          cached || caches.match('/')
        ))
    );
    return;
  }

  /* CSS / JS / Bilder: Cache-first (sehr schnell, mit Netz-Update im Hintergrund) */
  evt.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(res => {
        if (res && res.ok) {
          caches.open(CACHE).then(c => c.put(request, res.clone()));
        }
        return res;
      });
      return cached || networkFetch;
    })
  );
});
