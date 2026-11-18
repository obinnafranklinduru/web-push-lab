import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import db from './config/db.js';
import { getProvidersStatus } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import diagnosticsRoutes from './modules/diagnostics/diagnostics.routes.js';
import webpushRoutes from './modules/webpush/webpush.routes.js';
import fcmRoutes from './modules/fcm/fcm.routes.js';
import onesignalRoutes from './modules/onesignal/onesignal.routes.js';

const app = express();

app.use(express.json());

// Serve static browser client if directory exists (Milestone 6)
const clientDir = path.resolve('client');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
}

app.get('/api/health', (_req, res) => {
  const row = db.prepare('SELECT 1 AS ok').get();
  res.json({
    success: true,
    data: {
      status: 'ok',
      database: row?.ok === 1 ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    },
  });
});

app.get('/api/providers', (_req, res) => {
  res.json({
    success: true,
    data: getProvidersStatus(),
  });
});

app.use('/api/diagnostics', diagnosticsRoutes);
app.use('/api/webpush', webpushRoutes);
app.use('/api/fcm', fcmRoutes);
app.use('/api/onesignal', onesignalRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({
    success: false,
    error: { message: 'API route not found', status: 404 },
  });
});

app.use(errorHandler);

export default app;
