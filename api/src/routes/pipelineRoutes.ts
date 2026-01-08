import { Router } from 'express';
import * as pipelineController from '../controllers/pipelineController';

const router = Router();

// Under Contract routes
router.get('/under-contracts', pipelineController.getAllUnderContracts);
router.get('/under-contracts/:id', pipelineController.getUnderContractById);
router.post('/under-contracts', pipelineController.createUnderContract);
router.put('/under-contracts/:id', pipelineController.updateUnderContract);

// Commercial Listed routes
router.get('/commercial-listed', pipelineController.getAllCommercialListed);
router.get('/commercial-listed/:id', pipelineController.getCommercialListedById);
router.post('/commercial-listed', pipelineController.createCommercialListed);
router.put('/commercial-listed/:id', pipelineController.updateCommercialListed);

// Commercial Acreage routes
router.get('/commercial-acreage', pipelineController.getAllCommercialAcreage);
router.get('/commercial-acreage/:id', pipelineController.getCommercialAcreageById);
router.post('/commercial-acreage', pipelineController.createCommercialAcreage);
router.put('/commercial-acreage/:id', pipelineController.updateCommercialAcreage);

// Closed Property routes
router.get('/closed-properties', pipelineController.getAllClosedProperties);
router.get('/closed-properties/:id', pipelineController.getClosedPropertyById);
router.post('/closed-properties', pipelineController.createClosedProperty);
router.put('/closed-properties/:id', pipelineController.updateClosedProperty);

export default router;

