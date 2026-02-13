import { Router } from 'express';
import * as leasingController from '../controllers/leasingController';

const router = Router();

// Check if pre-aggregated leasing data is available (app uses this to decide aggregation vs raw pull)
router.get('/aggregates/available', leasingController.getAggregatesAvailable);

// Pre-aggregated metrics (leasing summary, tradeout summary, PUD summary) – supports million-row scaling
router.get('/aggregates', leasingController.getAggregates);

// Single dashboard payload: all calculations done on backend; frontend is visual-only.
router.get('/dashboard', leasingController.getDashboard);
// Diagnostic: raw DB counts and built dashboard row/kpi counts (no snapshot stored).
router.get('/dashboard-diag', leasingController.getDashboardDiag);
// Debug: compare backend vs frontend occupancy for Millerville (same PUD).
router.get('/debug/compare-millerville', leasingController.getCompareMillerville);
// Force rebuild and store dashboard snapshot (so next GET /dashboard is instant).
router.post('/rebuild-snapshot', leasingController.postRebuildSnapshot);

// KPI endpoints: portfolio and by-property (optional ?property=&asOf=). Precalculated in snapshot when available.
router.get('/kpis', leasingController.getKpis);
router.get('/kpis/occupancy', leasingController.getKpisOccupancy);
router.get('/kpis/occupancy-and-budget', leasingController.getKpisOccupancyAndBudget);
router.get('/kpis/leased', leasingController.getKpisLeased);
router.get('/kpis/available', leasingController.getKpisAvailable);
router.get('/kpis/velocity', leasingController.getKpisVelocity);
router.get('/kpis/delta-budget', leasingController.getKpisDeltaBudget);
router.get('/kpis/avg-leased-rent', leasingController.getKpisAvgLeasedRent);

// Sync: accept Domo dataset payloads; store once per day per dataset, or when data hash changes.
router.post('/sync', leasingController.postSync);

// Sync check: lightweight compare Domo metadata to last sync. For cron: if changes=false exit; else call sync-from-domo.
router.get('/sync-check', leasingController.getSyncCheck);
// Sync health: which columns are all-null per table (for check-and-fix-leasing-sync script).
router.get('/sync-health', leasingController.getSyncHealth);
// Domo column names: exact CSV headers Domo sends per dataset (to fix NULL column mapping).
router.get('/domo-columns', leasingController.getDomoColumns);
// Add a Domo CSV header as alias for a table/column (for check-and-fix-leasing-sync script).
router.post('/sync-add-alias', leasingController.postSyncAddAlias);
// Sync from Domo: backend fetches datasets from Domo API and syncs. For cron use ?async=true to get 202 and run sync in background (avoids 502). Query: ?dataset=alias, ?force=true. Optional X-Sync-Secret.
router.post('/sync-from-domo', leasingController.postSyncFromDomo);
// Wipe: truncate all leasing tables and SyncLog. Query: ?table=alias to wipe only that table. Same auth as sync-from-domo.
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
