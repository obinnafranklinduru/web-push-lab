import crypto from 'node:crypto';
import db from '../../config/db.js';

const VALID_CLIENT_EVENTS = new Set(['received', 'displayed', 'display_failed']);

/**
 * Records a notification send attempt (provider acceptance or failure).
 */
export function recordAttempt({
  id = crypto.randomUUID(),
  provider,
  subscriptionRefId,
  title,
  body,
  url = null,
  providerAccepted = false,
  httpStatus = null,
  providerMessageId = null,
  errorMessage = null,
  responseMetadata = null,
  durationMs = null,
}) {
  const now = new Date().toISOString();
  const metadataJson = responseMetadata ? JSON.stringify(responseMetadata) : null;

  db.prepare(`
    INSERT INTO notification_attempts (
      id, provider, subscription_ref_id, title, body, url,
      provider_accepted, http_status, provider_message_id,
      error_message, response_metadata, duration_ms,
      browser_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    id,
    provider,
    subscriptionRefId,
    title,
    body,
    url,
    providerAccepted ? 1 : 0,
    httpStatus,
    providerMessageId,
    errorMessage,
    metadataJson,
    durationMs,
    now,
  );

  return getAttemptById(id);
}

/**
 * Lists recent notification attempts, optionally filtered by provider.
 */
export function listAttempts({ provider = null, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const rows = provider
    ? db
        .prepare('SELECT * FROM notification_attempts WHERE provider = ? ORDER BY created_at DESC LIMIT ?')
        .all(provider, safeLimit)
    : db
        .prepare('SELECT * FROM notification_attempts ORDER BY created_at DESC LIMIT ?')
        .all(safeLimit);

  return rows.map(formatAttemptRow);
}

/**
 * Fetches a single attempt by its attemptId.
 */
export function getAttemptById(attemptId) {
  const row = db
    .prepare('SELECT * FROM notification_attempts WHERE id = ?')
    .get(attemptId);

  return row ? formatAttemptRow(row) : null;
}

/**
 * Updates browser-side receipt or display status for an attempt.
 */
export function recordClientEvent({ attemptId, event, error = null }) {
  if (!attemptId || !VALID_CLIENT_EVENTS.has(event)) {
    const err = new Error('attemptId and valid event (received | displayed | display_failed) are required');
    err.status = 400;
    throw err;
  }

  const existing = getAttemptById(attemptId);
  if (!existing) {
    const err = new Error(`Attempt not found: ${attemptId}`);
    err.status = 404;
    throw err;
  }

  const now = new Date().toISOString();

  if (event === 'received') {
    const nextStatus = existing.browserStatus === 'pending' ? 'received' : existing.browserStatus;
    db.prepare(`
      UPDATE notification_attempts
      SET browser_status = ?, browser_received_at = COALESCE(browser_received_at, ?)
      WHERE id = ?
    `).run(nextStatus, now, attemptId);
  } else if (event === 'displayed') {
    db.prepare(`
      UPDATE notification_attempts
      SET browser_status = 'displayed',
          browser_received_at = COALESCE(browser_received_at, ?),
          browser_displayed_at = ?
      WHERE id = ?
    `).run(now, now, attemptId);
  } else if (event === 'display_failed') {
    db.prepare(`
      UPDATE notification_attempts
      SET browser_status = 'display_failed',
          browser_received_at = COALESCE(browser_received_at, ?),
          browser_error = ?
      WHERE id = ?
    `).run(now, error || 'Browser failed to display notification', attemptId);
  }

  return getAttemptById(attemptId);
}

function formatAttemptRow(row) {
  let metadata = null;
  if (row.response_metadata) {
    try {
      metadata = JSON.parse(row.response_metadata);
    } catch {
      metadata = row.response_metadata;
    }
  }

  return {
    id: row.id,
    provider: row.provider,
    subscriptionRefId: row.subscription_ref_id,
    title: row.title,
    body: row.body,
    url: row.url,
    providerAccepted: row.provider_accepted === 1,
    httpStatus: row.http_status,
    providerMessageId: row.provider_message_id,
    errorMessage: row.error_message,
    responseMetadata: metadata,
    durationMs: row.duration_ms,
    browserStatus: row.browser_status,
    browserReceivedAt: row.browser_received_at,
    browserDisplayedAt: row.browser_displayed_at,
    browserError: row.browser_error,
    createdAt: row.created_at,
  };
}
