self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Synthetic probe test', {
      body: 'This is a synthetic notification test.',
      tag: 'synthetic-probe-test',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = clients[0];
      if (client) await client.focus();
      else await self.clients.openWindow('/');
    })(),
  );
});
