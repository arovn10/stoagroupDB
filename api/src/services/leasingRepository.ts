/**
 * Leasing repository: sync (truncate + bulk insert), CRUD, and read-for-dashboard.
 * All tables live in schema [leasing].
 * Runtime alias overrides: api/src/config/domo-alias-overrides.json (table -> column -> string[]) for Domo CSV header names.
 */
import sql from 'mssql';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getConnection } from '../config/database';

const OVERRIDES_PATH = path.join(__dirname, '../config/domo-alias-overrides.json');

/** Load runtime overrides for Domo column names (used by check-and-fix-leasing-sync script). Re-read on each call. */
export function loadDomoAliasOverrides(): Record<string, Record<string, string[]>> {
  try {
    const raw = fs.readFileSync(OVERRIDES_PATH, 'utf8');
    const data = JSON.parse(raw) as Record<string, Record<string, string[]>>;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** Add a runtime alias override for a table/column. Persists to domo-alias-overrides.json. */
export function addDomoAliasOverride(alias: string, column: string, domoHeader: string): void {
  const o = loadDomoAliasOverrides();
  if (!o[alias]) o[alias] = {};
  if (!o[alias][column]) o[alias][column] = [];
  if (!o[alias][column].includes(domoHeader)) o[alias][column].push(domoHeader);
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(o, null, 2), 'utf8');
}

const LEASING_SCHEMA = 'leasing';
const SYNC_LOG = `${LEASING_SCHEMA}.SyncLog`;

export const DATASET_ALIASES = [
  'leasing',
  'MMRData',
  'unitbyunittradeout',
  'portfolioUnitDetails',
  'units',
  'unitmix',
  'pricing',
  'recentrents',
] as const;
export type DatasetAlias = (typeof DATASET_ALIASES)[number];

/** Pick value from row by trying alias, column name, or DB column name. Case-insensitive fallback for CSV headers. */
function getVal(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k) && row[k] !== undefined && row[k] !== '') return row[k];
  }
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const want = String(k).toLowerCase();
    for (const rk of rowKeys) {
      if (rk.toLowerCase() === want) {
        const v = row[rk];
        if (v !== undefined && v !== '') return v;
        break;
      }
    }
  }
  return null;
}

/** getVal with runtime overrides from domo-alias-overrides.json (tried after column name, before defaults). */
function getValWithOverrides(
  alias: string,
  column: string,
  row: Record<string, unknown>,
  ...defaultAliases: string[]
): unknown {
  const overrides = loadDomoAliasOverrides();
  const extra = overrides[alias]?.[column] ?? [];
  return getVal(row, column, ...extra, ...defaultAliases);
}
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  let s = String(v).trim();
  if (!s) return null;
  // Strip currency and thousands separators ($1,234.56 -> 1234.56)
  s = s.replace(/^[$€£]|\s/g, '').replace(/,/g, '');
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}
function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

/** Escape a value for use in raw SQL VALUES (NULL, number, or 'escaped string'). */
function escapeSqlVal(v: unknown): string {
  if (v == null || v === '') return 'NULL';
  if (typeof v === 'number') return Number.isNaN(v) ? 'NULL' : String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

const BATCH_SIZE = 500;

/** Null-safe ON clause for MERGE: (t.col = s.col OR (t.col IS NULL AND s.col IS NULL)) */
function mergeOnClause(keyCols: string[]): string {
  return keyCols
    .map((c) => `(t.[${c}] = s.[${c}] OR (t.[${c}] IS NULL AND s.[${c}] IS NULL))`)
    .join(' AND ');
}

/**
 * Run batched MERGE (upsert): update existing rows by key, insert new ones. No truncate.
 * Used when replace=false so sync appends/updates instead of wiping the table.
 */
async function batchUpsert(
  tx: sql.Transaction,
  table: string,
  keyCols: string[],
  columns: string[],
  rows: Record<string, unknown>[],
  rowToValues: (row: Record<string, unknown>) => unknown[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const colList = columns.join(', ');
  const updateSet = columns.map((c) => `t.[${c}] = s.[${c}]`).join(', ') + ', t.SyncedAt = SYSDATETIME()';
  const insertCols = colList + ', SyncedAt';
  const insertVals = columns.map((c) => `s.[${c}]`).join(', ') + ', SYSDATETIME()';
  const onClause = mergeOnClause(keyCols);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const valuesList = chunk.map((row) => {
      const vals = rowToValues(row).map(escapeSqlVal);
      return `(${vals.join(',')})`;
    });
    const sqlStr = `
      MERGE ${table} AS t
      USING (VALUES ${valuesList.join(',')}) AS s(${columns.map((c) => `[${c}]`).join(', ')})
      ON ${onClause}
      WHEN MATCHED THEN UPDATE SET ${updateSet}
      WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertVals});
    `;
    await tx.request().query(sqlStr);
  }
  return rows.length;
}

/** Run batched INSERT (multi-row VALUES). When replace=true, TRUNCATE first. When replace=false, upsert by key (no wipe). */
async function batchInsert(
  tx: sql.Transaction,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  rowToValues: (row: Record<string, unknown>) => unknown[],
  replace = true,
  keyCols?: string[]
): Promise<number> {
  if (replace) {
    await tx.request().query(`TRUNCATE TABLE ${table}`);
  } else if (keyCols && keyCols.length > 0) {
    return batchUpsert(tx, table, keyCols, columns, rows, rowToValues);
  }
  if (rows.length === 0) return 0;
  const colList = columns.join(', ');
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const valuesList = chunk.map((row) => {
      const vals = rowToValues(row).map(escapeSqlVal);
      return `(${vals.join(',')})`;
    });
    const sqlStr = `INSERT INTO ${table} (${colList}) VALUES ${valuesList.join(',')}`;
    await tx.request().query(sqlStr);
  }
  return rows.length;
}

/** Compute a stable hash for payload to detect Domo data changes. */
export function dataHash(rows: unknown[]): string {
  const payload = JSON.stringify(rows.length) + JSON.stringify(rows.slice(0, 50).map((r) => JSON.stringify(r)));
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

// ---------- SyncLog ----------
export async function getSyncLog(datasetAlias: string): Promise<{
  LastSyncAt: Date;
  LastSyncDate: Date;
  LastDataHash: string | null;
  LastRowCount: number | null;
} | null> {
  const pool = await getConnection();
  const r = await pool
    .request()
    .input('alias', sql.NVarChar(64), datasetAlias)
    .query(
      `SELECT LastSyncAt, LastSyncDate, LastDataHash, LastRowCount FROM ${SYNC_LOG} WHERE DatasetAlias = @alias`
    );
  if (r.recordset.length === 0) return null;
  const row = r.recordset[0];
  return {
    LastSyncAt: row.LastSyncAt,
    LastSyncDate: row.LastSyncDate,
    LastDataHash: row.LastDataHash ?? null,
    LastRowCount: row.LastRowCount ?? null,
  };
}

export async function upsertSyncLog(
  datasetAlias: string,
  lastSyncAt: Date,
  lastSyncDate: Date,
  lastDataHash: string | null,
  lastRowCount: number | null
): Promise<void> {
  const pool = await getConnection();
  await pool
    .request()
    .input('alias', sql.NVarChar(64), datasetAlias)
    .input('at', sql.DateTime2, lastSyncAt)
    .input('date', sql.Date, lastSyncDate)
    .input('hash', sql.NVarChar(64), lastDataHash)
    .input('count', sql.Int, lastRowCount)
    .query(`
      MERGE ${SYNC_LOG} AS t
      USING (SELECT @alias AS a) AS s ON t.DatasetAlias = s.a
      WHEN MATCHED THEN UPDATE SET
        LastSyncAt = @at, LastSyncDate = @date, LastDataHash = @hash, LastRowCount = @count, UpdatedAt = SYSDATETIME()
      WHEN NOT MATCHED THEN INSERT (DatasetAlias, LastSyncAt, LastSyncDate, LastDataHash, LastRowCount)
        VALUES (@alias, @at, @date, @hash, @count);
    `);
}

/** True if we allow sync: no sync today, or (synced today and new hash !== last hash). */
export async function canSync(datasetAlias: string, dataHashNew: string): Promise<boolean> {
  const log = await getSyncLog(datasetAlias);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayDate = new Date(todayStr + 'T00:00:00.000Z');
  if (!log) return true;
  const lastDateStr = log.LastSyncDate.toISOString().slice(0, 10);
  if (lastDateStr !== todayStr) return true;
  if (log.LastDataHash !== dataHashNew) return true;
  return false;
}

/** Alias -> physical table name (leasing schema). */
export const LEASING_TABLE_BY_ALIAS: Record<string, string> = {
  leasing: 'Leasing',
  MMRData: 'MMRData',
  unitbyunittradeout: 'UnitByUnitTradeout',
  portfolioUnitDetails: 'PortfolioUnitDetails',
  units: 'Units',
  unitmix: 'UnitMix',
  pricing: 'Pricing',
  recentrents: 'RecentRents',
};

/** Alias -> list of data columns to check for all-null (excludes Id, SyncedAt). */
export const LEASING_COLUMNS_BY_ALIAS: Record<string, string[]> = {
  leasing: ['Property', 'Units', 'LeasesNeeded', 'NewLeasesCurrentGrossRent', 'LeasingVelocity7Day', 'LeasingVelocity28Day', 'MonthOf', 'BatchTimestamp'],
  MMRData: ['Property', 'Location', 'TotalUnits', 'OccupancyPercent', 'CurrentLeasedPercent', 'MI', 'MO', 'FirstVisit', 'Applied', 'Canceled', 'Denied', 'T12LeasesExpired', 'T12LeasesRenewed', 'Delinquent', 'OccupiedRent', 'BudgetedRent', 'CurrentMonthIncome', 'BudgetedIncome', 'MoveInRent', 'OccUnits', 'Week3EndDate', 'Week3MoveIns', 'Week3MoveOuts', 'Week3OccUnits', 'Week3OccPercent', 'Week4EndDate', 'Week4MoveIns', 'Week4MoveOuts', 'Week4OccUnits', 'Week4OccPercent', 'Week7EndDate', 'Week7MoveIns', 'Week7MoveOuts', 'Week7OccUnits', 'Week7OccPercent', 'InServiceUnits', 'T12LeaseBreaks', 'BudgetedOccupancyCurrentMonth', 'BudgetedOccupancyPercentCurrentMonth', 'BudgetedLeasedPercentCurrentMonth', 'BudgetedLeasedCurrentMonth', 'ReportDate', 'ConstructionStatus', 'Rank', 'PreviousOccupancyPercent', 'PreviousLeasedPercent', 'PreviousDelinquentUnits', 'WeekStart', 'LatestDate', 'City', 'State', 'Status', 'FinancingStatus', 'ProductType', 'Units', 'FullAddress', 'Latitude', 'Longitude', 'Region', 'LatestConstructionStatus', 'BirthOrder', 'NetLsd'],
  unitbyunittradeout: ['FloorPlan', 'UnitDetailsUnitType', 'UnitDetailsBuilding', 'UnitDetailsUnit', 'UnitDetailsSqFt', 'CurrentLeaseRateType', 'CurrentLeaseLeaseType', 'CurrentLeaseAppSignedDate', 'CurrentLeaseLeaseStart', 'CurrentLeaseLeaseEnd', 'CurrentLeaseTerm', 'CurrentLeasePrem', 'CurrentLeaseGrossRent', 'CurrentLeaseConc', 'CurrentLeaseEffRent', 'PreviousLeaseRateType', 'PreviousLeaseLeaseStart', 'PreviousLeaseScheduledLeaseEnd', 'PreviousLeaseActualLeaseEnd', 'PreviousLeaseTerm', 'PreviousLeasePrem', 'PreviousLeaseGrossRent', 'PreviousLeaseConc', 'PreviousLeaseEffRent', 'VacantDays', 'TermVariance', 'TradeOutPercentage', 'TradeOutAmount', 'ReportDate', 'JoinDate', 'MonthOf', 'Property', 'City', 'State', 'Status', 'Units', 'FullAddress', 'Latitude', 'Longitude', 'Region', 'ConstructionStatus', 'BirthOrder'],
  portfolioUnitDetails: ['Property', 'UnitNumber', 'FloorPlan', 'UnitDesignation', 'SQFT', 'UnitLeaseStatus', 'ResidentNameExternalTenantID', 'LeaseID', 'MoveIn', 'Notice', 'MoveOut', 'DaysVacant', 'MakeReady', 'MakeReadyDaystoComplete', 'LeaseStart', 'Leaseend', 'ApplicationDate', 'LeaseType', 'MarketRent', 'LeaseRent', 'EffectiveRent', 'Concession', 'SubsidyRent', 'Amenities', 'TotalBilling', 'UnitText', 'firstFloorDesignator', 'floor', 'ReportDate', 'BATCHLASTRUN'],
  units: ['PropertyName', 'FloorPlan', 'UnitType', 'BldgUnit', 'SqFt', 'Features', 'Condition', 'Vacated', 'DateAvailable', 'BestPriceTerm', 'Monthlygrossrent', 'Concessions', 'MonthlyEffectiveRent', 'PreviousLeaseTerm', 'PreviousLeaseMonthlyEffectiveRent', 'GrossForecastedTradeout', 'ReportDate'],
  unitmix: ['PropertyName', 'UnitType', 'TotalUnits', 'SquareFeet', 'PercentOccupied', 'percentLeased', 'GrossOfferedRent30days', 'GrossInPlaceRent', 'GrossRecentExecutedRent60days', 'GrossOfferedRentPSF', 'GrossRecentExecutedRentPSF', 'ReportDate', 'FloorPlan'],
  pricing: ['Property', 'FloorPlan', 'RateType', 'PostDate', 'EndDate', 'DaysLeft', 'CapacityActualUnits', 'CapacitySustainablePercentage', 'CapacitySustainableUnits', 'CurrentInPlaceLeases', 'CurrentInPlaceOcc', 'CurrentForecastLeases', 'CurrentForecastOcc', 'RecommendedForecastLeases', 'RecommendedForecastOcc', 'RecommendedForecastChg', 'YesterdayDate', 'YesterdayRent', 'YesterdayPercentage', 'AmenityNormModelRent', 'AmenityNormAmenAdj', 'RecommendationsRecommendedEffRent', 'RecommendationsRecommendedEffPercentage', 'RecommendationsChangeRent', 'RecommendationsChangeRev', 'RecommendationsRecentAvgEffRent', 'RecommendationsRecentAvgEffPercentage'],
  recentrents: ['Property', 'FloorPlan', 'ApplicationDate', 'EffectiveDate', 'LeaseStart', 'LeaseEnd', 'GrossRent', 'EffectiveRent', 'ReportDate'],
};

/** Return column names that are entirely NULL for a leasing table (table must have rows). */
export async function getLeasingTableAllNullColumns(alias: string): Promise<string[]> {
  const tableName = LEASING_TABLE_BY_ALIAS[alias];
  const columns = LEASING_COLUMNS_BY_ALIAS[alias];
  if (!tableName || !columns?.length) return [];
  const fullName = `${LEASING_SCHEMA}.${tableName}`;
  const countExprs = columns.map((c) => `COUNT([${c}]) AS [${c}]`).join(', ');
  const pool = await getConnection();
  const r = await pool.request().query(
    `SELECT COUNT(*) AS total, ${countExprs} FROM ${fullName}`
  );
  const row = r.recordset[0] as Record<string, number>;
  const total = row?.total ?? 0;
  if (total === 0) return [];
  const allNull: string[] = [];
  for (const col of columns) {
    if (row[col] === 0) allNull.push(col);
  }
  return allNull;
}

/** Truncate a single leasing table and remove its SyncLog row so next sync will run. */
export async function wipeLeasingTable(alias: string): Promise<{ truncated: string }> {
  const tableName = LEASING_TABLE_BY_ALIAS[alias];
  if (!tableName) throw new Error(`Unknown leasing alias: ${alias}`);
  const fullName = `${LEASING_SCHEMA}.${tableName}`;
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request().query(`TRUNCATE TABLE ${fullName}`);
    await tx.request().input('alias', sql.NVarChar(64), alias).query(`DELETE FROM ${SYNC_LOG} WHERE DatasetAlias = @alias`);
    await tx.commit();
    return { truncated: fullName };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/** Truncate all leasing data tables and clear SyncLog so the next sync-from-domo does a full replace. */
export async function wipeLeasingTables(): Promise<{ truncated: string[] }> {
  const tables = [
    `${LEASING_SCHEMA}.Leasing`,
    `${LEASING_SCHEMA}.MMRData`,
    `${LEASING_SCHEMA}.UnitByUnitTradeout`,
    `${LEASING_SCHEMA}.PortfolioUnitDetails`,
    `${LEASING_SCHEMA}.Units`,
    `${LEASING_SCHEMA}.UnitMix`,
    `${LEASING_SCHEMA}.Pricing`,
    `${LEASING_SCHEMA}.RecentRents`,
  ];
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const table of tables) {
      await tx.request().query(`TRUNCATE TABLE ${table}`);
    }
    await tx.request().query(`DELETE FROM ${SYNC_LOG}`);
    await tx.commit();
    return { truncated: [...tables, SYNC_LOG] };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- Leasing ----------
const LEASING_ALIAS = 'leasing';
const T_LEASING = `${LEASING_SCHEMA}.Leasing`;
const LEASING_COLS = ['Property', 'Units', 'LeasesNeeded', 'NewLeasesCurrentGrossRent', 'LeasingVelocity7Day', 'LeasingVelocity28Day', 'MonthOf', 'BatchTimestamp'];
const LEASING_KEYS = ['Property', 'MonthOf'];
export async function syncLeasing(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_LEASING, LEASING_COLS, rows, (row) => [
      str(getValWithOverrides(LEASING_ALIAS, 'Property', row, 'Property Name', 'PropertyName', 'Community', 'Asset')),
      num(getValWithOverrides(LEASING_ALIAS, 'Units', row, 'Total Units', 'Unit Count', 'UnitsCount')),
      num(getValWithOverrides(LEASING_ALIAS, 'LeasesNeeded', row, 'Leases Needed', 'Leases needed')),
      num(getValWithOverrides(LEASING_ALIAS, 'NewLeasesCurrentGrossRent', row, 'New Leases Current Gross Rent', 'New Leases Gross Rent', 'NewLeasesGrossRent')),
      num(getValWithOverrides(LEASING_ALIAS, 'LeasingVelocity7Day', row, '7DayLeasingVelocity', '7-Day Leasing Velocity', '7 Day Leasing Velocity', '7 Day Velocity', 'Leasing Velocity 7 Day')),
      num(getValWithOverrides(LEASING_ALIAS, 'LeasingVelocity28Day', row, '28DayLeasingVelocity', '28-Day Leasing Velocity', '28 Day Leasing Velocity', '28 Day Velocity', 'Leasing Velocity 28 Day')),
      str(getValWithOverrides(LEASING_ALIAS, 'MonthOf', row, 'Month Of', 'Month', 'Report Month', 'As Of Date', 'AsOfDate', 'ReportDate', 'Date')),
      str(getValWithOverrides(LEASING_ALIAS, 'BatchTimestamp', row, 'Batch Timestamp', 'Timestamp', 'SyncedAt')),
    ], replace, LEASING_KEYS);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- MMRData ----------
const MMR_ALIAS = 'MMRData';
const T_MMR = `${LEASING_SCHEMA}.MMRData`;
const MMR_COLS = ['Property', 'Location', 'TotalUnits', 'OccupancyPercent', 'CurrentLeasedPercent', 'MI', 'MO', 'FirstVisit', 'Applied', 'Canceled', 'Denied', 'T12LeasesExpired', 'T12LeasesRenewed', 'Delinquent', 'OccupiedRent', 'BudgetedRent', 'CurrentMonthIncome', 'BudgetedIncome', 'MoveInRent', 'OccUnits', 'Week3EndDate', 'Week3MoveIns', 'Week3MoveOuts', 'Week3OccUnits', 'Week3OccPercent', 'Week4EndDate', 'Week4MoveIns', 'Week4MoveOuts', 'Week4OccUnits', 'Week4OccPercent', 'Week7EndDate', 'Week7MoveIns', 'Week7MoveOuts', 'Week7OccUnits', 'Week7OccPercent', 'InServiceUnits', 'T12LeaseBreaks', 'BudgetedOccupancyCurrentMonth', 'BudgetedOccupancyPercentCurrentMonth', 'BudgetedLeasedPercentCurrentMonth', 'BudgetedLeasedCurrentMonth', 'ReportDate', 'ConstructionStatus', 'Rank', 'PreviousOccupancyPercent', 'PreviousLeasedPercent', 'PreviousDelinquentUnits', 'WeekStart', 'LatestDate', 'City', 'State', 'Status', 'FinancingStatus', 'ProductType', 'Units', 'FullAddress', 'Latitude', 'Longitude', 'Region', 'LatestConstructionStatus', 'BirthOrder', 'NetLsd'];
const MMR_KEYS = ['Property', 'ReportDate'];
export async function syncMMRData(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_MMR, MMR_COLS, rows, (row) => [
      str(getValWithOverrides(MMR_ALIAS, 'Property', row, 'Property Name', 'PropertyName', 'Community', 'Asset')), str(getValWithOverrides(MMR_ALIAS, 'Location', row, 'Property Location', 'Address')),
      num(getValWithOverrides(MMR_ALIAS, 'TotalUnits', row, 'Total Units')), num(getValWithOverrides(MMR_ALIAS, 'OccupancyPercent', row, 'Occupancy Percent', 'Occupancy %')), num(getValWithOverrides(MMR_ALIAS, 'CurrentLeasedPercent', row, 'Current Leased Percent', 'Leased %')),
      num(getValWithOverrides(MMR_ALIAS, 'MI', row)), num(getValWithOverrides(MMR_ALIAS, 'MO', row)), num(getValWithOverrides(MMR_ALIAS, 'FirstVisit', row, '1st Visit', 'First Visit')), num(getValWithOverrides(MMR_ALIAS, 'Applied', row)), num(getValWithOverrides(MMR_ALIAS, 'Canceled', row)), num(getValWithOverrides(MMR_ALIAS, 'Denied', row)), num(getValWithOverrides(MMR_ALIAS, 'T12LeasesExpired', row, 'T12 Leases Expired')), num(getValWithOverrides(MMR_ALIAS, 'T12LeasesRenewed', row, 'T12 Leases Renewed')), num(getValWithOverrides(MMR_ALIAS, 'Delinquent', row)), num(getValWithOverrides(MMR_ALIAS, 'OccupiedRent', row, 'Occupied Rent')), num(getValWithOverrides(MMR_ALIAS, 'BudgetedRent', row, 'Budgeted Rent')), num(getValWithOverrides(MMR_ALIAS, 'CurrentMonthIncome', row, 'Current Month Income')), num(getValWithOverrides(MMR_ALIAS, 'BudgetedIncome', row, 'Budgeted Income')), num(getValWithOverrides(MMR_ALIAS, 'MoveInRent', row, 'Move In Rent')), num(getValWithOverrides(MMR_ALIAS, 'OccUnits', row, 'Occ Units')),
      str(getValWithOverrides(MMR_ALIAS, 'Week3EndDate', row, 'Week 3 End Date', 'Week3 End Date')), num(getValWithOverrides(MMR_ALIAS, 'Week3MoveIns', row, 'Week 3 Move Ins')), num(getValWithOverrides(MMR_ALIAS, 'Week3MoveOuts', row, 'Week 3 Move Outs')), num(getValWithOverrides(MMR_ALIAS, 'Week3OccUnits', row, 'Week 3 Occ Units')), num(getValWithOverrides(MMR_ALIAS, 'Week3OccPercent', row, 'Week 3 Occ Percent')), str(getValWithOverrides(MMR_ALIAS, 'Week4EndDate', row, 'Week 4 End Date')), num(getValWithOverrides(MMR_ALIAS, 'Week4MoveIns', row)), num(getValWithOverrides(MMR_ALIAS, 'Week4MoveOuts', row)), num(getValWithOverrides(MMR_ALIAS, 'Week4OccUnits', row)), num(getValWithOverrides(MMR_ALIAS, 'Week4OccPercent', row)), str(getValWithOverrides(MMR_ALIAS, 'Week7EndDate', row, 'Week 7 End Date')), num(getValWithOverrides(MMR_ALIAS, 'Week7MoveIns', row)), num(getValWithOverrides(MMR_ALIAS, 'Week7MoveOuts', row)), num(getValWithOverrides(MMR_ALIAS, 'Week7OccUnits', row)), num(getValWithOverrides(MMR_ALIAS, 'Week7OccPercent', row)), num(getValWithOverrides(MMR_ALIAS, 'InServiceUnits', row, 'In Service Units')), num(getValWithOverrides(MMR_ALIAS, 'T12LeaseBreaks', row, 'T12 Lease Breaks')), num(getValWithOverrides(MMR_ALIAS, 'BudgetedOccupancyCurrentMonth', row)), num(getValWithOverrides(MMR_ALIAS, 'BudgetedOccupancyPercentCurrentMonth', row)), num(getValWithOverrides(MMR_ALIAS, 'BudgetedLeasedPercentCurrentMonth', row)), num(getValWithOverrides(MMR_ALIAS, 'BudgetedLeasedCurrentMonth', row)),
      str(getValWithOverrides(MMR_ALIAS, 'ReportDate', row, 'Report Date')), str(getValWithOverrides(MMR_ALIAS, 'ConstructionStatus', row, 'Construction Status')), num(getValWithOverrides(MMR_ALIAS, 'Rank', row)), num(getValWithOverrides(MMR_ALIAS, 'PreviousOccupancyPercent', row)), num(getValWithOverrides(MMR_ALIAS, 'PreviousLeasedPercent', row)), num(getValWithOverrides(MMR_ALIAS, 'PreviousDelinquentUnits', row)), str(getValWithOverrides(MMR_ALIAS, 'WeekStart', row, 'Week Start')), str(getValWithOverrides(MMR_ALIAS, 'LatestDate', row, 'Latest Date')), str(getValWithOverrides(MMR_ALIAS, 'City', row)), str(getValWithOverrides(MMR_ALIAS, 'State', row)), str(getValWithOverrides(MMR_ALIAS, 'Status', row)), str(getValWithOverrides(MMR_ALIAS, 'FinancingStatus', row, 'Financing Status')), str(getValWithOverrides(MMR_ALIAS, 'ProductType', row, 'Product Type')), num(getValWithOverrides(MMR_ALIAS, 'Units', row)), str(getValWithOverrides(MMR_ALIAS, 'FullAddress', row, 'Full Address')), num(getValWithOverrides(MMR_ALIAS, 'Latitude', row)), num(getValWithOverrides(MMR_ALIAS, 'Longitude', row)), str(getValWithOverrides(MMR_ALIAS, 'Region', row)), str(getValWithOverrides(MMR_ALIAS, 'LatestConstructionStatus', row, 'Latest Construction Status')), num(getValWithOverrides(MMR_ALIAS, 'BirthOrder', row, 'Birth Order')), num(getValWithOverrides(MMR_ALIAS, 'NetLsd', row, 'Net LSD')),
    ], replace, MMR_KEYS);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- UnitByUnitTradeout ----------
const UTRADE_ALIAS = 'unitbyunittradeout';
const T_UTRADE = `${LEASING_SCHEMA}.UnitByUnitTradeout`;
const UTRADE_COLS = ['FloorPlan', 'UnitDetailsUnitType', 'UnitDetailsBuilding', 'UnitDetailsUnit', 'UnitDetailsSqFt', 'CurrentLeaseRateType', 'CurrentLeaseLeaseType', 'CurrentLeaseAppSignedDate', 'CurrentLeaseLeaseStart', 'CurrentLeaseLeaseEnd', 'CurrentLeaseTerm', 'CurrentLeasePrem', 'CurrentLeaseGrossRent', 'CurrentLeaseConc', 'CurrentLeaseEffRent', 'PreviousLeaseRateType', 'PreviousLeaseLeaseStart', 'PreviousLeaseScheduledLeaseEnd', 'PreviousLeaseActualLeaseEnd', 'PreviousLeaseTerm', 'PreviousLeasePrem', 'PreviousLeaseGrossRent', 'PreviousLeaseConc', 'PreviousLeaseEffRent', 'VacantDays', 'TermVariance', 'TradeOutPercentage', 'TradeOutAmount', 'ReportDate', 'JoinDate', 'MonthOf', 'Property', 'City', 'State', 'Status', 'Units', 'FullAddress', 'Latitude', 'Longitude', 'Region', 'ConstructionStatus', 'BirthOrder'];
const UTRADE_KEYS = ['Property', 'UnitDetailsBuilding', 'UnitDetailsUnit', 'ReportDate'];
export async function syncUnitByUnitTradeout(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_UTRADE, UTRADE_COLS, rows, (row) => [
      str(getValWithOverrides(UTRADE_ALIAS, 'FloorPlan', row, 'Floor Plan', 'FloorPlanName')),
      str(getValWithOverrides(UTRADE_ALIAS, 'UnitDetailsUnitType', row, 'Unit Type', 'UnitDetails UnitType', 'Unit Type Details')),
      str(getValWithOverrides(UTRADE_ALIAS, 'UnitDetailsBuilding', row, 'Building', 'UnitDetails Building', 'Unit Building')),
      str(getValWithOverrides(UTRADE_ALIAS, 'UnitDetailsUnit', row, 'Unit', 'Unit Number', 'Unit #', 'UnitDetails Unit')),
      num(getValWithOverrides(UTRADE_ALIAS, 'UnitDetailsSqFt', row, 'Sq Ft', 'Square Feet', 'UnitDetails SqFt', 'SqFt')),
      str(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeaseRateType', row, 'Current Lease Rate Type', 'Rate Type', 'Lease Rate Type')),
      str(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeaseLeaseType', row, 'Current Lease Lease Type', 'Lease Type', 'Current Lease Type')),
      str(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeaseAppSignedDate', row, 'App Signed Date', 'Application Signed Date', 'Current Lease App Signed Date')),
      str(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeaseLeaseStart', row, 'Lease Start', 'Current Lease Start', 'Current Lease Lease Start')),
      str(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeaseLeaseEnd', row, 'Lease End', 'Current Lease End', 'Current Lease Lease End')),
      num(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeaseTerm', row, 'Current Lease Term', 'Term', 'Lease Term')),
      num(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeasePrem', row, 'Premium', 'Prem')),
      num(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeaseGrossRent', row, 'Current Lease Gross Rent', 'Gross Rent', 'GrossRent')),
      num(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeaseConc', row, 'Current Lease Conc', 'Concession', 'Conc')),
      num(getValWithOverrides(UTRADE_ALIAS, 'CurrentLeaseEffRent', row, 'Effective Rent', 'Eff Rent', 'EffRent')),
      str(getValWithOverrides(UTRADE_ALIAS, 'PreviousLeaseRateType', row, 'Previous Lease Rate Type', 'Prev Rate Type')),
      str(getValWithOverrides(UTRADE_ALIAS, 'PreviousLeaseLeaseStart', row, 'Previous Lease Start', 'Previous Lease Lease Start')),
      str(getValWithOverrides(UTRADE_ALIAS, 'PreviousLeaseScheduledLeaseEnd', row, 'Previous Lease Scheduled Lease End', 'Scheduled Lease End', 'Prev Scheduled End')),
      str(getValWithOverrides(UTRADE_ALIAS, 'PreviousLeaseActualLeaseEnd', row, 'Previous Lease Actual Lease End', 'Actual Lease End', 'Prev Actual End')),
      num(getValWithOverrides(UTRADE_ALIAS, 'PreviousLeaseTerm', row, 'Previous Lease Term', 'Prev Term')),
      num(getValWithOverrides(UTRADE_ALIAS, 'PreviousLeasePrem', row, 'Previous Lease Prem', 'Prev Prem')),
      num(getValWithOverrides(UTRADE_ALIAS, 'PreviousLeaseGrossRent', row, 'Previous Lease Gross Rent', 'Prev Gross Rent')),
      num(getValWithOverrides(UTRADE_ALIAS, 'PreviousLeaseConc', row, 'Previous Lease Conc', 'Prev Conc')),
      num(getValWithOverrides(UTRADE_ALIAS, 'PreviousLeaseEffRent', row, 'Previous Lease Eff Rent', 'Prev Eff Rent')),
      num(getValWithOverrides(UTRADE_ALIAS, 'VacantDays', row, 'Vacant Days', 'Days Vacant')),
      num(getValWithOverrides(UTRADE_ALIAS, 'TermVariance', row, 'Term Variance', 'Term Var')),
      num(getValWithOverrides(UTRADE_ALIAS, 'TradeOutPercentage', row, 'Trade Out Percentage', 'Trade Out %', 'TradeOut %')),
      num(getValWithOverrides(UTRADE_ALIAS, 'TradeOutAmount', row, 'Trade Out Amount', 'Trade Out Amt')),
      str(getValWithOverrides(UTRADE_ALIAS, 'ReportDate', row, 'Report Date', 'Report date')),
      str(getValWithOverrides(UTRADE_ALIAS, 'JoinDate', row, 'Join Date', 'Join date')),
      str(getValWithOverrides(UTRADE_ALIAS, 'MonthOf', row, 'Month Of', 'Month', 'MonthOf')),
      str(getValWithOverrides(UTRADE_ALIAS, 'Property', row, 'Property Name', 'Location', 'PropertyName')),
      str(getValWithOverrides(UTRADE_ALIAS, 'City', row, 'Property City')),
      str(getValWithOverrides(UTRADE_ALIAS, 'State', row, 'Property State')),
      str(getValWithOverrides(UTRADE_ALIAS, 'Status', row, 'Property Status', 'Construction Status')),
      num(getValWithOverrides(UTRADE_ALIAS, 'Units', row, 'Total Units', 'Unit Count', 'TotalUnits')),
      str(getValWithOverrides(UTRADE_ALIAS, 'FullAddress', row, 'Full Address', 'Address')),
      num(getValWithOverrides(UTRADE_ALIAS, 'Latitude', row, 'Lat')),
      num(getValWithOverrides(UTRADE_ALIAS, 'Longitude', row, 'Long', 'Lng')),
      str(getValWithOverrides(UTRADE_ALIAS, 'Region', row, 'Property Region')),
      str(getValWithOverrides(UTRADE_ALIAS, 'ConstructionStatus', row, 'Construction Status', 'Status Construction')),
      num(getValWithOverrides(UTRADE_ALIAS, 'BirthOrder', row, 'Birth Order', 'BirthOrder')),
    ], replace, UTRADE_KEYS);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- PortfolioUnitDetails ----------
const T_PUD = `${LEASING_SCHEMA}.PortfolioUnitDetails`;
const PUD_COLS = ['Property', 'UnitNumber', 'FloorPlan', 'UnitDesignation', 'SQFT', 'UnitLeaseStatus', 'ResidentNameExternalTenantID', 'LeaseID', 'MoveIn', 'Notice', 'MoveOut', 'DaysVacant', 'MakeReady', 'MakeReadyDaystoComplete', 'LeaseStart', 'Leaseend', 'ApplicationDate', 'LeaseType', 'MarketRent', 'LeaseRent', 'EffectiveRent', 'Concession', 'SubsidyRent', 'Amenities', 'TotalBilling', 'UnitText', 'firstFloorDesignator', 'floor', 'ReportDate', 'BATCHLASTRUN'];
const PUD_KEYS = ['Property', 'UnitNumber', 'ReportDate'];
const PUD_ALIAS = 'portfolioUnitDetails';
export async function syncPortfolioUnitDetails(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_PUD, PUD_COLS, rows, (row) => [
      str(getValWithOverrides(PUD_ALIAS, 'Property', row, 'Property Name', 'PropertyName', 'Community', 'Asset', 'Location')),
      str(getValWithOverrides(PUD_ALIAS, 'UnitNumber', row, 'Unit Number', 'Unit #', 'Unit', 'Bldg Unit', 'Unit No', 'UnitText')),
      str(getValWithOverrides(PUD_ALIAS, 'FloorPlan', row, 'Floor Plan', 'FloorPlanName', 'Plan', 'Unit Type')),
      str(getValWithOverrides(PUD_ALIAS, 'UnitDesignation', row, 'Unit Designation', 'Designation')),
      num(getValWithOverrides(PUD_ALIAS, 'SQFT', row, 'Sq Ft', 'Square Feet', 'SqFt', 'SF')),
      str(getValWithOverrides(PUD_ALIAS, 'UnitLeaseStatus', row, 'Unit Lease Status', 'Lease Status', 'Status', 'Unit Status')),
      str(getValWithOverrides(PUD_ALIAS, 'ResidentNameExternalTenantID', row, 'Resident Name', 'External Tenant ID', 'Tenant ID', 'Resident', 'Tenant')),
      str(getValWithOverrides(PUD_ALIAS, 'LeaseID', row, 'Lease ID', 'Lease Id', 'Lease Number')),
      str(getValWithOverrides(PUD_ALIAS, 'MoveIn', row, 'Move In', 'Move-In', 'Move In Date', 'MoveIn Date')),
      str(getValWithOverrides(PUD_ALIAS, 'Notice', row, 'Notice Date', 'Notice To Vacate', 'Notice Date To Vacate')),
      str(getValWithOverrides(PUD_ALIAS, 'MoveOut', row, 'Move Out', 'Move-Out', 'Move Out Date', 'MoveOut Date')),
      num(getValWithOverrides(PUD_ALIAS, 'DaysVacant', row, 'Days Vacant', 'Vacant Days', 'Days Vacancy')),
      str(getValWithOverrides(PUD_ALIAS, 'MakeReady', row, 'Make Ready', 'Make-Ready', 'Make Ready Date')),
      num(getValWithOverrides(PUD_ALIAS, 'MakeReadyDaystoComplete', row, 'Make Ready Days to Complete', 'Days to Complete', 'MakeReady Days')),
      str(getValWithOverrides(PUD_ALIAS, 'LeaseStart', row, 'Lease Start', 'Lease Start Date')),
      str(getValWithOverrides(PUD_ALIAS, 'Leaseend', row, 'Lease End', 'Lease End Date', 'Lease End')),
      str(getValWithOverrides(PUD_ALIAS, 'ApplicationDate', row, 'Application Date', 'App Date', 'Application Signed Date')),
      str(getValWithOverrides(PUD_ALIAS, 'LeaseType', row, 'Lease Type', 'Type')),
      num(getValWithOverrides(PUD_ALIAS, 'MarketRent', row, 'Market Rent', 'Market')),
      num(getValWithOverrides(PUD_ALIAS, 'LeaseRent', row, 'Lease Rent', 'Rent')),
      num(getValWithOverrides(PUD_ALIAS, 'EffectiveRent', row, 'Effective Rent', 'Eff Rent', 'EffRent')),
      num(getValWithOverrides(PUD_ALIAS, 'Concession', row, 'Concessions')),
      num(getValWithOverrides(PUD_ALIAS, 'SubsidyRent', row, 'Subsidy Rent', 'Subsidy')),
      str(getValWithOverrides(PUD_ALIAS, 'Amenities', row, 'Amenity')),
      num(getValWithOverrides(PUD_ALIAS, 'TotalBilling', row, 'Total Billing', 'Billing')),
      str(getValWithOverrides(PUD_ALIAS, 'UnitText', row, 'Unit Text', 'Unit', 'UnitNumber', 'Unit Number', 'Unit #')),
      str(getValWithOverrides(PUD_ALIAS, 'firstFloorDesignator', row, 'First Floor Designator', 'Floor Designator', 'FirstFloorDesignator')),
      str(getValWithOverrides(PUD_ALIAS, 'floor', row, 'Floor')),
      str(getValWithOverrides(PUD_ALIAS, 'ReportDate', row, 'Report Date', 'Date', 'As Of Date')),
      str(getValWithOverrides(PUD_ALIAS, 'BATCHLASTRUN', row, 'Batch Last Run', 'Batch Timestamp', 'Last Run')),
    ], replace, PUD_KEYS);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- Units ----------
const UNITS_ALIAS = 'units';
const T_UNITS = `${LEASING_SCHEMA}.Units`;
const UNITS_COLS = ['PropertyName', 'FloorPlan', 'UnitType', 'BldgUnit', 'SqFt', 'Features', 'Condition', 'Vacated', 'DateAvailable', 'BestPriceTerm', 'Monthlygrossrent', 'Concessions', 'MonthlyEffectiveRent', 'PreviousLeaseTerm', 'PreviousLeaseMonthlyEffectiveRent', 'GrossForecastedTradeout', 'ReportDate'];
const UNITS_KEYS = ['PropertyName', 'BldgUnit', 'ReportDate'];
export async function syncUnits(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_UNITS, UNITS_COLS, rows, (row) => [
      str(getValWithOverrides(UNITS_ALIAS, 'PropertyName', row, 'Property', 'Property Name', 'Location')),
      str(getValWithOverrides(UNITS_ALIAS, 'FloorPlan', row, 'Floor Plan', 'FloorPlanName', 'Plan')),
      str(getValWithOverrides(UNITS_ALIAS, 'UnitType', row, 'Unit Type', 'UnitDetailsUnitType', 'Type')),
      str(getValWithOverrides(UNITS_ALIAS, 'BldgUnit', row, 'Bldg Unit', 'Unit', 'Unit #', 'Unit Number', 'Building Unit')),
      num(getValWithOverrides(UNITS_ALIAS, 'SqFt', row, 'Sq Ft', 'Square Feet', 'SqFt', 'SF')),
      str(getValWithOverrides(UNITS_ALIAS, 'Features', row, 'Unit Features', 'Feature', 'Amenities')),
      str(getValWithOverrides(UNITS_ALIAS, 'Condition', row, 'Status', 'Unit Status', 'Unit Condition', 'Lease Status')),
      str(getValWithOverrides(UNITS_ALIAS, 'Vacated', row, 'Vacated Date', 'Move Out', 'Move Out Date')),
      str(getValWithOverrides(UNITS_ALIAS, 'DateAvailable', row, 'Date Available', 'Available Date', 'Available', 'Available On')),
      str(getValWithOverrides(UNITS_ALIAS, 'BestPriceTerm', row, 'Best Price Term', 'Best Term', 'Term')),
      num(getValWithOverrides(UNITS_ALIAS, 'Monthlygrossrent', row, 'Monthly Gross Rent', 'Gross Rent', 'Rent', 'Monthly Rent')),
      str(getValWithOverrides(UNITS_ALIAS, 'Concessions', row, 'Concession')),
      num(getValWithOverrides(UNITS_ALIAS, 'MonthlyEffectiveRent', row, 'Monthly Effective Rent', 'Effective Rent', 'Eff Rent')),
      num(getValWithOverrides(UNITS_ALIAS, 'PreviousLeaseTerm', row, 'Previous Lease Term', 'Prev Lease Term')),
      num(getValWithOverrides(UNITS_ALIAS, 'PreviousLeaseMonthlyEffectiveRent', row, 'Previous Lease Monthly Effective Rent', 'Prev Eff Rent', 'Previous Eff Rent')),
      num(getValWithOverrides(UNITS_ALIAS, 'GrossForecastedTradeout', row, 'Gross Forecasted Tradeout', 'Forecasted Tradeout', 'Tradeout')),
      str(getValWithOverrides(UNITS_ALIAS, 'ReportDate', row, 'Report Date', 'Report date')),
    ], replace, UNITS_KEYS);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- UnitMix ----------
const UNITMIX_ALIAS = 'unitmix';
const T_UNITMIX = `${LEASING_SCHEMA}.UnitMix`;
const UNITMIX_COLS = ['PropertyName', 'UnitType', 'TotalUnits', 'SquareFeet', 'PercentOccupied', 'percentLeased', 'GrossOfferedRent30days', 'GrossInPlaceRent', 'GrossRecentExecutedRent60days', 'GrossOfferedRentPSF', 'GrossRecentExecutedRentPSF', 'ReportDate', 'FloorPlan'];
const UNITMIX_KEYS = ['PropertyName', 'FloorPlan', 'ReportDate'];
export async function syncUnitMix(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_UNITMIX, UNITMIX_COLS, rows, (row) => [
      str(getValWithOverrides(UNITMIX_ALIAS, 'PropertyName', row, 'Property', 'Property Name', 'Location')),
      str(getValWithOverrides(UNITMIX_ALIAS, 'UnitType', row, 'Unit Type', 'Floor Plan Type')),
      num(getValWithOverrides(UNITMIX_ALIAS, 'TotalUnits', row, 'Total Units', 'Units')),
      num(getValWithOverrides(UNITMIX_ALIAS, 'SquareFeet', row, 'Square Feet', 'Sq Ft', 'SqFt')),
      num(getValWithOverrides(UNITMIX_ALIAS, 'PercentOccupied', row, 'Percent Occupied', '% Occupied', 'Occupied %')),
      num(getValWithOverrides(UNITMIX_ALIAS, 'percentLeased', row, 'Percent Leased', '% Leased', 'percent Leased')),
      num(getValWithOverrides(UNITMIX_ALIAS, 'GrossOfferedRent30days', row, 'Gross Offered Rent 30 days', 'Gross Offered Rent 30 Days', 'Offered Rent 30d')),
      num(getValWithOverrides(UNITMIX_ALIAS, 'GrossInPlaceRent', row, 'Gross In Place Rent', 'In Place Rent', 'In-Place Rent')),
      num(getValWithOverrides(UNITMIX_ALIAS, 'GrossRecentExecutedRent60days', row, 'Gross Recent Executed Rent 60 days', 'Recent Executed Rent 60d', 'Executed Rent 60d')),
      num(getValWithOverrides(UNITMIX_ALIAS, 'GrossOfferedRentPSF', row, 'Gross Offered Rent PSF', 'Offered Rent PSF', 'Offered $/SF')),
      num(getValWithOverrides(UNITMIX_ALIAS, 'GrossRecentExecutedRentPSF', row, 'Gross Recent Executed Rent PSF', 'Recent Executed Rent PSF', 'Executed $/SF')),
      str(getValWithOverrides(UNITMIX_ALIAS, 'ReportDate', row, 'Report Date', 'Report date')),
      str(getValWithOverrides(UNITMIX_ALIAS, 'FloorPlan', row, 'Floor Plan', 'FloorPlanName')),
    ], replace, UNITMIX_KEYS);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- Pricing ----------
const PRICING_ALIAS = 'pricing';
const T_PRICING = `${LEASING_SCHEMA}.Pricing`;
const PRICING_COLS = ['Property', 'FloorPlan', 'RateType', 'PostDate', 'EndDate', 'DaysLeft', 'CapacityActualUnits', 'CapacitySustainablePercentage', 'CapacitySustainableUnits', 'CurrentInPlaceLeases', 'CurrentInPlaceOcc', 'CurrentForecastLeases', 'CurrentForecastOcc', 'RecommendedForecastLeases', 'RecommendedForecastOcc', 'RecommendedForecastChg', 'YesterdayDate', 'YesterdayRent', 'YesterdayPercentage', 'AmenityNormModelRent', 'AmenityNormAmenAdj', 'RecommendationsRecommendedEffRent', 'RecommendationsRecommendedEffPercentage', 'RecommendationsChangeRent', 'RecommendationsChangeRev', 'RecommendationsRecentAvgEffRent', 'RecommendationsRecentAvgEffPercentage'];
const PRICING_KEYS = ['Property', 'FloorPlan', 'RateType', 'PostDate'];
export async function syncPricing(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_PRICING, PRICING_COLS, rows, (row) => [
      str(getValWithOverrides(PRICING_ALIAS, 'Property', row)),
      str(getValWithOverrides(PRICING_ALIAS, 'FloorPlan', row, 'Floor Plan')),
      str(getValWithOverrides(PRICING_ALIAS, 'RateType', row, 'Rate Type')),
      str(getValWithOverrides(PRICING_ALIAS, 'PostDate', row, 'Post Date')),
      str(getValWithOverrides(PRICING_ALIAS, 'EndDate', row, 'End Date')),
      num(getValWithOverrides(PRICING_ALIAS, 'DaysLeft', row, 'Days Left')),
      num(getValWithOverrides(PRICING_ALIAS, 'CapacityActualUnits', row, 'Capacity - Actual Units')),
      num(getValWithOverrides(PRICING_ALIAS, 'CapacitySustainablePercentage', row, 'Capacity - Sustainable Percentage', 'Capacity - Sustainable %')),
      num(getValWithOverrides(PRICING_ALIAS, 'CapacitySustainableUnits', row, 'Capacity - Sustainable Units')),
      num(getValWithOverrides(PRICING_ALIAS, 'CurrentInPlaceLeases', row, 'Current In Place Leases')),
      num(getValWithOverrides(PRICING_ALIAS, 'CurrentInPlaceOcc', row, 'Current In Place Occ')),
      num(getValWithOverrides(PRICING_ALIAS, 'CurrentForecastLeases', row, 'Current Forecast Leases')),
      num(getValWithOverrides(PRICING_ALIAS, 'CurrentForecastOcc', row, 'Current Forecast Occ')),
      num(getValWithOverrides(PRICING_ALIAS, 'RecommendedForecastLeases', row, 'Recommended Forecast Leases')),
      num(getValWithOverrides(PRICING_ALIAS, 'RecommendedForecastOcc', row, 'Recommended Forecast Occ')),
      num(getValWithOverrides(PRICING_ALIAS, 'RecommendedForecastChg', row, 'Recommended Forecast Chg')),
      str(getValWithOverrides(PRICING_ALIAS, 'YesterdayDate', row, 'Yesterday Date')),
      num(getValWithOverrides(PRICING_ALIAS, 'YesterdayRent', row, 'Yesterday Rent')),
      num(getValWithOverrides(PRICING_ALIAS, 'YesterdayPercentage', row, 'Yesterday Percentage')),
      num(getValWithOverrides(PRICING_ALIAS, 'AmenityNormModelRent', row, 'Amenity Norm Model Rent')),
      num(getValWithOverrides(PRICING_ALIAS, 'AmenityNormAmenAdj', row, 'Amenity Norm Amen Adj')),
      num(getValWithOverrides(PRICING_ALIAS, 'RecommendationsRecommendedEffRent', row, 'Recommendations - Recommended Eff Rent')),
      num(getValWithOverrides(PRICING_ALIAS, 'RecommendationsRecommendedEffPercentage', row, 'Recommendations - Recommended Eff Percentage')),
      num(getValWithOverrides(PRICING_ALIAS, 'RecommendationsChangeRent', row, 'Recommendations - Change Rent')),
      num(getValWithOverrides(PRICING_ALIAS, 'RecommendationsChangeRev', row, 'Recommendations - Change Rev')),
      num(getValWithOverrides(PRICING_ALIAS, 'RecommendationsRecentAvgEffRent', row, 'Recommendations - Recent Avg Eff Rent')),
      num(getValWithOverrides(PRICING_ALIAS, 'RecommendationsRecentAvgEffPercentage', row, 'Recommendations - Recent Avg Eff Percentage')),
    ], replace, PRICING_KEYS);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- RecentRents ----------
const RECENTS_ALIAS = 'recentrents';
const T_RECENTS = `${LEASING_SCHEMA}.RecentRents`;
const RECENTS_COLS = ['Property', 'FloorPlan', 'ApplicationDate', 'EffectiveDate', 'LeaseStart', 'LeaseEnd', 'GrossRent', 'EffectiveRent', 'ReportDate'];
const RECENTS_KEYS = ['Property', 'FloorPlan', 'ApplicationDate', 'LeaseStart', 'LeaseEnd'];
export async function syncRecentRents(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_RECENTS, RECENTS_COLS, rows, (row) => [
      str(getValWithOverrides(RECENTS_ALIAS, 'Property', row)),
      str(getValWithOverrides(RECENTS_ALIAS, 'FloorPlan', row)),
      str(getValWithOverrides(RECENTS_ALIAS, 'ApplicationDate', row)),
      str(getValWithOverrides(RECENTS_ALIAS, 'EffectiveDate', row)),
      str(getValWithOverrides(RECENTS_ALIAS, 'LeaseStart', row)),
      str(getValWithOverrides(RECENTS_ALIAS, 'LeaseEnd', row)),
      num(getValWithOverrides(RECENTS_ALIAS, 'GrossRent', row)),
      num(getValWithOverrides(RECENTS_ALIAS, 'EffectiveRent', row, 'ActualEffectiveRent')),
      str(getValWithOverrides(RECENTS_ALIAS, 'ReportDate', row)),
    ], replace, RECENTS_KEYS);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- GetAll for dashboard (strip Id, SyncedAt for Domo-shaped rows) ----------
function toRecord(recordset: sql.IRecordSet<unknown>): Record<string, unknown>[] {
  return recordset.map((row: unknown) => {
    const r = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(r)) {
      if (key === 'Id' || key === 'SyncedAt') continue;
      const v = r[key];
      if (v instanceof Date) out[key] = v.toISOString();
      else out[key] = v;
    }
    return out;
  });
}

export async function getAllLeasing(): Promise<Record<string, unknown>[]> {
  const pool = await getConnection();
  const r = await pool.request().query(`SELECT * FROM ${T_LEASING}`);
  return toRecord(r.recordset).map((row) => {
    const out = { ...row };
    (out as Record<string, unknown>)['7DayLeasingVelocity'] = row.LeasingVelocity7Day;
    (out as Record<string, unknown>)['28DayLeasingVelocity'] = row.LeasingVelocity28Day;
    return out;
  });
}

export async function getAllMMRData(): Promise<Record<string, unknown>[]> {
  const pool = await getConnection();
  const r = await pool.request().query(`SELECT * FROM ${T_MMR}`);
  return toRecord(r.recordset);
}

export async function getAllUnitByUnitTradeout(): Promise<Record<string, unknown>[]> {
  const pool = await getConnection();
  const r = await pool.request().query(`SELECT * FROM ${T_UTRADE}`);
  return toRecord(r.recordset);
}

export async function getAllPortfolioUnitDetails(): Promise<Record<string, unknown>[]> {
  const pool = await getConnection();
  const r = await pool.request().query(`SELECT * FROM ${T_PUD}`);
  return toRecord(r.recordset);
}

export async function getAllUnits(): Promise<Record<string, unknown>[]> {
  const pool = await getConnection();
  const r = await pool.request().query(`SELECT * FROM ${T_UNITS}`);
  return toRecord(r.recordset);
}

export async function getAllUnitMix(): Promise<Record<string, unknown>[]> {
  const pool = await getConnection();
  const r = await pool.request().query(`SELECT * FROM ${T_UNITMIX}`);
  return toRecord(r.recordset);
}

export async function getAllPricing(): Promise<Record<string, unknown>[]> {
  const pool = await getConnection();
  const r = await pool.request().query(`SELECT * FROM ${T_PRICING}`);
  return toRecord(r.recordset);
}

export async function getAllRecentRents(): Promise<Record<string, unknown>[]> {
  const pool = await getConnection();
  const r = await pool.request().query(`SELECT * FROM ${T_RECENTS}`);
  return toRecord(r.recordset);
}

export interface LeasingDashboardRaw {
  leasing: Record<string, unknown>[];
  mmrRows: Record<string, unknown>[];
  utradeRows: Record<string, unknown>[];
  portfolioUnitDetails: Record<string, unknown>[];
  units: Record<string, unknown>[];
  unitmix: Record<string, unknown>[];
  pricing: Record<string, unknown>[];
  recents: Record<string, unknown>[];
}

export async function getAllForDashboard(): Promise<LeasingDashboardRaw> {
  const [leasing, mmrRows, utradeRows, portfolioUnitDetails, units, unitmix, pricing, recents] = await Promise.all([
    getAllLeasing(),
    getAllMMRData(),
    getAllUnitByUnitTradeout(),
    getAllPortfolioUnitDetails(),
    getAllUnits(),
    getAllUnitMix(),
    getAllPricing(),
    getAllRecentRents(),
  ]);
  return {
    leasing,
    mmrRows,
    utradeRows,
    portfolioUnitDetails,
    units,
    unitmix,
    pricing,
    recents,
  };
}

// ---------- DashboardSnapshot (pre-computed payload) ----------
const T_SNAPSHOT = `${LEASING_SCHEMA}.DashboardSnapshot`;
const SNAPSHOT_ID = 1;

export async function getDashboardSnapshot(): Promise<{ payload: string; builtAt: Date } | null> {
  const pool = await getConnection();
  const r = await pool
    .request()
    .input('id', sql.Int, SNAPSHOT_ID)
    .query(`SELECT Payload, BuiltAt FROM ${T_SNAPSHOT} WHERE Id = @id`);
  if (r.recordset.length === 0 || r.recordset[0].Payload == null) return null;
  return {
    payload: String(r.recordset[0].Payload),
    builtAt: r.recordset[0].BuiltAt as Date,
  };
}

export async function upsertDashboardSnapshot(payloadJson: string): Promise<void> {
  const pool = await getConnection();
  const now = new Date();
  await pool
    .request()
    .input('id', sql.Int, SNAPSHOT_ID)
    .input('payload', sql.NVarChar(2147483647), payloadJson)
    .input('builtAt', sql.DateTime2, now)
    .query(`
      MERGE ${T_SNAPSHOT} AS t
      USING (SELECT @id AS Id) AS s ON t.Id = s.Id
      WHEN MATCHED THEN UPDATE SET Payload = @payload, BuiltAt = @builtAt
      WHEN NOT MATCHED THEN INSERT (Id, Payload, BuiltAt) VALUES (@id, @payload, @builtAt);
    `);
}

// ---------- CRUD: get by id ----------
export async function getLeasingById(id: number): Promise<Record<string, unknown> | null> {
  const pool = await getConnection();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${T_LEASING} WHERE Id = @id`);
  if (r.recordset.length === 0) return null;
  const row = r.recordset[0] as Record<string, unknown>;
  const out = { ...row };
  (out as Record<string, unknown>)['7DayLeasingVelocity'] = row.LeasingVelocity7Day;
  (out as Record<string, unknown>)['28DayLeasingVelocity'] = row.LeasingVelocity28Day;
  return out;
}

export async function getMMRDataById(id: number): Promise<Record<string, unknown> | null> {
  const pool = await getConnection();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${T_MMR} WHERE Id = @id`);
  return r.recordset.length === 0 ? null : (r.recordset[0] as Record<string, unknown>);
}

export async function getUnitByUnitTradeoutById(id: number): Promise<Record<string, unknown> | null> {
  const pool = await getConnection();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${T_UTRADE} WHERE Id = @id`);
  return r.recordset.length === 0 ? null : (r.recordset[0] as Record<string, unknown>);
}

export async function getPortfolioUnitDetailsById(id: number): Promise<Record<string, unknown> | null> {
  const pool = await getConnection();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${T_PUD} WHERE Id = @id`);
  return r.recordset.length === 0 ? null : (r.recordset[0] as Record<string, unknown>);
}

export async function getUnitsById(id: number): Promise<Record<string, unknown> | null> {
  const pool = await getConnection();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${T_UNITS} WHERE Id = @id`);
  return r.recordset.length === 0 ? null : (r.recordset[0] as Record<string, unknown>);
}

export async function getUnitMixById(id: number): Promise<Record<string, unknown> | null> {
  const pool = await getConnection();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${T_UNITMIX} WHERE Id = @id`);
  return r.recordset.length === 0 ? null : (r.recordset[0] as Record<string, unknown>);
}

export async function getPricingById(id: number): Promise<Record<string, unknown> | null> {
  const pool = await getConnection();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${T_PRICING} WHERE Id = @id`);
  return r.recordset.length === 0 ? null : (r.recordset[0] as Record<string, unknown>);
}

export async function getRecentRentsById(id: number): Promise<Record<string, unknown> | null> {
  const pool = await getConnection();
  const r = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${T_RECENTS} WHERE Id = @id`);
  return r.recordset.length === 0 ? null : (r.recordset[0] as Record<string, unknown>);
}

// ---------- CRUD: create / update / delete (Leasing) ----------
export async function createLeasing(row: Record<string, unknown>): Promise<{ id: number }> {
  const pool = await getConnection();
  const r = await pool
    .request()
    .input('Property', sql.NVarChar(255), str(getVal(row, 'Property')))
    .input('Units', sql.Int, num(getVal(row, 'Units')))
    .input('LeasesNeeded', sql.Int, num(getVal(row, 'LeasesNeeded')))
    .input('NewLeasesCurrentGrossRent', sql.Float, num(getVal(row, 'NewLeasesCurrentGrossRent')))
    .input('LeasingVelocity7Day', sql.Float, num(getVal(row, '7DayLeasingVelocity', '7-Day Leasing Velocity')))
    .input('LeasingVelocity28Day', sql.Float, num(getVal(row, '28DayLeasingVelocity', '28-Day Leasing Velocity')))
    .input('MonthOf', sql.NVarChar(50), str(getVal(row, 'MonthOf')))
    .input('BatchTimestamp', sql.NVarChar(100), str(getVal(row, 'BatchTimestamp')))
    .query(
      `INSERT INTO ${T_LEASING} (Property, Units, LeasesNeeded, NewLeasesCurrentGrossRent, LeasingVelocity7Day, LeasingVelocity28Day, MonthOf, BatchTimestamp) OUTPUT INSERTED.Id VALUES (@Property, @Units, @LeasesNeeded, @NewLeasesCurrentGrossRent, @LeasingVelocity7Day, @LeasingVelocity28Day, @MonthOf, @BatchTimestamp)`
    );
  const id = (r.recordset[0] as { Id: number }).Id;
  return { id };
}

export async function updateLeasing(id: number, row: Record<string, unknown>): Promise<boolean> {
  const pool = await getConnection();
  const r = await pool
    .request()
    .input('id', sql.Int, id)
    .input('Property', sql.NVarChar(255), str(getVal(row, 'Property')))
    .input('Units', sql.Int, num(getVal(row, 'Units')))
    .input('LeasesNeeded', sql.Int, num(getVal(row, 'LeasesNeeded')))
    .input('NewLeasesCurrentGrossRent', sql.Float, num(getVal(row, 'NewLeasesCurrentGrossRent')))
    .input('LeasingVelocity7Day', sql.Float, num(getVal(row, '7DayLeasingVelocity', '7-Day Leasing Velocity')))
    .input('LeasingVelocity28Day', sql.Float, num(getVal(row, '28DayLeasingVelocity', '28-Day Leasing Velocity')))
    .input('MonthOf', sql.NVarChar(50), str(getVal(row, 'MonthOf')))
    .input('BatchTimestamp', sql.NVarChar(100), str(getVal(row, 'BatchTimestamp')))
    .query(
      `UPDATE ${T_LEASING} SET Property=@Property, Units=@Units, LeasesNeeded=@LeasesNeeded, NewLeasesCurrentGrossRent=@NewLeasesCurrentGrossRent, LeasingVelocity7Day=@LeasingVelocity7Day, LeasingVelocity28Day=@LeasingVelocity28Day, MonthOf=@MonthOf, BatchTimestamp=@BatchTimestamp WHERE Id=@id`
    );
  return (r.rowsAffected[0] ?? 0) > 0;
}

export async function deleteLeasing(id: number): Promise<boolean> {
  const pool = await getConnection();
  const r = await pool.request().input('id', sql.Int, id).query(`DELETE FROM ${T_LEASING} WHERE Id = @id`);
  return (r.rowsAffected[0] ?? 0) > 0;
}
