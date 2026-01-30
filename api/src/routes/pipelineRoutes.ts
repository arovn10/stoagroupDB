import { Router } from 'express';
import * as pipelineController from '../controllers/pipelineController';
import { dealPipelineAttachmentUpload } from '../middleware/uploadMiddleware';

const router = Router();

// Under Contract routes (Land Development)
router.get('/under-contracts', pipelineController.getAllUnderContracts);
router.get('/under-contracts/project/:projectId', pipelineController.getUnderContractByProjectId); // Get by ProjectId (must come before /:id)
router.get('/under-contracts/:id', pipelineController.getUnderContractById);
router.post('/under-contracts', pipelineController.createUnderContract);
router.put('/under-contracts/:id', pipelineController.updateUnderContract);
router.delete('/under-contracts/:id', pipelineController.deleteUnderContract);

// Commercial Listed routes (Land Development)
router.get('/commercial-listed', pipelineController.getAllCommercialListed);
router.get('/commercial-listed/project/:projectId', pipelineController.getCommercialListedByProjectId); // Get by ProjectId (must come before /:id)
router.get('/commercial-listed/:id', pipelineController.getCommercialListedById);
router.post('/commercial-listed', pipelineController.createCommercialListed);
router.put('/commercial-listed/:id', pipelineController.updateCommercialListed);
router.delete('/commercial-listed/:id', pipelineController.deleteCommercialListed);

// Commercial Acreage routes (Land Development - Land We Own)
router.get('/commercial-acreage', pipelineController.getAllCommercialAcreage);
router.get('/commercial-acreage/project/:projectId', pipelineController.getCommercialAcreageByProjectId); // Get by ProjectId (must come before /:id)
router.get('/commercial-acreage/:id', pipelineController.getCommercialAcreageById);
router.post('/commercial-acreage', pipelineController.createCommercialAcreage);
router.put('/commercial-acreage/:id', pipelineController.updateCommercialAcreage);
router.delete('/commercial-acreage/:id', pipelineController.deleteCommercialAcreage);

// Closed Property routes
router.get('/closed-properties', pipelineController.getAllClosedProperties);
router.get('/closed-properties/:id', pipelineController.getClosedPropertyById);
router.post('/closed-properties', pipelineController.createClosedProperty);
router.put('/closed-properties/:id', pipelineController.updateClosedProperty);
router.delete('/closed-properties/:id', pipelineController.deleteClosedProperty);

// Deal Pipeline routes (Land Development Deal Tracker)
router.get('/deal-pipeline', pipelineController.getAllDealPipelines);
router.get('/deal-pipeline/project/:projectId', pipelineController.getDealPipelineByProjectId); // Get by ProjectId (must come before /:id)
// Attachments (more specific paths first)
router.get('/deal-pipeline/attachments/:attachmentId/download', pipelineController.downloadDealPipelineAttachment);
router.put('/deal-pipeline/attachments/:attachmentId', pipelineController.updateDealPipelineAttachment);
router.delete('/deal-pipeline/attachments/:attachmentId', pipelineController.deleteDealPipelineAttachment);
router.get('/deal-pipeline/:id/attachments', pipelineController.listDealPipelineAttachments);
router.post('/deal-pipeline/:id/attachments', dealPipelineAttachmentUpload.single('file'), pipelineController.uploadDealPipelineAttachment);
router.get('/deal-pipeline/:id', pipelineController.getDealPipelineById);
router.post('/deal-pipeline', pipelineController.createDealPipeline);
router.put('/deal-pipeline/:id', pipelineController.updateDealPipeline);
router.delete('/deal-pipeline/:id', pipelineController.deleteDealPipeline);

export default router;

