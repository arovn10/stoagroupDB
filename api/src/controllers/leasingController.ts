import { Request, Response, NextFunction } from 'express';
import {
  dataHash,
  canSync,
  getSyncLog,
  getLeasingTableRowCount,
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
import { buildDashboardFromRaw, dashboardPayloadToJsonSafe, ensureDashboardRowsFromKpis, getMmrBudgetByProperty } from '../services/leasingDashboardService';
import { buildKpis, getOccupancyCompareForProperty, type PortfolioKpis } from '../services/leasingKpiService';
import { getConnection } from '../config/database';

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

/** Only one snapshot rebuild at a time to avoid DB overload. */
let rebuildInProgress: Promise<void> | null = null;

/** Debounce: schedule one rebuild after sync; rapid syncs only trigger one rebuild. */
const REBUILD_DEBOUNCE_MS = 5000;
let rebuildDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Normalize property/project name for matching (trim, remove *, uppercase). */
function normPropName(s: string | null | undefined): string {
  return (s ?? '').toString().trim().replace(/\*/g, '').toUpperCase();
}

/**
 * Fetch status by property from core.Project. Matches by ProjectName (normalized).
 * Uses Stage as status when Status column is not present. Returns map normalizedName -> LEASE-UP | STABILIZED | etc.
 */
async function getStatusByPropertyFromCoreProjects(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT ProjectName, COALESCE(Status, Stage) AS Status
      FROM core.Project
      WHERE ProjectName IS NOT NULL
    `);
    for (const row of result.recordset || []) {
      const r = row as { ProjectName?: string; Status?: string };
      const name = r.ProjectName;
      const status = r.Status;
      if (name != null && status != null && String(status).trim() !== '') {
        const key = normPropName(name);
        if (key) out[key] = String(status).trim().toUpperCase();
      }
    }
  } catch {
    try {
      const pool = await getConnection();
      const result = await pool.request().query(`
        SELECT ProjectName, Stage AS Status
        FROM core.Project
        WHERE ProjectName IS NOT NULL
      `);
      for (const row of result.recordset || []) {
        const r = row as { ProjectName?: string; Status?: string };
        const name = r.ProjectName;
        const status = r.Status;
        if (name != null && status != null && String(status).trim() !== '') {
          const key = normPropName(name);
          if (key) out[key] = String(status).trim().toUpperCase();
        }
      }
    } catch {
      // core.Project missing or no Status/Stage column
    }
  }
  return out;
}

/**
 * All ProjectNames from core.Project where Stage is Lease-Up or Stabilized (for hub property list).
 */
async function getLeaseUpStabilizedProjectNames(): Promise<string[]> {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT ProjectName
      FROM core.Project
      WHERE ProjectName IS NOT NULL
        AND LTRIM(RTRIM(ISNULL(Stage, N''))) IN (N'Lease-Up', N'Stabilized')
      ORDER BY ProjectName
    `);
    const names: string[] = [];
    for (const row of result.recordset || []) {
      const r = row as { ProjectName?: string };
      const name = r.ProjectName != null ? String(r.ProjectName).trim() : '';
      if (name) names.push(name);
    }
    return names;
  } catch {
    return [];
  }
}

/** Strip BOM so Domo headers like "\uFEFFReport Date" match our expected "Report Date". */
function normalizeCsvHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim();
}

function parseCsvToRows(csvText: string): Record<string, unknown>[] {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0];
  const headers = parseCsvLine(header).map(normalizeCsvHeader);
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
  mmrBudgetedOcc?: Record<string, number>;
  mmrBudgetedOccPct?: Record<string, number>;
  /** Precomputed portfolio and by-property KPIs (occupancy, leased, available, velocity, delta to budget). */
  kpis?: Record<string, unknown>;
  /** Portfolio occupancy breakdown: { property, totalUnits, occupied, occupancyPct }[] for overview. */
  portfolioOccupancyBreakdown?: Array<{ property: string; totalUnits: number; occupied: number; occupancyPct: number | null }>;
  /** Portfolio leased breakdown: { property, totalUnits, leased }[]. */
  portfolioLeasedBreakdown?: Array<{ property: string; totalUnits: number; leased: number }>;
  /** Available units breakdown: { property, totalUnits, available }[]. */
  portfolioAvailableBreakdown?: Array<{ property: string; totalUnits: number; available: number }>;
  /** 4- and 7-week occupancy projections (move-ins, move-outs, net change, projection date). */
  projections4And7Weeks?: Record<string, unknown>;
  /** All property names from core.Project where Stage is Lease-Up or Stabilized (for hub dropdown). */
  hubPropertyNames?: string[];
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

    const emptyFromClient: string[] = [];
    for (const [key, rows] of Object.entries(body)) {
      const alias = key === 'recents' ? 'recentrents' : key;
      if (!SYNC_MAP[alias] || !Array.isArray(rows)) continue;
      const count = rows.length;
      // Skip applying when client sent 0 rows so we don't update SyncLog with 0 (preserves existing DB data).
      if (count === 0) {
        emptyFromClient.push(alias);
        continue;
      }
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
    if (emptyFromClient.length > 0) {
      console.log(`[leasing/sync] Client sent 0 rows for: ${emptyFromClient.join(', ')}. Use POST /api/leasing/sync-from-domo with DOMO_DATASET_* env vars set on the server to populate these.`);
    }

    // Schedule one debounced rebuild after sync to avoid overload from rapid syncs.
    scheduleRebuildAfterSync();
    res.status(errors.length ? 207 : 200).json({
      success: errors.length === 0,
      synced,
      skipped,
      emptyFromClient: emptyFromClient.length ? emptyFromClient : undefined,
      errors: errors.length ? errors : undefined,
      _meta: { at: now.toISOString() },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/sync-check
 * Lightweight check: compare Domo dataset row count to current database row count. For cron: if changes=false, exit;
 * if changes=true, call POST /api/leasing/sync-from-domo (which only adds/updates rows that exist in Domo, never deletes).
 * Optional: X-Sync-Secret if LEASING_SYNC_WEBHOOK_SECRET set.
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
    const details: Array<{ dataset: string; domoRows: number | null; dbRows: number; lastRows: number | null; hasChange: boolean }> = [];
    let hasChange = false;

    for (const [key, envKey] of Object.entries(DOMO_DATASET_KEYS)) {
      const datasetId = process.env[envKey]?.trim();
      if (!datasetId) continue;
      const alias = key === 'recents' ? 'recentrents' : key;
      const meta = await fetchDomoDatasetMetadata(datasetId, token);
      const domoRows = meta.rowCount ?? null;
      const dbRows = await getLeasingTableRowCount(alias);
      const log = await getSyncLog(alias);
      const lastRows = log?.LastRowCount ?? null;
      // Difference in Domo vs DB length → need to sync (sync only adds/updates, never wipes).
      const changed =
        domoRows != null && domoRows !== dbRows;
      if (changed) hasChange = true;
      details.push({ dataset: alias, domoRows, dbRows, lastRows, hasChange: changed });
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

/** Internal: run sync loop and return response. Used for both sync and async modes. */
async function runSyncFromDomoCore(query: Record<string, unknown>): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const token = await getDomoToken();
  const synced: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ dataset: string; message: string }> = [];
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const fetched: string[] = [];

  const forceSync = String(query.force || '').toLowerCase() === 'true';
  let entries = Object.entries(DOMO_DATASET_KEYS);
  const onlyDataset = (query.dataset as string)?.trim();
  const skippedNoEnv: string[] = [];
  if (onlyDataset) {
    const alias = onlyDataset === 'recents' ? 'recentrents' : onlyDataset;
    const matchKey = (k: string) => (k === 'recents' ? 'recentrents' : k).toLowerCase() === (alias as string).toLowerCase();
    entries = entries.filter(([k]) => matchKey(k));
    if (entries.length === 0) {
      return { statusCode: 400, body: { success: false, error: `Unknown dataset: ${onlyDataset}` } };
    }
  }

  for (const [key, envKey] of entries) {
    const datasetId = process.env[envKey]?.trim();
    if (!datasetId) {
      skippedNoEnv.push(key);
      console.warn(`[leasing/sync-from-domo] ${key}: skipped (missing env ${envKey}). Set ${envKey} on the server to sync this dataset.`);
      continue;
    }

    const alias = key === 'recents' ? 'recentrents' : key;
    if (!SYNC_MAP[alias]) continue;

    let rows: Record<string, unknown>[];
    try {
      const csvText = await fetchDomoDatasetCsv(datasetId, token);
      rows = parseCsvToRows(csvText) as Record<string, unknown>[];
      fetched.push(`${alias}:${rows.length}`);
      if (rows.length === 0) {
        console.warn(`[leasing/sync-from-domo] ${alias}: Domo API returned 0 rows for dataset ${envKey}=${datasetId}. Check dataset ID and that the dataset has data in Domo.`);
      }
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
        const replace = false;
        const written = await syncFn(chunks[i], replace);
        const done = (i + 1) * SYNC_CHUNK_SIZE;
        console.log(`[leasing/sync] ${alias}: ${Math.min(done, count)}/${count} input → ${written} rows written (batch ${i + 1}/${chunks.length}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        if (i < chunks.length - 1 && SYNC_REST_MS > 0) {
          await sleep(SYNC_REST_MS);
        }
      }
      await upsertSyncLog(alias, now, today, hash, count);
      synced.push(alias);
      // After MMR sync, log all-NULL columns so daily runs can confirm DB matches Domo
      if (alias === 'MMRData') {
        try {
          const nullCols = await getLeasingTableAllNullColumns('MMRData');
          if (nullCols.length > 0) {
            console.warn('[leasing/sync] MMRData: after sync, columns still all-NULL:', nullCols.length, nullCols.slice(0, 25).join(', ') + (nullCols.length > 25 ? '...' : ''));
          } else {
            console.log('[leasing/sync] MMRData: all columns mapped (no all-NULL columns).');
          }
        } catch (e) {
          console.warn('[leasing/sync] MMRData: could not check null columns:', e instanceof Error ? e.message : e);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ dataset: alias, message });
    }
  }

  if (fetched.length === 0 && errors.length === 0) {
    return {
      statusCode: 400,
      body: { success: false, error: 'No datasets configured. Set at least one DOMO_DATASET_* env var.', fetched: [], errors },
    };
  }

  scheduleRebuildAfterSync();
  return {
    statusCode: errors.length ? 207 : 200,
    body: {
      success: errors.length === 0,
      fetched,
      synced,
      skipped,
      skippedNoEnv: skippedNoEnv.length ? skippedNoEnv : undefined,
      errors: errors.length ? errors : undefined,
      _meta: { at: now.toISOString(), chunkSize: SYNC_CHUNK_SIZE, restMs: SYNC_REST_MS, force: forceSync },
    },
  };
}

/**
 * POST /api/leasing/sync-from-domo
 * Fetches leasing datasets from Domo one table at a time, syncs each in batches (default 5000 rows).
 * Only one sync runs at a time; concurrent requests get 409.
 * Query: ?async=true — return 202 immediately and run sync in background (avoids gateway timeouts / 502).
 * Env: LEASING_SYNC_CHUNK_SIZE (default 5000), LEASING_SYNC_REST_MS (default 3000).
 */
export const postSyncFromDomo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (syncFromDomoInProgress) {
    res.status(409).json({ success: false, error: 'Sync already in progress' });
    return;
  }

  const secret = process.env.LEASING_SYNC_WEBHOOK_SECRET?.trim();
  if (secret) {
    const provided = (req.headers['x-sync-secret'] as string) || (req.body && typeof req.body === 'object' && (req.body as { secret?: string }).secret);
    if (provided !== secret) {
      res.status(401).json({ success: false, error: 'Invalid or missing sync secret' });
      return;
    }
  }

  const useAsync = String(req.query.async || '').toLowerCase() === 'true';

  if (useAsync) {
    syncFromDomoInProgress = true;
    runSyncFromDomoCore(req.query as Record<string, unknown>)
      .then((r) => {
        const synced = r.body?.synced;
        const n = Array.isArray(synced) ? synced.length : 0;
        console.log('[leasing/sync] background sync done:', n, 'tables synced');
      })
      .catch((e) => console.error('[leasing/sync] background sync failed:', e instanceof Error ? e.message : e))
      .finally(() => {
        syncFromDomoInProgress = false;
      });
    res.status(202).json({ success: true, message: 'Sync started in background' });
    return;
  }

  syncFromDomoInProgress = true;
  try {
    const result = await runSyncFromDomoCore(req.query as Record<string, unknown>);
    res.status(result.statusCode).json(result.body);
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

/**
 * Schedule a single snapshot rebuild after a short delay. Multiple syncs in quick succession
 * only trigger one rebuild to avoid DB overload.
 */
function scheduleRebuildAfterSync(): void {
  if (rebuildDebounceTimer) clearTimeout(rebuildDebounceTimer);
  rebuildDebounceTimer = setTimeout(() => {
    rebuildDebounceTimer = null;
    rebuildDashboardSnapshot().catch((err) => console.warn('[leasing] Debounced snapshot rebuild failed:', err?.message ?? err));
  }, REBUILD_DEBOUNCE_MS);
}

/** Rebuild and store the dashboard snapshot with every leasing table (raw) + computed dashboard. Backend uses snapshot to prepopulate and run calculations like Domo. Only one rebuild runs at a time. */
export async function rebuildDashboardSnapshot(): Promise<void> {
  if (rebuildInProgress) {
    await rebuildInProgress;
    return;
  }
  const run = async (): Promise<void> => {
    try {
      const raw = await getAllForDashboard();
      const statusByPropertyFromCore = await getStatusByPropertyFromCoreProjects();
      const dashboard = await buildDashboardFromRaw(raw, { statusByPropertyFromCore });
      dashboard.hubPropertyNames = await getLeaseUpStabilizedProjectNames();
      const safe = dashboardPayloadToJsonSafe(dashboard);
      const now = new Date();
      const fullResponse = JSON.stringify({
        success: true,
        raw: {
          leasing: raw.leasing,
          mmrRows: raw.mmrRows,
          utradeRows: raw.utradeRows,
          portfolioUnitDetails: raw.portfolioUnitDetails,
          units: raw.units,
          unitmix: raw.unitmix,
          pricing: raw.pricing,
          recents: raw.recents,
        },
        dashboard: safe,
        _meta: { source: AGGREGATION_SOURCE, fromSnapshot: true, builtAt: now.toISOString() },
      });
      await upsertDashboardSnapshot(fullResponse);
    } catch (err) {
      console.error('rebuildDashboardSnapshot failed:', err instanceof Error ? err.message : err);
    } finally {
      rebuildInProgress = null;
    }
  };
  rebuildInProgress = run();
  await rebuildInProgress;
}

/**
 * GET /api/leasing/debug/compare-millerville
 * Compare backend vs frontend occupancy logic for Millerville (same PUD). Returns diff of units where backend occupied !== frontend occupied.
 */
export const getCompareMillerville = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const raw = await getAllForDashboard();
    const pud = raw.portfolioUnitDetails ?? [];
    const compare = getOccupancyCompareForProperty('The Waters at Millerville', pud as Record<string, unknown>[]);
    if (!compare) {
      res.status(404).json({ success: false, error: 'No Millerville PUD or no report date' });
      return;
    }
    res.json({ success: true, compare });
  } catch (error) {
    next(error);
  }
};

/** Cache for GET /api/leasing/dashboard: 2 minutes so mobile and repeat visits avoid refetch. */
const DASHBOARD_CACHE_MAX_AGE_SEC = 120;

/**
 * GET /api/leasing/dashboard
 * Returns every leasing table (raw) plus the computed dashboard so the backend can prepopulate and run calculations like Domo.
 * Serves from DashboardSnapshot if present (payload has raw: { leasing, mmrRows, ... } and dashboard); otherwise builds from DB and returns same shape.
 * Query: asOf (optional) YYYY-MM-DD; part (optional) 'dashboard' | 'raw' to return only that slice (smaller payload, faster on mobile); rebuild=1 to force rebuild.
 * Response is cacheable: Cache-Control private, max-age=120; ETag from builtAt for 304.
 */
export const getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const part = typeof req.query.part === 'string' ? req.query.part.toLowerCase() : undefined;
    const skipSnapshot = req.query.rebuild === '1' || req.query.rebuild === 'true';
    const t0 = Date.now();
    console.log('[leasing/dashboard] GET start', skipSnapshot ? '(rebuild=1)' : '', part ? `part=${part}` : '');
    const snapshot = skipSnapshot ? null : await getDashboardSnapshot();
    console.log('[leasing/dashboard] snapshot fetch', Date.now() - t0, 'ms', snapshot?.payload ? 'hit' : 'miss');
    type ResponsePayload = { success: boolean; raw?: unknown; dashboard?: LeasingDashboardPayload; _meta: unknown };

    const buildResponseFromPayload = async (payload: string, snapshotBuiltAt: Date): Promise<{ responseObj: ResponsePayload; builtAt: Date }> => {
      let dashboard: LeasingDashboardPayload;
      let rawInPayload: unknown;
      if (payload.startsWith('{"success":')) {
        const parsed = JSON.parse(payload) as { success: boolean; dashboard?: LeasingDashboardPayload; raw?: unknown; _meta?: unknown };
        dashboard = parsed.dashboard ?? (parsed as unknown as LeasingDashboardPayload);
        rawInPayload = (parsed as { raw?: unknown }).raw;
      } else {
        dashboard = JSON.parse(payload) as LeasingDashboardPayload;
      }
      ensureDashboardRowsFromKpis(dashboard);
      if (!Array.isArray(dashboard.hubPropertyNames) || dashboard.hubPropertyNames.length === 0) {
        dashboard.hubPropertyNames = await getLeaseUpStabilizedProjectNames();
      }
      const meta = {
        source: AGGREGATION_SOURCE,
        asOf,
        fromSnapshot: true,
        builtAt: snapshotBuiltAt?.toISOString?.(),
        latestReportDate: (dashboard.kpis as { latestReportDate?: string | Date } | undefined)?.latestReportDate,
        performanceOverviewOverlayApplied: false,
      };
      let responseObj: ResponsePayload;
      if (part === 'raw' && payload.startsWith('{"success":') && rawInPayload !== undefined) {
        responseObj = { success: true, raw: rawInPayload, _meta: meta };
      } else if (part === 'dashboard') {
        responseObj = { success: true, dashboard, _meta: meta };
      } else if (payload.startsWith('{"success":') && rawInPayload !== undefined) {
        responseObj = { success: true, raw: rawInPayload, dashboard, _meta: meta };
      } else {
        responseObj = { success: true, dashboard, _meta: meta };
      }
      return { responseObj, builtAt: snapshotBuiltAt };
    };

    if (snapshot?.payload) {
      const { responseObj, builtAt } = await buildResponseFromPayload(snapshot.payload, snapshot.builtAt);
      res.set('Cache-Control', `private, max-age=${DASHBOARD_CACHE_MAX_AGE_SEC}`);
      const etag = `"${builtAt.getTime()}"`;
      res.set('ETag', etag);
      if (req.get('If-None-Match') === etag) {
        res.status(304).end();
        console.log('[leasing/dashboard] 304 Not Modified', Date.now() - t0, 'ms');
        return;
      }
      res.json(responseObj);
      console.log('[leasing/dashboard] sent from snapshot', Date.now() - t0, 'ms');
      return;
    }

    console.log('[leasing/dashboard] no snapshot, rebuilding (single mutex)...');
    await rebuildDashboardSnapshot();
    const afterSnapshot = await getDashboardSnapshot();
    if (!afterSnapshot?.payload) {
      res.status(503).json({ success: false, error: 'Dashboard snapshot rebuild did not produce a snapshot.' });
      return;
    }
    const { responseObj, builtAt } = await buildResponseFromPayload(afterSnapshot.payload, afterSnapshot.builtAt);
    res.set('Cache-Control', `private, max-age=${DASHBOARD_CACHE_MAX_AGE_SEC}`);
    const etag = `"${builtAt.getTime()}"`;
    res.set('ETag', etag);
    if (req.get('If-None-Match') === etag) {
      res.status(304).end();
      console.log('[leasing/dashboard] 304 after rebuild', Date.now() - t0, 'ms');
      return;
    }
    res.json(responseObj);
    console.log('[leasing/dashboard] sent from snapshot after rebuild', Date.now() - t0, 'ms');
  } catch (error) {
    console.error('[leasing/dashboard] error', error instanceof Error ? error.message : error);
    next(error);
  }
};

/**
 * GET /api/leasing/dashboard-diag
 * Returns raw DB row counts and built dashboard row/kpi counts (does not store snapshot).
 * Use to see where the pipeline drops to 0 (e.g. raw.leasing vs built rows).
 */
export const getDashboardDiag = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const raw = await getAllForDashboard();
    const statusByPropertyFromCore = await getStatusByPropertyFromCoreProjects();
    const dashboard = await buildDashboardFromRaw(raw, { statusByPropertyFromCore });
    const byProperty = (dashboard.kpis as { byProperty?: Record<string, unknown> } | undefined)?.byProperty ?? {};
    const leasing = raw.leasing ?? [];
    const pud = raw.portfolioUnitDetails ?? [];
    const sampleLeasingKeys = leasing.length > 0 ? Object.keys(leasing[0] as Record<string, unknown>).slice(0, 25) : [];
    const samplePudKeys = pud.length > 0 ? Object.keys(pud[0] as Record<string, unknown>).slice(0, 25) : [];
    const dateCandidates = ['ReportDate', 'reportDate', 'BatchTimestamp', 'MonthOf'];
    const leasingWithDate = leasing.filter((r) => {
      const row = r as Record<string, unknown>;
      for (const k of dateCandidates) {
        const v = row[k];
        if (v != null && v !== '' && !Number.isNaN(Date.parse(String(v)))) return true;
      }
      return false;
    }).length;
    const leasingWithProperty = leasing.filter((r) => {
      const v = (r as Record<string, unknown>).Property ?? (r as Record<string, unknown>).property;
      return v != null && String(v).trim() !== '';
    }).length;
    res.json({
      raw: {
        leasing: leasing.length,
        mmrRows: (raw.mmrRows ?? []).length,
        utradeRows: (raw.utradeRows ?? []).length,
        portfolioUnitDetails: pud.length,
        units: (raw.units ?? []).length,
        unitmix: (raw.unitmix ?? []).length,
        pricing: (raw.pricing ?? []).length,
        recents: (raw.recents ?? []).length,
      },
      built: {
        rows: (dashboard.rows ?? []).length,
        byPropertyKeys: Object.keys(byProperty).length,
      },
      sampleLeasingKeys,
      samplePudKeys,
      leasingWithParseableDate: leasingWithDate,
      leasingWithProperty,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/leasing/rebuild-snapshot
 * Force rebuild and store the dashboard snapshot. Next GET /dashboard is instant.
 * Optional: X-Sync-Secret (same as sync-from-domo) when LEASING_SYNC_WEBHOOK_SECRET is set.
 */
export const postRebuildSnapshot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const secret = process.env.LEASING_SYNC_WEBHOOK_SECRET?.trim();
    if (secret) {
      const provided = (req.headers['x-sync-secret'] as string) || (req.body && typeof req.body === 'object' && (req.body as { secret?: string }).secret);
      if (provided !== secret) {
        res.status(401).json({ success: false, error: 'Invalid or missing sync secret' });
        return;
      }
    }
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

// ---------- KPI endpoints (portfolio and by-property; precalculated in snapshot when available) ----------
/** Resolve KPIs from snapshot or build from raw. Query: asOf (YYYY-MM-DD), property (single property filter). */
async function resolveKpis(asOf?: string, property?: string): Promise<{ kpis: PortfolioKpis; fromSnapshot: boolean }> {
  const snapshot = await getDashboardSnapshot();
  if (snapshot?.payload && snapshot.payload.startsWith('{"success":')) {
    try {
      const parsed = JSON.parse(snapshot.payload) as { dashboard?: { kpis?: PortfolioKpis } };
      const kpis = parsed.dashboard?.kpis;
      if (kpis && typeof kpis === 'object') {
        let out = kpis as PortfolioKpis;
        if (property && out.byProperty) {
          const pNorm = property.trim().toUpperCase().replace(/\*/g, '');
          const match = Object.entries(out.byProperty).find(([k]) => k.toUpperCase().replace(/\*/g, '') === pNorm);
          if (match) {
            const [, propKpis] = match;
            out = {
              ...out,
              properties: 1,
              totalUnits: propKpis.totalUnits,
              occupied: propKpis.occupied,
              leased: propKpis.leased,
              available: propKpis.available,
              occupancyPct: propKpis.occupancyPct,
              leases7d: propKpis.leases7d,
              leases28d: propKpis.leases28d,
              deltaToBudget: propKpis.deltaToBudget,
              byProperty: { [match[0]]: propKpis },
            };
          }
        }
        return { kpis: out, fromSnapshot: true };
      }
    } catch {
      /* fall through to build from raw */
    }
  }
  const raw = await getAllForDashboard();
  const { mmrOcc, mmrBudgetedOcc, mmrBudgetedOccPct, mmrCurrentLeasedPct } = getMmrBudgetByProperty(raw);
  const kpis = buildKpis(raw, { asOf, property, mmrOcc, mmrBudgetedOcc, mmrBudgetedOccPct, mmrCurrentLeasedPct });
  return { kpis, fromSnapshot: false };
}

/**
 * GET /api/leasing/kpis
 * Portfolio and by-property KPIs (occupancy, leased, available, 7d/28d leases, delta to budget).
 * Query: asOf (YYYY-MM-DD), property (optional – scope to one property).
 */
export const getKpis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const property = typeof req.query.property === 'string' ? req.query.property : undefined;
    const { kpis, fromSnapshot } = await resolveKpis(asOf, property);
    res.json({ success: true, kpis, _meta: { fromSnapshot } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/kpis/occupancy
 * Portfolio overall occupancy (most recent report date from unit details, occupied units / total).
 */
export const getKpisOccupancy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const property = typeof req.query.property === 'string' ? req.query.property : undefined;
    const { kpis, fromSnapshot } = await resolveKpis(asOf, property);
    res.json({
      success: true,
      occupancy: kpis.occupied,
      totalUnits: kpis.totalUnits,
      occupancyPct: kpis.occupancyPct,
      byProperty: Object.fromEntries(
        Object.entries(kpis.byProperty).map(([p, v]) => [p, { occupied: v.occupied, totalUnits: v.totalUnits, occupancyPct: v.occupancyPct }])
      ),
      _meta: { fromSnapshot, latestReportDate: kpis.latestReportDate },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/kpis/leased
 * Portfolio leased units (occupied + vacant leased from unit details).
 */
export const getKpisLeased = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const property = typeof req.query.property === 'string' ? req.query.property : undefined;
    const { kpis, fromSnapshot } = await resolveKpis(asOf, property);
    res.json({
      success: true,
      leased: kpis.leased,
      totalUnits: kpis.totalUnits,
      byProperty: Object.fromEntries(
        Object.entries(kpis.byProperty).map(([p, v]) => [p, { leased: v.leased, totalUnits: v.totalUnits }])
      ),
      _meta: { fromSnapshot },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/kpis/occupancy-and-budget
 * By-property occupancy and budgeted occupancy (same PUD/unit-status and MMR logic as dashboard).
 */
export const getKpisOccupancyAndBudget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const property = typeof req.query.property === 'string' ? req.query.property : undefined;
    const { kpis, fromSnapshot } = await resolveKpis(asOf, property);
    res.json({
      success: true,
      occupancy: kpis.occupied,
      totalUnits: kpis.totalUnits,
      occupancyPct: kpis.occupancyPct,
      byProperty: Object.fromEntries(
        Object.entries(kpis.byProperty).map(([p, v]) => [
          p,
          {
            occupied: v.occupied,
            leased: v.leased,
            totalUnits: v.totalUnits,
            occupancyPct: v.occupancyPct,
            budgetedOccupancyUnits: v.budgetedOccupancyUnits ?? null,
            budgetedOccupancyPct: v.budgetedOccupancyPct ?? null,
          },
        ])
      ),
      _meta: { fromSnapshot, latestReportDate: kpis.latestReportDate },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/kpis/available
 * Portfolio available units (controllable availability: total - leased).
 */
export const getKpisAvailable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const property = typeof req.query.property === 'string' ? req.query.property : undefined;
    const { kpis, fromSnapshot } = await resolveKpis(asOf, property);
    res.json({
      success: true,
      available: kpis.available,
      totalUnits: kpis.totalUnits,
      byProperty: Object.fromEntries(
        Object.entries(kpis.byProperty).map(([p, v]) => [p, { available: v.available, totalUnits: v.totalUnits }])
      ),
      _meta: { fromSnapshot },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/kpis/velocity
 * 7-day and 28-day lease counts (from leasing summary).
 */
export const getKpisVelocity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const property = typeof req.query.property === 'string' ? req.query.property : undefined;
    const { kpis, fromSnapshot } = await resolveKpis(asOf, property);
    res.json({
      success: true,
      leases7d: kpis.leases7d,
      leases28d: kpis.leases28d,
      byProperty: Object.fromEntries(
        Object.entries(kpis.byProperty).map(([p, v]) => [p, { leases7d: v.leases7d, leases28d: v.leases28d }])
      ),
      _meta: { fromSnapshot },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/kpis/delta-budget
 * Delta to budget (current occupied vs budgeted occupancy target).
 */
export const getKpisDeltaBudget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const property = typeof req.query.property === 'string' ? req.query.property : undefined;
    const { kpis, fromSnapshot } = await resolveKpis(asOf, property);
    res.json({
      success: true,
      deltaToBudget: kpis.deltaToBudget,
      byProperty: Object.fromEntries(
        Object.entries(kpis.byProperty).map(([p, v]) => [p, { deltaToBudget: v.deltaToBudget }])
      ),
      _meta: { fromSnapshot },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leasing/kpis/avg-leased-rent
 * Avg leased rent (weighted by base plan type) from portfolio unit details – same logic as frontend weightedOccupiedAvgRent.
 */
export const getKpisAvgLeasedRent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const asOf = typeof req.query.asOf === 'string' ? req.query.asOf : undefined;
    const property = typeof req.query.property === 'string' ? req.query.property : undefined;
    const { kpis, fromSnapshot } = await resolveKpis(asOf, property);
    res.json({
      success: true,
      avgLeasedRent: kpis.avgLeasedRent,
      byProperty: Object.fromEntries(
        Object.entries(kpis.byProperty).map(([p, v]) => [p, { avgLeasedRent: v.avgLeasedRent }])
      ),
      _meta: { fromSnapshot },
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
