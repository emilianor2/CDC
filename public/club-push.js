self.addEventListener('push', event => {
  const message = event.data?.json() || {};
  event.waitUntil(self.registration.showNotification(message.title || 'Club de Fans', {
    icon: '/club-icon.png',
    body: message.body || 'Tenés una novedad.',
    data: { url: message.url },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  if (url.origin === self.location.origin) event.waitUntil(clients.openWindow(url.href));
});
