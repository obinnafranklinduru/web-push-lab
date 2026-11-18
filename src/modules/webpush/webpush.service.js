import crypto from 'node:crypto';
import webpush from 'web-push';
import db from '../../config/db.js';
import { env, getProvidersStatus } from '../../config/env.js';
import { recordAttempt } from '../diagnostics/diagnostics.service.js';

let vapidConfigured = false;

function ensureVapidConfigured() {
  const status = getProvidersStatus().webpush;
  if (!status.configured) {
    const err = new Error(`Web Push is not configured. Missing: ${status.missing.join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(
      env.webpush.subject,
      env.webpush.publicKey,
      env.webpush.privateKey,
    );
    vapidConfigured = true;
  }
}

export function saveSubscription({ label = null, subscription }) {
  const endpoint = subscription?.endpoint?.trim();
  const p256dh = subscription?.keys?.p256dh?.trim();
  const auth = subscription?.keys?.auth?.trim();
  const expirationTime = subscription?.expirationTime ?? null;

  if (!endpoint || !p256dh || !auth) {
    const err = new Error('subscription.endpoint, subscription.keys.p256dh, and subscription.keys.auth are required');
    err.status = 400;
    throw err;
  }

  const existing = db
    .prepare('SELECT id FROM webpush_subscriptions WHERE endpoint = ?')
    .get(endpoint);

  if (existing) {
    db.prepare(`
      UPDATE webpush_subscriptions
      SET label = COALESCE(?, label),
          p256dh = ?,
          auth = ?,
          expiration_time = ?,
          status = 'active',
          last_error = NULL
      WHERE id = ?
    `).run(label, p256dh, auth, expirationTime, existing.id);

    return formatSubscription(
      db.prepare('SELECT * FROM webpush_subscriptions WHERE id = ?').get(existing.id),
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO webpush_subscriptions (
      id, label, endpoint, p256dh, auth, expiration_time, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(id, label, endpoint, p256dh, auth, expirationTime, now);

  return formatSubscription(
    db.prepare('SELECT * FROM webpush_subscriptions WHERE id = ?').get(id),
  );
}

export function listSubscriptions() {
  const rows = db
    .prepare('SELECT * FROM webpush_subscriptions ORDER BY created_at DESC')
    .all();

  return rows.map(formatSubscription);
}

export function deleteSubscription(id) {
  const result = db
    .prepare('DELETE FROM webpush_subscriptions WHERE id = ?')
    .run(id);

  return result.changes > 0;
}

export async function sendNotification({ subscriptionId, title, body, url = null }) {
  ensureVapidConfigured();

  if (!subscriptionId || !title || !body) {
    const err = new Error('subscriptionId, title, and body are required');
    err.status = 400;
    throw err;
  }

  const sub = db
    .prepare('SELECT * FROM webpush_subscriptions WHERE id = ?')
    .get(subscriptionId);

  if (!sub) {
    const err = new Error(`Web Push subscription not found: ${subscriptionId}`);
    err.status = 404;
    throw err;
  }

  const attemptId = crypto.randomUUID();
  const payload = JSON.stringify({
    attemptId,
    title,
    body,
    url,
  });

  const pushSubscription = {
    endpoint: sub.endpoint,
    expirationTime: sub.expiration_time,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  const start = performance.now();

  try {
    const response = await webpush.sendNotification(pushSubscription, payload);
    const durationMs = Math.round(performance.now() - start);

    const attempt = recordAttempt({
      id: attemptId,
      provider: 'web-push',
      subscriptionRefId: sub.id,
      title,
      body,
      url,
      providerAccepted: true,
      httpStatus: response.statusCode || 201,
      responseMetadata: {
        headers: response.headers || null,
      },
      durationMs,
    });

    return {
      attempt,
      subscriptionStatus: sub.status,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const httpStatus = err.statusCode || null;
    const errorMessage = err.message || 'Web Push send failed';

    let nextStatus = sub.status;
    if (httpStatus === 404 || httpStatus === 410) {
      nextStatus = 'expired';
    } else if (httpStatus === 400) {
      nextStatus = 'invalid';
    }

    db.prepare(`
      UPDATE webpush_subscriptions
      SET status = ?, last_error = ?
      WHERE id = ?
    `).run(nextStatus, errorMessage, sub.id);

    const attempt = recordAttempt({
      id: attemptId,
      provider: 'web-push',
      subscriptionRefId: sub.id,
      title,
      body,
      url,
      providerAccepted: false,
      httpStatus,
      errorMessage,
      responseMetadata: {
        body: err.body || null,
        headers: err.headers || null,
      },
      durationMs,
    });

    return {
      attempt,
      subscriptionStatus: nextStatus,
    };
  }
}

function formatSubscription(row) {
  const endpointPreview = row.endpoint.length > 48
    ? `${row.endpoint.slice(0, 32)}...${row.endpoint.slice(-12)}`
    : row.endpoint;

  return {
    id: row.id,
    label: row.label,
    endpointPreview,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}
