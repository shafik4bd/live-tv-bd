// Service Worker - IPTV Player
// This is a minimal service worker to prevent 404 errors.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Pass through all requests to the network
  return;
});
