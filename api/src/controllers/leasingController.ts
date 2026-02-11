import { Request, Response, NextFunction } from 'express';
import {
  dataHash,
  canSync,
  upsertSyncLog,
  syncLeasing,
  syncMMRData,
  syncUnitByUnitTradeout,
  syncPortfolioUnitDetails,
  syncUnits,
  syncUnitMix,
  syncPricing,
  syncRecentRents,
  getAllForDashboard,
  getAllLeasing,
  getAllMMRData,
  getAllUnitByUnitTradeout,
  getAllPortfolioUnitDetails,
  getAllUnits,
  getAllUnitMix,
  getAllPricing,
  getAllRecentRents,
  getLeasingById,
  getMMRDataById,
  getUnitByUnitTradeoutById,
  getPortfolioUnitDetailsById,
  getUnitsById,
  getUnitMixById,
  getPricingById,
  getRecentRentsById,
  createLeasing,
  updateLeasing,
  deleteLeasing,
} from '../services/leasingRepository';
import { buildDashboardFromRaw } from '../services/leasingDashboardService';

/**
 * Leasing API – authoritative calculations on the backend. Frontend is visual-only.
 *
 * All heavy/authoritative calculations (status from MMR, tradeout index, unit mix,
 * velocity, occupancy, last updated, etc.) belong here. Wire data via
 * LEASING_AGGREGATION_SOURCE (Domo server-side, warehouse, or ETL). Frontend
 * calls GET /api/leasing/dashboard and renders the pre-computed payload.
 */

const AGGREGATION_SOURCE = process.env.LEASING_AGGREGATION_SOURCE || 'none';
const SYNC_MAP: Record<string, (rows: Record<string, unknown>[]) => Promise<number>> = {
  leasing: syncLeasing,
  MMRData: syncMMRData,
  unitbyunittradeout: syncUnitByUnitTradeout,
  portfolioUnitDetails: syncPortfolioUnitDetails,
  units: syncUnits,
  unitmix: syncUnitMix,
  pricing: syncPricing,
  recentrents: syncRecentRents,
};

/** Dashboard payload: pre-computed state so frontend does no heavy calculation. Maps are JSON-serialized as plain objects. */
export interface LeasingDashboardPayload {
  rows?: Array<Record<string, unknown>>;
  leasing?: Array<Record<string, unknown>>;
  unitmixStruct?: Record<string, unknown>;
  unitmixRows?: Array<Record<string, unknown>>;
  recentsByPlan?: Record<string, unknown>;
  pricingByPlan?: Record<string, unknown>;
  pricingTS?: Record<string, unknown>;
  unitRows?: Array<Record<string, unknown>>;
  unitsIndex?: Record<string, unknown>;
  utradeIndex?: Record<string, unknown>;
  leasingTS?: Record<string, unknown>;
  diagnostics?: string[];
  mmrRows?: Array<Record<string, unknown>>;
  recRowsAll?: Array<Record<string, unknown>>;
  pricingRowsAll?: Array<Record<string, unknown>>;
  month?: string | null;
  utradeRows?: Array<Record<string, unknown>>;
  lastUpdated?: Record<string, string | null> | null;
  portfolioUnitDetails?: Array<Record<string, unknown>>;
  tradeoutLeaseTypeLookup?: Record<string, string>;
  statusByProperty?: Record<string, string>;
  mmrOcc?: Record<string, number>;
  mmrUnits?: Record<string, number>;
}

/**
 * GET /api/leasing/aggregates/available
 * Returns whether pre-aggregated leasing data is available from this API.
 */
export const getAggregatesAvailable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const available = AGGREGATION_SOURCE !== 'none';
    res.json({ success: true, available, source: AGGREGATION_SOURCE });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/aggregates
 * Returns pre-aggregated leasing metrics to support million-row datasets
 * without loading raw PUD/leasing/tradeout in the client.
 *
 * Query: asOf (optional) YYYY-MM-DD for point-in-time metrics.
 *
 * Response shape (all optional; app uses what’s present):
 * - leasingSummary: Array<{ property, units, leasesNeeded, 7DayLeasingVelocity, 28DayLeasingVelocity, monthOf? }>
 * - tradeoutSummary: Array<{ property, reportDate, month, newLeases, renewalLeases, tradeoutPct?, tradeoutAmt? }> or by-property structure
 * - pudSummary: { lastBatchRun?, byProperty: { [property]: { lastReportDate, unitCount } } }
 *
 * When source is 'none', returns 200 with empty data so the app can fall back to Domo.
 */
export const getAggregates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;

    if (AGGREGATION_SOURCE === 'none') {
      res.json({
        success: true,
        data: {
          leasingSummary: [],
          tradeoutSummary: [],
          pudSummary: null,
        },
        _meta: {
          source: 'none',
          message: 'Leasing aggregation not configured. Wire LEASING_AGGREGATION_SOURCE and implement aggregation in leasingController.',
        },
      });
      return;
    }

    // TODO: Implement when data source is wired (e.g. query Domo API server-side, or read from warehouse).
    // Example: const leasingSummary = await fetchLeasingSummaryFromDomo(asOf);
    // Return same shape as above with real data.
    res.json({
      success: true,
      data: {
        leasingSummary: [],
        tradeoutSummary: [],
        pudSummary: null,
      },
      _meta: { source: AGGREGATION_SOURCE, asOf },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/leasing/sync
 * Accepts Domo dataset payloads; stores in DB once per day per dataset, or when data hash changes.
 * Body: { leasing?: [], MMRData?: [], unitbyunittradeout?: [], portfolioUnitDetails?: [], units?: [], unitmix?: [], pricing?: [], recentrents?: [] }
 */
export const postSync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = (req.body || {}) as Record<string, unknown[]>;
    const synced: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ dataset: string; message: string }> = [];
    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');

    for (const [key, rows] of Object.entries(body)) {
      const alias = key === 'recents' ? 'recentrents' : key;
      if (!SYNC_MAP[alias] || !Array.isArray(rows)) continue;
      const count = rows.length;
      const hash = dataHash(rows as unknown[]);
      try {
        const allowed = await canSync(alias, hash);
        if (!allowed) {
          skipped.push(alias);
          continue;
        }
        const syncFn = SYNC_MAP[alias];
        await syncFn(rows as Record<string, unknown>[]);
        await upsertSyncLog(alias, now, today, hash, count);
        synced.push(alias);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ dataset: alias, message });
      }
    }

    res.status(errors.length ? 207 : 200).json({
      success: errors.length === 0,
      synced,
      skipped,
      errors: errors.length ? errors : undefined,
      _meta: { at: now.toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/dashboard
 * Single pre-computed dashboard payload. All authoritative calculations run on the backend;
 * frontend only renders this data (visual-only, light UI math only).
 * Query: asOf (optional) YYYY-MM-DD.
 * When source is 'none', returns success with dashboard: null so frontend falls back to Domo + client-side calc.
 */
export const getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;

    if (AGGREGATION_SOURCE === 'none') {
      res.json({
        success: true,
        dashboard: null,
        _meta: { source: 'none', message: 'Set LEASING_AGGREGATION_SOURCE and implement dashboard calculation in leasingController.' },
      });
      return;
    }

    const raw = await getAllForDashboard();
    const dashboard = await buildDashboardFromRaw(raw);
    res.json({
      success: true,
      dashboard,
      _meta: { source: AGGREGATION_SOURCE, asOf },
    });
  } catch (error) {
    next(error);
  }
};

// ---------- CRUD: list datasets ----------
const LIST_HANDLERS: Record<string, () => Promise<Record<string, unknown>[]>> = {
  leasing: getAllLeasing,
  mmrdata: getAllMMRData,
  unitbyunittradeout: getAllUnitByUnitTradeout,
  portfoliounitdetails: getAllPortfolioUnitDetails,
  units: getAllUnits,
  unitmix: getAllUnitMix,
  pricing: getAllPricing,
  recentrents: getAllRecentRents,
};

const GET_BY_ID_HANDLERS: Record<string, (id: number) => Promise<Record<string, unknown> | null>> = {
  leasing: getLeasingById,
  mmrdata: getMMRDataById,
  unitbyunittradeout: getUnitByUnitTradeoutById,
  portfoliounitdetails: getPortfolioUnitDetailsById,
  units: getUnitsById,
  unitmix: getUnitMixById,
  pricing: getPricingById,
  recentrents: getRecentRentsById,
};

function normalizeDatasetParam(p: string): string {
  const s = (p || '').trim().toLowerCase();
  if (s === 'mmrdata') return 'mmrdata';
  if (s === 'portfoliounitdetails') return 'portfoliounitdetails';
  return s;
}

export const listDataset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const key = normalizeDatasetParam(req.params.dataset || '');
    const handler = LIST_HANDLERS[key];
    if (!handler) {
      res.status(404).json({ success: false, error: { message: `Unknown dataset: ${req.params.dataset}` } });
      return;
    }
    const data = await handler();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const getDatasetById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const key = normalizeDatasetParam(req.params.dataset || '');
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const handler = GET_BY_ID_HANDLERS[key];
    if (!handler) {
      res.status(404).json({ success: false, error: { message: `Unknown dataset: ${req.params.dataset}` } });
      return;
    }
    const row = await handler(id);
    if (!row) {
      res.status(404).json({ success: false, error: { message: 'Not found' } });
      return;
    }
    res.json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
};

export const createLeasingRow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const { id } = await createLeasing(body);
    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    next(error);
  }
};

export const updateLeasingRow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const updated = await updateLeasing(id, body);
    if (!updated) {
      res.status(404).json({ success: false, error: { message: 'Not found' } });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const deleteLeasingRow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ success: false, error: { message: 'Invalid id' } });
      return;
    }
    const deleted = await deleteLeasing(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: { message: 'Not found' } });
      return;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
