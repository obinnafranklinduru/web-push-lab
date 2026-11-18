import crypto from 'node:crypto';
import * as OneSignal from '@onesignal/node-onesignal';
import db from '../../config/db.js';
import { env, getProvidersStatus } from '../../config/env.js';
import { recordAttempt } from '../diagnostics/diagnostics.service.js';

function getOneSignalClient() {
  const status = getProvidersStatus().onesignal;
  if (!status.configured) {
    const err = new Error(`OneSignal is not configured. Missing: ${status.missing.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const configuration = OneSignal.createConfiguration({
    appKey: env.onesignal.restApiKey,
  });

  return new OneSignal.DefaultApi(configuration);
}

export function saveSubscription({ label = null, subscriptionId, onesignalId = null }) {
  const trimmedSubId = typeof subscriptionId === 'string' ? subscriptionId.trim() : '';
  if (!trimmedSubId) {
    const err = new Error('subscriptionId is required');
    err.status = 400;
    throw err;
  }

  const existing = db
    .prepare('SELECT id FROM onesignal_subscriptions WHERE subscription_id = ?')
    .get(trimmedSubId);

  if (existing) {
    db.prepare(`
      UPDATE onesignal_subscriptions
      SET label = COALESCE(?, label),
          onesignal_id = COALESCE(?, onesignal_id),
          status = 'active',
          last_error = NULL
      WHERE id = ?
    `).run(label, onesignalId, existing.id);

    return formatSubscription(
      db.prepare('SELECT * FROM onesignal_subscriptions WHERE id = ?').get(existing.id),
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO onesignal_subscriptions (
      id, label, subscription_id, onesignal_id, status, created_at
    ) VALUES (?, ?, ?, ?, 'active', ?)
  `).run(id, label, trimmedSubId, onesignalId, now);

  return formatSubscription(
    db.prepare('SELECT * FROM onesignal_subscriptions WHERE id = ?').get(id),
  );
}

export function listSubscriptions() {
  const rows = db
    .prepare('SELECT * FROM onesignal_subscriptions ORDER BY created_at DESC')
    .all();

  return rows.map(formatSubscription);
}

export function deleteSubscription(id) {
  const result = db
    .prepare('DELETE FROM onesignal_subscriptions WHERE id = ?')
    .run(id);

  return result.changes > 0;
}

export async function sendNotification({ subscriptionId, title, body, url = null }) {
  const client = getOneSignalClient();

  if (!subscriptionId || !title || !body) {
    const err = new Error('subscriptionId, title, and body are required');
    err.status = 400;
    throw err;
  }

  const sub = db
    .prepare('SELECT * FROM onesignal_subscriptions WHERE id = ?')
    .get(subscriptionId);

  if (!sub) {
    const err = new Error(`OneSignal subscription not found: ${subscriptionId}`);
    err.status = 404;
    throw err;
  }

  const attemptId = crypto.randomUUID();

  const notification = new OneSignal.Notification();
  notification.app_id = env.onesignal.appId;
  notification.target_channel = 'push';
  notification.include_player_ids = [sub.subscription_id];
  notification.headings = { en: String(title) };
  notification.contents = { en: String(body) };
  notification.data = { attemptId };
  if (url) {
    notification.url = String(url);
  }

  const start = performance.now();

  try {
    const response = await client.createNotification(notification);
    const durationMs = Math.round(performance.now() - start);

    // OneSignal can return HTTP 200 OK even when delivery failed (silent failure).
    const errors = response?.errors || null;
    const hasErrors = Boolean(
      errors && (
        (Array.isArray(errors) && errors.length > 0) ||
        (typeof errors === 'object' && !Array.isArray(errors) && Object.keys(errors).length > 0)
      ),
    );
    const recipients = response?.recipients ?? null;
    const accepted = Boolean(response?.id) && (recipients === null || recipients > 0) && !hasErrors;

    let errorMessage = null;
    let nextStatus = sub.status;

    if (!accepted) {
      errorMessage = hasErrors
        ? JSON.stringify(errors)
        : 'OneSignal returned 200 OK with 0 recipients (silent failure)';

      if (errors?.invalid_player_ids?.length > 0) {
        nextStatus = 'invalid';
      } else if (errorMessage.toLowerCase().includes('not subscribed')) {
        nextStatus = 'expired';
      }

      db.prepare(`
        UPDATE onesignal_subscriptions
        SET status = ?, last_error = ?
        WHERE id = ?
      `).run(nextStatus, errorMessage, sub.id);
    }

    const attempt = recordAttempt({
      id: attemptId,
      provider: 'onesignal',
      subscriptionRefId: sub.id,
      title,
      body,
      url,
      providerAccepted: accepted,
      httpStatus: 200,
      providerMessageId: response?.id || null,
      errorMessage,
      responseMetadata: {
        id: response?.id || null,
        recipients,
        errors,
      },
      durationMs,
    });

    return {
      attempt,
      subscriptionStatus: nextStatus,
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const httpStatus = err.code || err.statusCode || null;
    const errorMessage = err.body
      ? (typeof err.body === 'string' ? err.body : JSON.stringify(err.body))
      : (err.message || 'OneSignal send failed');

    db.prepare(`
      UPDATE onesignal_subscriptions
      SET last_error = ?
      WHERE id = ?
    `).run(errorMessage, sub.id);

    const attempt = recordAttempt({
      id: attemptId,
      provider: 'onesignal',
      subscriptionRefId: sub.id,
      title,
      body,
      url,
      providerAccepted: false,
      httpStatus,
      errorMessage,
      responseMetadata: {
        code: err.code || null,
        body: err.body || null,
      },
      durationMs,
    });

    return {
      attempt,
      subscriptionStatus: sub.status,
    };
  }
}

function formatSubscription(row) {
  const subId = row.subscription_id;
  const subscriptionIdPreview = subId.length > 20
    ? `${subId.slice(0, 8)}...${subId.slice(-8)}`
    : subId;

  return {
    id: row.id,
    label: row.label,
    subscriptionIdPreview,
    onesignalId: row.onesignal_id,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}
