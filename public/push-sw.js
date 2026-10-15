// Web Push handlers, imported by the Workbox service worker (vite.config.ts → workbox.importScripts)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'CalendarAsist', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'CalendarAsist';
  const tasks = [self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { url: data.url || '/' },
  })];
  if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
    tasks.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(tasks).catch(() => undefined));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        client.navigate(url).catch(() => undefined);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
