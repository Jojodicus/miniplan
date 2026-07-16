// Minimaler Service Worker nur zur PWA-Installierbarkeit (Android/Chrome verlangen einen
// registrierten Worker mit fetch-Handler) - bewusst ohne Caching-Strategie: die App ändert sich
// häufig, ein Cache würde nur das Risiko veralteter Stände einführen, ohne dass ein Offline-Modus
// für dieses interne Tool tatsächlich gebraucht wird.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Keine Reaktion - Anfragen laufen unverändert übers Netzwerk.
})
