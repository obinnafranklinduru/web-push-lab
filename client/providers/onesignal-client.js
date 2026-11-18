let sdkLoaded = false;
let initialized = false;

function loadOneSignalScript() {
  if (sdkLoaded || window.OneSignal) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    script.onload = () => {
      sdkLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load OneSignal SDK script'));
    document.head.appendChild(script);
  });
}

export async function registerOneSignal(clientConfig, label, onLog) {
  await loadOneSignalScript();

  window.OneSignalDeferred = window.OneSignalDeferred || [];

  const subscriptionData = await new Promise((resolve, reject) => {
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        if (!initialized) {
          try {
            await OneSignal.init({
              appId: clientConfig.appId,
              allowLocalhostAsSecureOrigin: true,
            });
          } catch (initErr) {
            if (!String(initErr?.message || '').includes('already initialized')) {
              throw initErr;
            }
          }
          initialized = true;

          OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
            const notif = event.notification;
            const attemptId = notif?.additionalData?.attemptId || null;
            onLog?.(`OneSignal foreground notification: "${notif?.title}" (attemptId=${attemptId || 'n/a'})`);
            if (attemptId) {
              fetch('/api/diagnostics/client-events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId, event: 'displayed' }),
              }).catch(() => {});
            }
          });
        }

        await OneSignal.Notifications.requestPermission();
        await OneSignal.User.PushSubscription.optIn();

        const subscriptionId = OneSignal.User.PushSubscription.id;
        const onesignalId = OneSignal.User.onesignalId || null;

        if (!subscriptionId) {
          throw new Error('OneSignal PushSubscription.id is empty (user may have denied permission)');
        }

        resolve({ subscriptionId, onesignalId });
      } catch (err) {
        reject(err);
      }
    });
  });

  const res = await fetch('/api/onesignal/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label,
      subscriptionId: subscriptionData.subscriptionId,
      onesignalId: subscriptionData.onesignalId,
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message || 'Failed to save OneSignal subscription');
  }

  return json.data;
}
