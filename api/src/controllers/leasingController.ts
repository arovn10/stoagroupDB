import { Request, Response, NextFunction } from 'express';
import {
  dataHash,
  canSync,
  getSyncLog,
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
  getDashboardSnapshot,
  upsertDashboardSnapshot,
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
  wipeLeasingTables,
  wipeLeasingTable,
  getLeasingTableAllNullColumns,
  addDomoAliasOverride,
  DATASET_ALIASES,
} from '../services/leasingRepository';
import { buildDashboardFromRaw, dashboardPayloadToJsonSafe } from '../services/leasingDashboardService';

/**
 * Leasing API – authoritative calculations on the backend. Frontend is visual-only.
 *
 * All heavy/authoritative calculations (status from MMR, tradeout index, unit mix,
 * velocity, occupancy, last updated, etc.) belong here. Wire data via
 * LEASING_AGGREGATION_SOURCE (Domo server-side, warehouse, or ETL). Frontend
 * calls GET /api/leasing/dashboard and renders the pre-computed payload.
 */

const AGGREGATION_SOURCE = process.env.LEASING_AGGREGATION_SOURCE || 'none';
type SyncFn = (rows: Record<string, unknown>[], replace?: boolean) => Promise<number>;
const SYNC_MAP: Record<string, SyncFn> = {
  leasing: syncLeasing,
  MMRData: syncMMRData,
  unitbyunittradeout: syncUnitByUnitTradeout,
  portfolioUnitDetails: syncPortfolioUnitDetails,
  units: syncUnits,
  unitmix: syncUnitMix,
  pricing: syncPricing,
  recentrents: syncRecentRents,
};

const DOMO_DATASET_KEYS: Record<string, string> = {
  leasing: 'DOMO_DATASET_LEASING',
  MMRData: 'DOMO_DATASET_MMR',
  unitbyunittradeout: 'DOMO_DATASET_TRADEOUT',
  portfolioUnitDetails: 'DOMO_DATASET_PUD',
  units: 'DOMO_DATASET_UNITS',
  unitmix: 'DOMO_DATASET_UNITMIX',
  pricing: 'DOMO_DATASET_PRICING',
  recentrents: 'DOMO_DATASET_RECENTRENTS',
};

function parseCsvToRows(csvText: string): Record<string, unknown>[] {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0];
  const headers = parseCsvLine(header);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => { row[h] = values[j] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

async function getDomoToken(): Promise<string> {
  const clientId = process.env.DOMO_CLIENT_ID?.trim();
  const clientSecret = process.env.DOMO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('DOMO_CLIENT_ID and DOMO_CLIENT_SECRET must be set');
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const authRes = await fetch('https://api.domo.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });
  if (!authRes.ok) throw new Error(`Domo token failed: ${authRes.status}`);
  const json = (await authRes.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Domo token response missing access_token');
  return json.access_token;
}

async function fetchDomoDatasetCsv(datasetId: string, token: string): Promise<string> {
  const url = `https://api.domo.com/v1/datasets/${datasetId}/data?includeHeader=true&format=csv`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Domo dataset ${datasetId}: ${res.status}`);
  return res.text();
}

/** Fetch only the first line (header row) of a Domo dataset CSV. Uses limit=1 to reduce payload when supported. */
async function fetchDomoDatasetCsvHeader(datasetId: string, token: string): Promise<string> {
  const url = `https://api.domo.com/v1/datasets/${datasetId}/data?includeHeader=true&format=csv&limit=1`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Domo dataset ${datasetId}: ${res.status}`);
  const text = await res.text();
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  return firstLine;
}

/** Fetch Domo dataset metadata (lightweight). Returns row count if API provides it. */
async function fetchDomoDatasetMetadata(
  datasetId: string,
  token: string
): Promise<{ rowCount: number | null }> {
  const res = await fetch(`https://api.domo.com/v1/datasets/${datasetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { rowCount: null };
  const json = (await res.json()) as Record<string, unknown>;
  const rowCount =
    typeof json.rows === 'number' ? json.rows : typeof json.rowCount === 'number' ? json.rowCount : null;
  return { rowCount };
}

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
 * Accepts Domo dataset payloads; upserts into DB (never wipes). Same shape as sync-from-domo response.
 * Body: { leasing?: [], MMRData?: [], unitbyunittradeout?: [], portfolioUnitDetails?: [], units?: [], unitmix?: [], pricing?: [], recentrents?: [] }
 */
export const postSync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = (req.body || {}) as Record<string, unknown[]>;
    const firstChunk = (req.headers['x-leasing-sync-first-chunk'] as string)?.toLowerCase() === 'true';
    const lastChunk = (req.headers['x-leasing-sync-last-chunk'] as string)?.toLowerCase() === 'true';
    const totalRowsHeader = req.headers['x-leasing-sync-total-rows'] as string;
    const dataHashHeader = req.headers['x-leasing-sync-data-hash'] as string;
    const isChunked = req.headers['x-leasing-sync-first-chunk'] !== undefined;
    const replace = false; // never wipe: always upsert so existing DB data is preserved after sync

    const synced: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ dataset: string; message: string }> = [];
    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');

    for (const [key, rows] of Object.entries(body)) {
      const alias = key === 'recents' ? 'recentrents' : key;
      if (!SYNC_MAP[alias] || !Array.isArray(rows)) continue;
      const count = rows.length;
      const hash = replace ? dataHash(rows as unknown[]) : (dataHashHeader || '');
      try {
        if (replace) {
          const allowed = await canSync(alias, hash);
          if (!allowed) {
            skipped.push(alias);
            continue;
          }
        }
        const syncFn = SYNC_MAP[alias];
        const t0 = Date.now();
        await syncFn(rows as Record<string, unknown>[], replace);
        console.log(`[leasing/sync] ${alias}: ${count} rows (replace=${replace}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        if (lastChunk && isChunked) {
          const totalCount = totalRowsHeader ? parseInt(totalRowsHeader, 10) : count;
          await upsertSyncLog(alias, now, today, dataHashHeader || hash, Number.isNaN(totalCount) ? count : totalCount);
        } else if (!isChunked) {
          await upsertSyncLog(alias, now, today, hash, count);
        }
        synced.push(alias);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ dataset: alias, message });
      }
    }

    if (synced.length > 0) rebuildDashboardSnapshot().catch(() => {});
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
 * GET /api/leasing/sync-check
 * Lightweight check: compare Domo dataset metadata (row count) to last sync. For cron: if changes=false, exit;
 * if changes=true, call POST /api/leasing/sync-from-domo. Optional: X-Sync-Secret if LEASING_SYNC_WEBHOOK_SECRET set.
 */
export const getSyncCheck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const secret = process.env.LEASING_SYNC_WEBHOOK_SECRET?.trim();
    if (secret) {
      const provided = req.headers['x-sync-secret'] as string;
      if (provided !== secret) {
        res.status(401).json({ success: false, error: 'Invalid or missing sync secret' });
        return;
      }
    }

    const token = await getDomoToken();
    const details: Array<{ dataset: string; domoRows: number | null; lastRows: number | null; hasChange: boolean }> = [];
    let hasChange = false;

    for (const [key, envKey] of Object.entries(DOMO_DATASET_KEYS)) {
      const datasetId = process.env[envKey]?.trim();
      if (!datasetId) continue;
      const alias = key === 'recents' ? 'recentrents' : key;
      const meta = await fetchDomoDatasetMetadata(datasetId, token);
      const log = await getSyncLog(alias);
      const lastRows = log?.LastRowCount ?? null;
      const domoRows = meta.rowCount;
      const changed =
        log == null
          ? true
          : domoRows != null && lastRows != null
            ? domoRows !== lastRows
            : false;
      if (changed) hasChange = true;
      details.push({ dataset: alias, domoRows, lastRows, hasChange: changed });
    }

    if (details.length === 0) {
      res.json({ changes: false, message: 'No DOMO_DATASET_* configured', details: [] });
      return;
    }

    res.json({ changes: hasChange, details });
  } catch (error) {
    next(error);
  }
};

/** Chunk size for sync-from-domo (one table at a time, in batches of this many rows). Default 5000. */
const SYNC_CHUNK_SIZE = Math.max(1, parseInt(process.env.LEASING_SYNC_CHUNK_SIZE || '5000', 10));
/** Rest (ms) between batches to avoid overloading DB/host. Default 3s. */
const SYNC_REST_MS = Math.max(0, parseInt(process.env.LEASING_SYNC_REST_MS || '3000', 10));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let syncFromDomoInProgress = false;

/**
 * POST /api/leasing/sync-from-domo
 * Fetches leasing datasets from Domo one table at a time, syncs each in batches (default 5000 rows)
 * with a short rest between batches to avoid timeouts and overload. Call from cron or Domo webhook.
 * Only one sync runs at a time; concurrent requests get 409.
 * Env: LEASING_SYNC_CHUNK_SIZE (default 5000), LEASING_SYNC_REST_MS (default 3000).
 */
export const postSyncFromDomo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (syncFromDomoInProgress) {
    res.status(409).json({ success: false, error: 'Sync already in progress' });
    return;
  }
  syncFromDomoInProgress = true;
  try {
    const secret = process.env.LEASING_SYNC_WEBHOOK_SECRET?.trim();
    if (secret) {
      const provided = (req.headers['x-sync-secret'] as string) || (req.body && typeof req.body === 'object' && (req.body as { secret?: string }).secret);
      if (provided !== secret) {
        res.status(401).json({ success: false, error: 'Invalid or missing sync secret' });
        return;
      }
    }

    const token = await getDomoToken();
    const synced: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ dataset: string; message: string }> = [];
    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const fetched: string[] = [];

    const forceSync = String(req.query.force || '').toLowerCase() === 'true';
    let entries = Object.entries(DOMO_DATASET_KEYS);
    const onlyDataset = (req.query.dataset as string)?.trim();
    if (onlyDataset) {
      const alias = onlyDataset === 'recents' ? 'recentrents' : onlyDataset;
      entries = entries.filter(([k]) => (k === 'recents' ? 'recentrents' : k) === alias);
      if (entries.length === 0) {
        res.status(400).json({ success: false, error: `Unknown dataset: ${onlyDataset}` });
        return;
      }
    }

    for (const [key, envKey] of entries) {
      const datasetId = process.env[envKey]?.trim();
      if (!datasetId) continue;

      const alias = key === 'recents' ? 'recentrents' : key;
      if (!SYNC_MAP[alias]) continue;

      let rows: Record<string, unknown>[];
      try {
        const csvText = await fetchDomoDatasetCsv(datasetId, token);
        rows = parseCsvToRows(csvText) as Record<string, unknown>[];
        fetched.push(`${alias}:${rows.length}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ dataset: alias, message });
        continue;
      }

      const count = rows.length;
      const hash = dataHash(rows as unknown[]);
      if (!forceSync) {
        try {
          const allowed = await canSync(alias, hash);
          if (!allowed) {
            skipped.push(alias);
            continue;
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          errors.push({ dataset: alias, message });
          continue;
        }
      }

      const syncFn = SYNC_MAP[alias];
      const chunks: Record<string, unknown>[][] = [];
      for (let i = 0; i < rows.length; i += SYNC_CHUNK_SIZE) {
        chunks.push(rows.slice(i, i + SYNC_CHUNK_SIZE));
      }

      try {
        const t0 = Date.now();
        for (let i = 0; i < chunks.length; i++) {
          const replace = false; // always upsert: append/merge by key, never wipe table
          const written = await syncFn(chunks[i], replace);
          const done = (i + 1) * SYNC_CHUNK_SIZE;
          console.log(`[leasing/sync] ${alias}: ${Math.min(done, count)}/${count} input → ${written} rows written (batch ${i + 1}/${chunks.length}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
          if (i < chunks.length - 1 && SYNC_REST_MS > 0) {
            await sleep(SYNC_REST_MS);
          }
        }
        await upsertSyncLog(alias, now, today, hash, count);
        synced.push(alias);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({ dataset: alias, message });
      }
    }

    if (fetched.length === 0 && errors.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No datasets configured. Set at least one DOMO_DATASET_* env var.',
        fetched: [],
        errors,
      });
      return;
    }

    if (synced.length > 0) rebuildDashboardSnapshot().catch(() => {});
    res.status(errors.length ? 207 : 200).json({
      success: errors.length === 0,
      fetched,
      synced,
      skipped,
      errors: errors.length ? errors : undefined,
      _meta: { at: now.toISOString(), chunkSize: SYNC_CHUNK_SIZE, restMs: SYNC_REST_MS, force: forceSync },
    });
  } catch (error) {
    next(error);
  } finally {
    syncFromDomoInProgress = false;
  }
};

/**
 * POST /api/leasing/wipe
 * Truncates all leasing data tables and clears SyncLog. Next sync-check will report changes and
 * sync-from-domo now upserts (never wipes). Use wipe to clear all data before a fresh sync if needed.
 * Same auth as sync-from-domo: X-Sync-Secret if LEASING_SYNC_WEBHOOK_SECRET is set.
 */
export const postWipeLeasing = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const secret = process.env.LEASING_SYNC_WEBHOOK_SECRET?.trim();
    if (secret) {
      const provided = (req.headers['x-sync-secret'] as string) || (req.body && typeof req.body === 'object' && (req.body as { secret?: string }).secret);
      if (provided !== secret) {
        res.status(401).json({ success: false, error: 'Invalid or missing sync secret' });
        return;
      }
    }
    const tableParam = (req.query.table as string)?.trim();
    if (tableParam) {
      const result = await wipeLeasingTable(tableParam);
      res.status(200).json({ success: true, ...result });
    } else {
      const result = await wipeLeasingTables();
      res.status(200).json({ success: true, ...result });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/sync-health
 * Returns for each leasing table the list of column names that are entirely NULL (sync mapping issue).
 * Used by check-and-fix-leasing-sync script.
 */
export const getSyncHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tables: Record<string, string[]> = {};
    for (const alias of DATASET_ALIASES) {
      tables[alias] = await getLeasingTableAllNullColumns(alias);
    }
    res.status(200).json({ success: true, tables });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/domo-columns
 * Returns the exact column names (CSV headers) that Domo sends for each configured dataset.
 * Use this to see why columns are NULL: if a name here isn't in our alias list for that DB column, we store NULL.
 * Compare with LEASING_COLUMNS_BY_ALIAS in the repo and add missing names via POST /api/leasing/sync-add-alias or run check-and-fix-leasing-sync.js.
 */
export const getDomoColumns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = await getDomoToken();
    const domoColumns: Record<string, string[]> = {};
    const errors: Record<string, string> = {};
    for (const [key, envKey] of Object.entries(DOMO_DATASET_KEYS)) {
      const datasetId = process.env[envKey]?.trim();
      const alias = key === 'recents' ? 'recentrents' : key;
      if (!datasetId) {
        domoColumns[alias] = [];
        continue;
      }
      try {
        const headerLine = await fetchDomoDatasetCsvHeader(datasetId, token);
        domoColumns[alias] = parseCsvLine(headerLine);
      } catch (e) {
        domoColumns[alias] = [];
        errors[alias] = e instanceof Error ? e.message : String(e);
      }
    }
    res.status(200).json({ success: true, domoColumns, errors: Object.keys(errors).length ? errors : undefined });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/leasing/sync-add-alias
 * Add a Domo CSV header as alias for a table/column (persists to domo-alias-overrides.json).
 * Body: { table: string, column: string, domoHeader: string }. Same auth as wipe.
 */
export const postSyncAddAlias = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const secret = process.env.LEASING_SYNC_WEBHOOK_SECRET?.trim();
    if (secret) {
      const provided = (req.headers['x-sync-secret'] as string) || (req.body && typeof req.body === 'object' && (req.body as { secret?: string }).secret);
      if (provided !== secret) {
        res.status(401).json({ success: false, error: 'Invalid or missing sync secret' });
        return;
      }
    }
    const { table, column, domoHeader } = req.body as { table?: string; column?: string; domoHeader?: string };
    if (!table || !column || !domoHeader || typeof domoHeader !== 'string') {
      res.status(400).json({ success: false, error: 'Body must include table, column, domoHeader (strings)' });
      return;
    }
    addDomoAliasOverride(table.trim(), column.trim(), String(domoHeader).trim());
    res.status(200).json({ success: true, table, column, added: domoHeader });
  } catch (error) {
    next(error);
  }
};

/** Rebuild and store the dashboard snapshot (called after sync and on startup; fire-and-forget). */
export async function rebuildDashboardSnapshot(): Promise<void> {
  try {
    const raw = await getAllForDashboard();
    const dashboard = await buildDashboardFromRaw(raw);
    const safe = dashboardPayloadToJsonSafe(dashboard);
    const now = new Date();
    const fullResponse = JSON.stringify({
      success: true,
      dashboard: safe,
      _meta: { source: AGGREGATION_SOURCE, fromSnapshot: true, builtAt: now.toISOString() },
    });
    await upsertDashboardSnapshot(fullResponse);
  } catch (err) {
    console.error('rebuildDashboardSnapshot failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * GET /api/leasing/dashboard
 * Single pre-computed dashboard payload. Serves from DashboardSnapshot if present (fast);
 * otherwise computes from raw tables and returns (slower). Frontend is visual-only.
 * Query: asOf (optional) YYYY-MM-DD.
 * All paths return JSON-serializable dashboard (Maps converted to plain objects) so the client gets full data.
 */
export const getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const t0 = Date.now();
    console.log('[leasing/dashboard] GET start');
    const snapshot = await getDashboardSnapshot();
    console.log('[leasing/dashboard] snapshot fetch', Date.now() - t0, 'ms', snapshot?.payload ? 'hit' : 'miss');
    if (snapshot?.payload) {
      const payload = snapshot.payload;
      if (payload.startsWith('{"success":')) {
        res.setHeader('Content-Type', 'application/json');
        res.end(payload);
      } else {
        const dashboard = JSON.parse(payload) as LeasingDashboardPayload;
        res.json({
          success: true,
          dashboard,
          _meta: { source: AGGREGATION_SOURCE, asOf, fromSnapshot: true, builtAt: snapshot.builtAt?.toISOString?.() },
        });
      }
      console.log('[leasing/dashboard] sent from snapshot', Date.now() - t0, 'ms');
      return;
    }

    console.log('[leasing/dashboard] building from raw...');
    const raw = await getAllForDashboard();
    console.log('[leasing/dashboard] raw fetch', Date.now() - t0, 'ms');
    const dashboard = await buildDashboardFromRaw(raw);
    console.log('[leasing/dashboard] build done', Date.now() - t0, 'ms');
    const safe = dashboardPayloadToJsonSafe(dashboard);
    const fullResponse = JSON.stringify({
      success: true,
      dashboard: safe,
      _meta: { source: AGGREGATION_SOURCE, asOf },
    });
    await upsertDashboardSnapshot(fullResponse);
    res.json({
      success: true,
      dashboard: safe,
      _meta: { source: AGGREGATION_SOURCE, asOf },
    });
    console.log('[leasing/dashboard] sent from raw', Date.now() - t0, 'ms');
  } catch (error) {
    console.error('[leasing/dashboard] error', error instanceof Error ? error.message : error);
    next(error);
  }
};

/**
 * POST /api/leasing/rebuild-snapshot
 * Force rebuild and store the dashboard snapshot. Next GET /dashboard will be instant.
 */
export const postRebuildSnapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await rebuildDashboardSnapshot();
    const snapshot = await getDashboardSnapshot();
    res.json({
      success: true,
      builtAt: snapshot?.builtAt?.toISOString?.() ?? new Date().toISOString(),
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
