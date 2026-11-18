import { registerWebPush } from '/providers/webpush-client.js';
import { registerFcm } from '/providers/fcm-client.js';
import { registerOneSignal } from '/providers/onesignal-client.js';

const providerSelect = document.getElementById('provider-select');
const subLabelInput = document.getElementById('sub-label');
const registerBtn = document.getElementById('register-btn');
const subscriptionsList = document.getElementById('subscriptions-list');
const sendForm = document.getElementById('send-form');
const notifTitle = document.getElementById('notif-title');
const notifBody = document.getElementById('notif-body');
const notifUrl = document.getElementById('notif-url');
const selectedSubInfo = document.getElementById('selected-sub-info');
const apiResponseEl = document.getElementById('api-response');
const browserLogEl = document.getElementById('browser-log');
const attemptsBody = document.getElementById('attempts-body');
const refreshAttemptsBtn = document.getElementById('refresh-attempts-btn');
const browserCapsEl = document.getElementById('browser-caps');
const providerStatusEl = document.getElementById('provider-status');

let providersState = {};
let selectedSubscriptionId = null;

function appendLog(message) {
  const time = new Date().toLocaleTimeString();
  const current = browserLogEl.textContent === 'Waiting for events...' ? '' : `${browserLogEl.textContent}\n`;
  browserLogEl.textContent = `${current}[${time}] ${message}`;
  browserLogEl.scrollTop = browserLogEl.scrollHeight;
}

function renderBrowserCaps() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const sw = 'serviceWorker' in navigator ? 'supported' : 'unsupported';
  const push = 'PushManager' in window ? 'supported' : 'unsupported';

  browserCapsEl.innerHTML = `
    <span class="badge ${perm === 'granted' ? 'ok' : 'warn'}">Permission: ${perm}</span>
    <span class="badge ${sw === 'supported' ? 'ok' : 'err'}">ServiceWorker: ${sw}</span>
    <span class="badge ${push === 'supported' ? 'ok' : 'err'}">PushManager: ${push}</span>
  `;
}

async function loadProviders() {
  const res = await fetch('/api/providers');
  const json = await res.json();
  providersState = json.data || {};

  providerStatusEl.innerHTML = Object.entries(providersState)
    .map(([key, info]) => {
      const cls = info.configured ? 'ok' : 'err';
      const label = info.configured ? `${key}: READY` : `${key}: MISSING (${info.missing.join(', ')})`;
      return `<span class="badge ${cls}">${label}</span>`;
    })
    .join('');
}

async function loadSubscriptions() {
  const provider = providerSelect.value;
  selectedSubscriptionId = null;
  selectedSubInfo.textContent = 'No subscription selected';

  const res = await fetch(`/api/${provider}/subscriptions`);
  const json = await res.json();
  const items = json.data || [];

  if (items.length === 0) {
    subscriptionsList.innerHTML = '<p class="muted">No subscriptions registered for this provider yet.</p>';
    return;
  }

  subscriptionsList.innerHTML = '';
  items.forEach((sub, idx) => {
    const preview = sub.endpointPreview || sub.tokenPreview || sub.subscriptionIdPreview || sub.id;
    const div = document.createElement('div');
    div.className = 'sub-item';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'selected-sub';
    radio.value = sub.id;
    if (idx === 0) {
      radio.checked = true;
      selectedSubscriptionId = sub.id;
      selectedSubInfo.textContent = `Selected: ${sub.label || preview}`;
    }
    radio.addEventListener('change', () => {
      selectedSubscriptionId = sub.id;
      selectedSubInfo.textContent = `Selected: ${sub.label || preview}`;
    });

    const text = document.createElement('span');
    text.textContent = `${sub.label ? `${sub.label} — ` : ''}${preview}`;

    const badge = document.createElement('span');
    badge.className = `badge ${sub.status === 'active' ? 'ok' : 'err'}`;
    badge.textContent = sub.status;

    const label = document.createElement('label');
    label.append(radio, text, badge);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      await fetch(`/api/${provider}/subscriptions/${sub.id}`, { method: 'DELETE' });
      await loadSubscriptions();
    });

    div.append(label, delBtn);
    subscriptionsList.appendChild(div);
  });
}

async function loadAttempts() {
  const res = await fetch('/api/diagnostics/attempts?limit=20');
  const json = await res.json();
  const attempts = json.data || [];

  attemptsBody.innerHTML = attempts
    .map((a) => `
      <tr>
        <td>${new Date(a.createdAt).toLocaleTimeString()}</td>
        <td><code>${a.provider}</code></td>
        <td><span class="badge ${a.providerAccepted ? 'ok' : 'err'}">${a.providerAccepted ? 'accepted' : 'rejected'}</span></td>
        <td>${a.httpStatus ?? '-'}</td>
        <td>${a.durationMs != null ? `${a.durationMs} ms` : '-'}</td>
        <td><span class="badge ${a.browserStatus === 'displayed' ? 'ok' : a.browserStatus === 'display_failed' ? 'err' : 'warn'}">${a.browserStatus}</span></td>
        <td>${a.errorMessage || a.browserError || '-'}</td>
      </tr>
    `)
    .join('');
}

registerBtn.addEventListener('click', async () => {
  const provider = providerSelect.value;
  const info = providersState[provider];
  const label = subLabelInput.value.trim() || null;

  if (!info?.configured) {
    appendLog(`Cannot register ${provider}: missing ${info?.missing?.join(', ')}`);
    return;
  }

  registerBtn.disabled = true;
  try {
    appendLog(`Registering browser for ${provider}...`);
    let saved;
    if (provider === 'webpush') {
      saved = await registerWebPush(info.clientConfig, label);
    } else if (provider === 'fcm') {
      saved = await registerFcm(info.clientConfig, label, appendLog);
    } else if (provider === 'onesignal') {
      saved = await registerOneSignal(info.clientConfig, label, appendLog);
    }
    appendLog(`Registered ${provider} subscription (${saved.id})`);
    renderBrowserCaps();
    await loadSubscriptions();
  } catch (err) {
    appendLog(`Registration error (${provider}): ${err.message}`);
  } finally {
    registerBtn.disabled = false;
  }
});

sendForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const provider = providerSelect.value;

  if (!selectedSubscriptionId) {
    appendLog('Select or register a subscription first.');
    return;
  }

  const res = await fetch(`/api/${provider}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscriptionId: selectedSubscriptionId,
      title: notifTitle.value.trim(),
      body: notifBody.value.trim(),
      url: notifUrl.value.trim() || null,
    }),
  });

  const json = await res.json();
  apiResponseEl.textContent = JSON.stringify(json, null, 2);
  await loadAttempts();
  await loadSubscriptions();
});

providerSelect.addEventListener('change', loadSubscriptions);
refreshAttemptsBtn.addEventListener('click', loadAttempts);

// Listen for Service Worker receipt/display broadcasts
const swChannel = new BroadcastChannel('web-push-lab');
swChannel.addEventListener('message', (event) => {
  const { attemptId, event: evtName, error } = event.data || {};
  appendLog(`SW event [${evtName}] for attempt ${attemptId}${error ? ` — error: ${error}` : ''}`);
  loadAttempts();
});

renderBrowserCaps();
await loadProviders();
await loadSubscriptions();
await loadAttempts();
