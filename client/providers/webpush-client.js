function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerWebPush(clientConfig, label) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(`Notification permission is "${permission}"`);
  }

  const registration = await navigator.serviceWorker.register('/sw/webpush/webpush-sw.js', {
    scope: '/sw/webpush/',
  });

  if (registration.installing) {
    await new Promise((resolve) => {
      registration.installing.addEventListener('statechange', (e) => {
        if (e.target.state === 'activated') resolve();
      });
    });
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(clientConfig.publicKey),
    });
  }

  const res = await fetch('/api/webpush/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, subscription: subscription.toJSON() }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message || 'Failed to save Web Push subscription');
  }

  return json.data;
}
