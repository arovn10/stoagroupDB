import { Router } from 'express';
import * as coreController from '../controllers/coreController';

const router = Router();

// Project routes
router.get('/projects', coreController.getAllProjects);
router.get('/projects/:id', coreController.getProjectById);
router.post('/projects', coreController.createProject);
router.put('/projects/:id', coreController.updateProject);
router.delete('/projects/:id', coreController.deleteProject);

// Bank routes
router.get('/banks', coreController.getAllBanks);
router.get('/banks/:id', coreController.getBankById);
router.post('/banks', coreController.createBank);
router.put('/banks/:id', coreController.updateBank);
router.delete('/banks/:id', coreController.deleteBank);

// Person routes
router.get('/persons', coreController.getAllPersons);
router.get('/persons/:id', coreController.getPersonById);
router.post('/persons', coreController.createPerson);
router.put('/persons/:id', coreController.updatePerson);
router.delete('/persons/:id', coreController.deletePerson);

// Equity Partner routes
router.get('/equity-partners', coreController.getAllEquityPartners);
router.get('/equity-partners/:id', coreController.getEquityPartnerById);
router.post('/equity-partners', coreController.createEquityPartner);
router.put('/equity-partners/:id', coreController.updateEquityPartner);
router.delete('/equity-partners/:id', coreController.deleteEquityPartner);

export default router;

