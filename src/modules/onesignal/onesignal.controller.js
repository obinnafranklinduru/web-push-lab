import {
  deleteSubscription,
  listSubscriptions,
  saveSubscription,
  sendNotification,
} from './onesignal.service.js';

export function registerSubscription(req, res, next) {
  try {
    const { label, subscriptionId, onesignalId } = req.body || {};
    const saved = saveSubscription({ label, subscriptionId, onesignalId });
    res.status(201).json({
      success: true,
      data: saved,
    });
  } catch (err) {
    next(err);
  }
}

export function getSubscriptions(_req, res) {
  const subscriptions = listSubscriptions();
  res.json({
    success: true,
    data: subscriptions,
  });
}

export function removeSubscription(req, res) {
  const deleted = deleteSubscription(req.params.id);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: { message: 'OneSignal subscription not found', status: 404 },
    });
  }

  return res.json({
    success: true,
    data: { deleted: true, id: req.params.id },
  });
}

export async function send(req, res, next) {
  try {
    const { subscriptionId, title, body, url } = req.body || {};
    const result = await sendNotification({ subscriptionId, title, body, url });
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
