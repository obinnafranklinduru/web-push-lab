import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import db from '../../config/db.js';
import { env } from '../../config/env.js';
import { recordAttempt } from '../diagnostics/diagnostics.service.js';

function ensureFirebaseConfigured() {
  if (!env.fcm.serviceAccountPath) {
    const err = new Error('Firebase is not configured. Missing: FIREBASE_SERVICE_ACCOUNT_PATH');
    err.status = 400;
    throw err;
  }

  const resolvedPath = path.resolve(env.fcm.serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    const err = new Error(`Firebase service account file not found at: ${env.fcm.serviceAccountPath}`);
    err.status = 400;
    throw err;
  }

  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
}

export function saveSubscription({ label = null, token }) {
  const trimmedToken = typeof token === 'string' ? token.trim() : '';
  if (!trimmedToken) {
    const err = new Error('token is required');
    err.status = 400;
    throw err;
  }

  const existing = db
    .prepare('SELECT id FROM fcm_subscriptions WHERE token = ?')
    .get(trimmedToken);

  if (existing) {
    db.prepare(`
      UPDATE fcm_subscriptions
      SET label = COALESCE(?, label),
          status = 'active',
          last_error = NULL
      WHERE id = ?
    `).run(label, existing.id);

    return formatSubscription(
      db.prepare('SELECT * FROM fcm_subscriptions WHERE id = ?').get(existing.id),
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO fcm_subscriptions (id, label, token, status, created_at)
    VALUES (?, ?, ?, 'active', ?)
  `).run(id, label, trimmedToken, now);

  return formatSubscription(
    db.prepare('SELECT * FROM fcm_subscriptions WHERE id = ?').get(id),
  );
}

export function listSubscriptions() {
  const rows = db
    .prepare('SELECT * FROM fcm_subscriptions ORDER BY created_at DESC')
    .all();

  return rows.map(formatSubscription);
}

export function deleteSubscription(id) {
  const result = db
    .prepare('DELETE FROM fcm_subscriptions WHERE id = ?')
    .run(id);

  return result.changes > 0;
}

export async function sendNotification({ subscriptionId, title, body, url = null }) {
  ensureFirebaseConfigured();

  if (!subscriptionId || !title || !body) {
    const err = new Error('subscriptionId, title, and body are required');
    err.status = 400;
    throw err;
  }

  const sub = db
    .prepare('SELECT * FROM fcm_subscriptions WHERE id = ?')
    .get(subscriptionId);

  if (!sub) {
    const err = new Error(`FCM subscription not found: ${subscriptionId}`);
    err.status = 404;
    throw err;
  }

  const attemptId = crypto.randomUUID();
  const message = {
    token: sub.token,
    // Send data-only payload so the Service Worker controls showNotification()
    // and can report received / displayed / display_failed telemetry.
    data: {
      attemptId,
      title: String(title),
      body: String(body),
      url: url ? String(url) : '',
    },
    ...(url ? { webpush: { fcmOptions: { link: String(url) } } } : {}),
  };

  const start = performance.now();

  try {
    const messageId = await getMessaging().send(message);
    const durationMs = Math.round(performance.now() - start);

    const attempt = recordAttempt({
      id: attemptId,
      provider: 'fcm',
      subscriptionRefId: sub.id,
      title,
      body,
      url,
      providerAccepted: true,
      httpStatus: 200,
      providerMessageId: messageId,
      responseMetadata: { messageId },
      durationMs,
    });

    return {
      attempt,
      subscriptionStatus: sub.status,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const errorCode = err.code || null;
    const errorMessage = err.message || 'FCM send failed';

    let nextStatus = sub.status;
    if (errorCode === 'messaging/registration-token-not-registered') {
      nextStatus = 'expired';
    } else if (
      errorCode === 'messaging/invalid-argument' ||
      errorCode === 'messaging/invalid-registration-token'
    ) {
      nextStatus = 'invalid';
    }

    const storedError = errorCode ? `${errorCode}: ${errorMessage}` : errorMessage;
    db.prepare(`
      UPDATE fcm_subscriptions
      SET status = ?, last_error = ?
      WHERE id = ?
    `).run(nextStatus, storedError, sub.id);

    const attempt = recordAttempt({
      id: attemptId,
      provider: 'fcm',
      subscriptionRefId: sub.id,
      title,
      body,
      url,
      providerAccepted: false,
      httpStatus: null,
      errorMessage: storedError,
      responseMetadata: { code: errorCode },
      durationMs,
    });

    return {
      attempt,
      subscriptionStatus: nextStatus,
    };
  }
}

function formatSubscription(row) {
  const tokenPreview = row.token.length > 24
    ? `${row.token.slice(0, 12)}...${row.token.slice(-8)}`
    : row.token;

  return {
    id: row.id,
    label: row.label,
    tokenPreview,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}
