const channel = new BroadcastChannel('web-push-lab');

function reportClientEvent(attemptId, event, error = null) {
  if (!attemptId) return Promise.resolve();
  channel.postMessage({ attemptId, event, error, timestamp: new Date().toISOString() });

  return fetch('/api/diagnostics/client-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attemptId, event, error }),
  }).catch(() => {});
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Web Push', body: event.data ? event.data.text() : '' };
  }

  const { attemptId, title = 'Notification', body = '', url = null } = payload;

  event.waitUntil((async () => {
    await reportClientEvent(attemptId, 'received');
    try {
      await self.registration.showNotification(title, {
        body,
        data: { attemptId, url },
      });
      await reportClientEvent(attemptId, 'displayed');
    } catch (err) {
      await reportClientEvent(attemptId, 'display_failed', err.message || String(err));
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (url) {
    event.waitUntil(clients.openWindow(url));
  }
});
