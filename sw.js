'use strict';

// Only LifeOS shell assets are cached. Other pages, API calls and uploads pass through.
const CACHE = 'lifeos-shell-v12';
const ASSETS = [
  './theme.js', './theme-splash.js', './theme-splash.css',
  './assets/miku_victory.png', './assets/teto_victory.png',
  './assets/miku_splash_screen.png', './assets/teto_splash_screen.png',
  './teto-tools.js', './vocadb.html', './pokemon.html', './data-streams.js', './cyberdex.js', './streams-ui.js', './data-streams.css', './companion-bubbles.js', './assets/tetokage.webp', './diagnostics.js', './holograms.js', './breach-model.js', './arcade.js', './cyber-modules.css', './noscript.css', './theme.css', './pages.css', './style.css', './responsive.css', './chrome.js', './chat.html', './chat.js', './neural.js',
  './assets/vendor/marked.umd.js', './assets/vendor/purify.min.js', './assets/vendor/highlight.min.js',
  './lifeos-shell.html', './lifeos-shell.js', './global-bootstrap.js', './global-ui.js', './global-ui.css', './terminal.js', './lifeos-core.js',
  './scanner.html', './scanner.css', './scanner.js', './scanner-model.js', './assets/scanner/earth-land.json',
  './lifeos.html', './lifeos.css', './lifeos.js', './site.js', './manifest.json', './favicon.svg',
  './assets/mikukage.webp', './assets/mikukage.png', './assets/wallpaper.webp', './assets/wallpaper-2.webp',
  './assets/sprites/sprite_lifestyle.png', './assets/sprites/sprite_lore.png',
  './assets/sprites/sprite_finance.png', './assets/sprites/sprite_teto.png', './assets/sprites/sprite_imam.png'
];
const allowed = new Set(ASSETS.map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
    ASSETS.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' }))
  )).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('lifeos-shell-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !allowed.has(url.pathname)) return;
  // Strip version/backend query parameters only for our explicit static allowlist.
  const key = new Request(url.origin + url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    const network = fetch(event.request).then(async response => {
      if (response.ok) await cache.put(key, response.clone());
      return response;
    });
    if (!cached) return network;
    // Keep the cache fresh online; a slow or unavailable network must not block the app.
    event.waitUntil(network.catch(() => undefined));
    return Promise.race([
      network.then(response => response.ok ? response : cached).catch(() => cached),
      new Promise(resolve => setTimeout(() => resolve(cached), 2000))
    ]);
  })());
});
