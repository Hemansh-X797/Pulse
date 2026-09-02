// Minimal service worker. Its main job isn't offline support (this is a
// realtime app — most routes need a live connection anyway) — it's that
// Chrome/Edge/Android's install criteria require an *active* service
// worker with a fetch handler before they'll fire `beforeinstallprompt`
// at all. Without this file, "Download PalSpace" had nothing to hook
// into; the manifest alone isn't enough on Chromium browsers.
//
// What it does do usefully: caches the app shell (the static JS/CSS
// PalSpace itself ships) so a repeat visit or an installed-app launch
// paints faster, and serves that shell if the network request for a
// navigation fails outright (e.g. genuinely offline) rather than
// showing the browser's own offline error page.

const CACHE_NAME = 'palspace-shell-v1';
const SHELL_URLS = ['/', '/home', '/manifest.webmanifest', '/logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only handle same-origin GETs — never intercept Supabase API/realtime
  // calls, auth redirects, or cross-origin requests. This is deliberately
  // conservative: a chat app silently serving stale cached data for an
  // API call would be worse than no service worker at all.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((res) => res || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && (request.url.endsWith('.js') || request.url.endsWith('.css') || request.url.match(/\.(png|svg|jpg|jpeg|woff2?)$/))) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
