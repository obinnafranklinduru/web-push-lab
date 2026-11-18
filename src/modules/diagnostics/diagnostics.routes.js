import { Router } from 'express';
import {
  getAttempt,
  getAttempts,
  postClientEvent,
} from './diagnostics.controller.js';

const router = Router();

router.get('/attempts', getAttempts);
router.get('/attempts/:attemptId', getAttempt);
router.post('/client-events', postClientEvent);

export default router;
