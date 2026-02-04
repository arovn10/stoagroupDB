import { Router } from 'express';
import * as landDevelopmentController from '../controllers/landDevelopmentController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Land Development Contacts – list/get/create/update/delete are public (or add authenticate if you want)
router.get('/contacts', landDevelopmentController.getAllLandDevelopmentContacts);
router.get('/contacts/:id', landDevelopmentController.getLandDevelopmentContactById);
router.post('/contacts', authenticate, landDevelopmentController.createLandDevelopmentContact);
router.put('/contacts/:id', authenticate, landDevelopmentController.updateLandDevelopmentContact);
router.delete('/contacts/:id', authenticate, landDevelopmentController.deleteLandDevelopmentContact);
// Send reminder email – requires auth
router.post('/contacts/send-reminder', authenticate, landDevelopmentController.sendLandDevelopmentReminder);

export default router;
