import { Router } from 'express';
import {
  getSubscriptions,
  registerSubscription,
  removeSubscription,
  send,
} from './onesignal.controller.js';

const router = Router();

router.post('/subscriptions', registerSubscription);
router.get('/subscriptions', getSubscriptions);
router.delete('/subscriptions/:id', removeSubscription);
router.post('/send', send);

export default router;
