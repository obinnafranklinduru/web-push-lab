import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging.js';

let foregroundListenerAttached = false;

export async function registerFcm(clientConfig, label, onLog) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(`Notification permission is "${permission}"`);
  }

  const app = getApps().length === 0
    ? initializeApp({
        apiKey: clientConfig.apiKey,
        authDomain: clientConfig.authDomain,
        projectId: clientConfig.projectId,
        messagingSenderId: clientConfig.messagingSenderId,
        appId: clientConfig.appId,
      })
    : getApps()[0];

  const messaging = getMessaging(app);

  const swParams = new URLSearchParams({
    apiKey: clientConfig.apiKey,
    authDomain: clientConfig.authDomain,
    projectId: clientConfig.projectId,
    messagingSenderId: clientConfig.messagingSenderId,
    appId: clientConfig.appId,
  });

  const registration = await navigator.serviceWorker.register(
    `/sw/fcm/firebase-messaging-sw.js?${swParams.toString()}`,
    { scope: '/sw/fcm/' },
  );

  if (registration.installing) {
    await new Promise((resolve) => {
      registration.installing.addEventListener('statechange', (e) => {
        if (e.target.state === 'activated') resolve();
      });
    });
  }

  if (!foregroundListenerAttached) {
    foregroundListenerAttached = true;
    onMessage(messaging, async (payload) => {
      const data = payload.data || {};
      const attemptId = data.attemptId || null;
      const title = data.title || payload.notification?.title || 'FCM Foreground';
      const body = data.body || payload.notification?.body || '';

      onLog?.(`FCM foreground message received (attemptId=${attemptId || 'n/a'})`);

      if (attemptId) {
        await fetch('/api/diagnostics/client-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attemptId, event: 'received' }),
        }).catch(() => {});
      }

      try {
        await registration.showNotification(title, {
          body,
          data: { attemptId, url: data.url || null },
        });
        if (attemptId) {
          await fetch('/api/diagnostics/client-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attemptId, event: 'displayed' }),
          }).catch(() => {});
        }
      } catch (err) {
        onLog?.(`FCM display failed: ${err.message}`);
        if (attemptId) {
          await fetch('/api/diagnostics/client-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attemptId, event: 'display_failed', error: err.message }),
          }).catch(() => {});
        }
      }
    });
  }

  const token = await getToken(messaging, {
    vapidKey: clientConfig.vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error('Firebase getToken() returned an empty token');
  }

  const res = await fetch('/api/fcm/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, token }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message || 'Failed to save FCM token');
  }

  return json.data;
}
