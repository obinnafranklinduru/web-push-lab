importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js');

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

const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(async (payload) => {
    const data = payload.data || {};
    const attemptId = data.attemptId || null;
    const title = data.title || payload.notification?.title || 'FCM Notification';
    const body = data.body || payload.notification?.body || '';
    const url = data.url || null;

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
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (url) {
    event.waitUntil(clients.openWindow(url));
  }
});
