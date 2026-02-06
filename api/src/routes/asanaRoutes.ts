import { Router } from 'express';
import * as asanaController from '../controllers/asanaController';

const router = Router();

/** Ping to verify Asana routes are deployed (e.g. GET /api/asana). */
router.get('/', (_req, res) => res.json({ ok: true, message: 'Asana API' }));
router.get('/upcoming-tasks', asanaController.getUpcomingTasks);

export default router;
