import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const trim = (value) => (typeof value === 'string' ? value.trim() : '');

export const env = {
  port: Number(process.env.PORT) || 3000,
  sqliteDbPath: trim(process.env.SQLITE_DB_PATH) || './database/web-push-lab.sqlite',

  webpush: {
    subject: trim(process.env.VAPID_SUBJECT),
    publicKey: trim(process.env.VAPID_PUBLIC_KEY),
    privateKey: trim(process.env.VAPID_PRIVATE_KEY),
  },

  fcm: {
    serviceAccountPath: trim(process.env.FIREBASE_SERVICE_ACCOUNT_PATH),
    apiKey: trim(process.env.FIREBASE_API_KEY),
    authDomain: trim(process.env.FIREBASE_AUTH_DOMAIN),
    projectId: trim(process.env.FIREBASE_PROJECT_ID),
    messagingSenderId: trim(process.env.FIREBASE_MESSAGING_SENDER_ID),
    appId: trim(process.env.FIREBASE_APP_ID),
    vapidKey: trim(process.env.FIREBASE_VAPID_KEY),
  },

  onesignal: {
    appId: trim(process.env.ONESIGNAL_APP_ID),
    restApiKey: trim(process.env.ONESIGNAL_REST_API_KEY),
  },
};

/**
 * Evaluates readiness of each provider without exposing private credentials.
 */
export function getProvidersStatus() {
  // Web Push check
  const webpushMissing = [];
  if (!env.webpush.subject) webpushMissing.push('VAPID_SUBJECT');
  if (!env.webpush.publicKey) webpushMissing.push('VAPID_PUBLIC_KEY');
  if (!env.webpush.privateKey) webpushMissing.push('VAPID_PRIVATE_KEY');

  // FCM check
  const fcmMissing = [];
  if (!env.fcm.serviceAccountPath) {
    fcmMissing.push('FIREBASE_SERVICE_ACCOUNT_PATH');
  } else if (!fs.existsSync(path.resolve(env.fcm.serviceAccountPath))) {
    fcmMissing.push('FIREBASE_SERVICE_ACCOUNT_PATH (file not found)');
  }
  if (!env.fcm.apiKey) fcmMissing.push('FIREBASE_API_KEY');
  if (!env.fcm.authDomain) fcmMissing.push('FIREBASE_AUTH_DOMAIN');
  if (!env.fcm.projectId) fcmMissing.push('FIREBASE_PROJECT_ID');
  if (!env.fcm.messagingSenderId) fcmMissing.push('FIREBASE_MESSAGING_SENDER_ID');
  if (!env.fcm.appId) fcmMissing.push('FIREBASE_APP_ID');
  if (!env.fcm.vapidKey) fcmMissing.push('FIREBASE_VAPID_KEY');

  // OneSignal check
  const onesignalMissing = [];
  if (!env.onesignal.appId) onesignalMissing.push('ONESIGNAL_APP_ID');
  if (!env.onesignal.restApiKey) onesignalMissing.push('ONESIGNAL_REST_API_KEY');

  return {
    webpush: {
      name: 'web-push',
      configured: webpushMissing.length === 0,
      missing: webpushMissing,
      clientConfig: webpushMissing.length === 0
        ? { publicKey: env.webpush.publicKey }
        : null,
    },
    fcm: {
      name: 'firebase-admin',
      configured: fcmMissing.length === 0,
      missing: fcmMissing,
      clientConfig: fcmMissing.length === 0
        ? {
            apiKey: env.fcm.apiKey,
            authDomain: env.fcm.authDomain,
            projectId: env.fcm.projectId,
            messagingSenderId: env.fcm.messagingSenderId,
            appId: env.fcm.appId,
            vapidKey: env.fcm.vapidKey,
          }
        : null,
    },
    onesignal: {
      name: '@onesignal/node-onesignal',
      configured: onesignalMissing.length === 0,
      missing: onesignalMissing,
      clientConfig: onesignalMissing.length === 0
        ? { appId: env.onesignal.appId }
        : null,
    },
  };
}
