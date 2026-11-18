import {
  getAttemptById,
  listAttempts,
  recordClientEvent,
} from './diagnostics.service.js';

export function getAttempts(req, res) {
  const { provider, limit } = req.query;
  const attempts = listAttempts({
    provider: provider || null,
    limit,
  });

  res.json({
    success: true,
    data: attempts,
  });
}

export function getAttempt(req, res) {
  const attempt = getAttemptById(req.params.attemptId);
  if (!attempt) {
    return res.status(404).json({
      success: false,
      error: { message: 'Notification attempt not found', status: 404 },
    });
  }

  return res.json({
    success: true,
    data: attempt,
  });
}

export function postClientEvent(req, res, next) {
  try {
    const { attemptId, event, error } = req.body || {};
    const updated = recordClientEvent({ attemptId, event, error });
    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}
