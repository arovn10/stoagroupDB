import { Router } from 'express';
import * as asanaController from '../controllers/asanaController';

const router = Router();

router.get('/upcoming-tasks', asanaController.getUpcomingTasks);

export default router;
