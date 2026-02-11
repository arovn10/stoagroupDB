import { Router } from 'express';
import * as leasingController from '../controllers/leasingController';

const router = Router();

// Check if pre-aggregated leasing data is available (app uses this to decide aggregation vs raw pull)
router.get('/aggregates/available', leasingController.getAggregatesAvailable);

// Pre-aggregated metrics (leasing summary, tradeout summary, PUD summary) – supports million-row scaling
router.get('/aggregates', leasingController.getAggregates);

// Single dashboard payload: all calculations done on backend; frontend is visual-only.
router.get('/dashboard', leasingController.getDashboard);

// Sync: accept Domo dataset payloads; store once per day per dataset, or when data hash changes.
router.post('/sync', leasingController.postSync);

// Sync check: lightweight compare Domo metadata to last sync. For cron: if changes=false exit; else call sync-from-domo.
router.get('/sync-check', leasingController.getSyncCheck);
// Sync from Domo: backend fetches datasets from Domo API and syncs. For Domo alerts or cron. Optional header X-Sync-Secret.
router.post('/sync-from-domo', leasingController.postSyncFromDomo);
// Wipe: truncate all leasing tables and SyncLog so next sync does full replace. Same auth as sync-from-domo.
router.post('/wipe', leasingController.postWipeLeasing);

// CRUD: list all rows for a dataset
router.get('/datasets/:dataset', leasingController.listDataset);
// Get one row by id
router.get('/datasets/:dataset/:id', leasingController.getDatasetById);
// Create/update/delete only for leasing table (pattern for others)
router.post('/datasets/leasing', leasingController.createLeasingRow);
router.put('/datasets/leasing/:id', leasingController.updateLeasingRow);
router.delete('/datasets/leasing/:id', leasingController.deleteLeasingRow);

export default router;
