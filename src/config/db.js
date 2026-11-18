import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env } from './env.js';

const dbPath = path.resolve(env.sqliteDbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS webpush_subscriptions (
    id TEXT PRIMARY KEY,
    label TEXT,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    expiration_time INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    last_error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fcm_subscriptions (
    id TEXT PRIMARY KEY,
    label TEXT,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    last_error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS onesignal_subscriptions (
    id TEXT PRIMARY KEY,
    label TEXT,
    subscription_id TEXT NOT NULL UNIQUE,
    onesignal_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notification_attempts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    subscription_ref_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    provider_accepted INTEGER NOT NULL DEFAULT 0,
    http_status INTEGER,
    provider_message_id TEXT,
    error_message TEXT,
    response_metadata TEXT,
    duration_ms INTEGER,
    browser_status TEXT NOT NULL DEFAULT 'pending',
    browser_received_at TEXT,
    browser_displayed_at TEXT,
    browser_error TEXT,
    created_at TEXT NOT NULL
  );
`);

export default db;
