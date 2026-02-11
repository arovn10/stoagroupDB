/**
 * Leasing repository: sync (truncate + bulk insert), CRUD, and read-for-dashboard.
 * All tables live in schema [leasing].
 */
import sql from 'mssql';
import crypto from 'crypto';
import { getConnection } from '../config/database';

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

/** Pick value from row by trying alias, column name, or DB column name. */
function getVal(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k) && row[k] !== undefined && row[k] !== '') return row[k];
  }
  return null;
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

/** Run batched INSERT (multi-row VALUES). When replace=true, TRUNCATE first. When replace=false, append only (for chunked uploads). */
async function batchInsert(
  tx: sql.Transaction,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  rowToValues: (row: Record<string, unknown>) => unknown[],
  replace = true
): Promise<number> {
  if (replace) await tx.request().query(`TRUNCATE TABLE ${table}`);
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
const T_LEASING = `${LEASING_SCHEMA}.Leasing`;
const LEASING_COLS = ['Property', 'Units', 'LeasesNeeded', 'NewLeasesCurrentGrossRent', 'LeasingVelocity7Day', 'LeasingVelocity28Day', 'MonthOf', 'BatchTimestamp'];
export async function syncLeasing(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_LEASING, LEASING_COLS, rows, (row) => [
      str(getVal(row, 'Property', 'Property Name', 'PropertyName', 'Community', 'Asset')),
      num(getVal(row, 'Units', 'Total Units', 'Unit Count', 'UnitsCount')),
      num(getVal(row, 'LeasesNeeded', 'Leases Needed', 'Leases needed')),
      num(getVal(row, 'NewLeasesCurrentGrossRent', 'New Leases Current Gross Rent', 'New Leases Gross Rent', 'NewLeasesGrossRent')),
      num(getVal(row, 'LeasingVelocity7Day', '7DayLeasingVelocity', '7-Day Leasing Velocity', '7 Day Leasing Velocity', '7 Day Velocity', 'Leasing Velocity 7 Day')),
      num(getVal(row, 'LeasingVelocity28Day', '28DayLeasingVelocity', '28-Day Leasing Velocity', '28 Day Leasing Velocity', '28 Day Velocity', 'Leasing Velocity 28 Day')),
      str(getVal(row, 'MonthOf', 'Month Of', 'Month', 'Report Month', 'As Of Date', 'AsOfDate', 'ReportDate', 'Date')),
      str(getVal(row, 'BatchTimestamp', 'Batch Timestamp', 'Timestamp', 'SyncedAt')),
    ], replace);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- MMRData ----------
const T_MMR = `${LEASING_SCHEMA}.MMRData`;
const MMR_COLS = ['Property', 'Location', 'TotalUnits', 'OccupancyPercent', 'CurrentLeasedPercent', 'MI', 'MO', 'FirstVisit', 'Applied', 'Canceled', 'Denied', 'T12LeasesExpired', 'T12LeasesRenewed', 'Delinquent', 'OccupiedRent', 'BudgetedRent', 'CurrentMonthIncome', 'BudgetedIncome', 'MoveInRent', 'OccUnits', 'Week3EndDate', 'Week3MoveIns', 'Week3MoveOuts', 'Week3OccUnits', 'Week3OccPercent', 'Week4EndDate', 'Week4MoveIns', 'Week4MoveOuts', 'Week4OccUnits', 'Week4OccPercent', 'Week7EndDate', 'Week7MoveIns', 'Week7MoveOuts', 'Week7OccUnits', 'Week7OccPercent', 'InServiceUnits', 'T12LeaseBreaks', 'BudgetedOccupancyCurrentMonth', 'BudgetedOccupancyPercentCurrentMonth', 'BudgetedLeasedPercentCurrentMonth', 'BudgetedLeasedCurrentMonth', 'ReportDate', 'ConstructionStatus', 'Rank', 'PreviousOccupancyPercent', 'PreviousLeasedPercent', 'PreviousDelinquentUnits', 'WeekStart', 'LatestDate', 'City', 'State', 'Status', 'FinancingStatus', 'ProductType', 'Units', 'FullAddress', 'Latitude', 'Longitude', 'Region', 'LatestConstructionStatus', 'BirthOrder', 'NetLsd'];
export async function syncMMRData(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_MMR, MMR_COLS, rows, (row) => [
      str(getVal(row, 'Property', 'Property Name', 'PropertyName', 'Community', 'Asset')), str(getVal(row, 'Location', 'Property Location', 'Address')),
      num(getVal(row, 'TotalUnits', 'Total Units')), num(getVal(row, 'OccupancyPercent', 'Occupancy Percent', 'Occupancy %')), num(getVal(row, 'CurrentLeasedPercent', 'Current Leased Percent', 'Leased %')),
      num(getVal(row, 'MI')), num(getVal(row, 'MO')), num(getVal(row, 'FirstVisit', '1st Visit', 'First Visit')), num(getVal(row, 'Applied')), num(getVal(row, 'Canceled')), num(getVal(row, 'Denied')), num(getVal(row, 'T12LeasesExpired', 'T12 Leases Expired')), num(getVal(row, 'T12LeasesRenewed', 'T12 Leases Renewed')), num(getVal(row, 'Delinquent')), num(getVal(row, 'OccupiedRent', 'Occupied Rent')), num(getVal(row, 'BudgetedRent', 'Budgeted Rent')), num(getVal(row, 'CurrentMonthIncome', 'Current Month Income')), num(getVal(row, 'BudgetedIncome', 'Budgeted Income')), num(getVal(row, 'MoveInRent', 'Move In Rent')), num(getVal(row, 'OccUnits', 'Occ Units')),
      str(getVal(row, 'Week3EndDate', 'Week 3 End Date', 'Week3 End Date')), num(getVal(row, 'Week3MoveIns', 'Week 3 Move Ins')), num(getVal(row, 'Week3MoveOuts', 'Week 3 Move Outs')), num(getVal(row, 'Week3OccUnits', 'Week 3 Occ Units')), num(getVal(row, 'Week3OccPercent', 'Week 3 Occ Percent')), str(getVal(row, 'Week4EndDate', 'Week 4 End Date')), num(getVal(row, 'Week4MoveIns')), num(getVal(row, 'Week4MoveOuts')), num(getVal(row, 'Week4OccUnits')), num(getVal(row, 'Week4OccPercent')), str(getVal(row, 'Week7EndDate', 'Week 7 End Date')), num(getVal(row, 'Week7MoveIns')), num(getVal(row, 'Week7MoveOuts')), num(getVal(row, 'Week7OccUnits')), num(getVal(row, 'Week7OccPercent')), num(getVal(row, 'InServiceUnits', 'In Service Units')), num(getVal(row, 'T12LeaseBreaks', 'T12 Lease Breaks')), num(getVal(row, 'BudgetedOccupancyCurrentMonth')), num(getVal(row, 'BudgetedOccupancyPercentCurrentMonth')), num(getVal(row, 'BudgetedLeasedPercentCurrentMonth')), num(getVal(row, 'BudgetedLeasedCurrentMonth')),
      str(getVal(row, 'ReportDate', 'Report Date')), str(getVal(row, 'ConstructionStatus', 'Construction Status')), num(getVal(row, 'Rank')), num(getVal(row, 'PreviousOccupancyPercent')), num(getVal(row, 'PreviousLeasedPercent')), num(getVal(row, 'PreviousDelinquentUnits')), str(getVal(row, 'WeekStart', 'Week Start')), str(getVal(row, 'LatestDate', 'Latest Date')), str(getVal(row, 'City')), str(getVal(row, 'State')), str(getVal(row, 'Status')), str(getVal(row, 'FinancingStatus', 'Financing Status')), str(getVal(row, 'ProductType', 'Product Type')), num(getVal(row, 'Units')), str(getVal(row, 'FullAddress', 'Full Address')), num(getVal(row, 'Latitude')), num(getVal(row, 'Longitude')), str(getVal(row, 'Region')), str(getVal(row, 'LatestConstructionStatus', 'Latest Construction Status')), num(getVal(row, 'BirthOrder', 'Birth Order')), num(getVal(row, 'NetLsd', 'Net LSD')),
    ], replace);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- UnitByUnitTradeout ----------
const T_UTRADE = `${LEASING_SCHEMA}.UnitByUnitTradeout`;
const UTRADE_COLS = ['FloorPlan', 'UnitDetailsUnitType', 'UnitDetailsBuilding', 'UnitDetailsUnit', 'UnitDetailsSqFt', 'CurrentLeaseRateType', 'CurrentLeaseLeaseType', 'CurrentLeaseAppSignedDate', 'CurrentLeaseLeaseStart', 'CurrentLeaseLeaseEnd', 'CurrentLeaseTerm', 'CurrentLeasePrem', 'CurrentLeaseGrossRent', 'CurrentLeaseConc', 'CurrentLeaseEffRent', 'PreviousLeaseRateType', 'PreviousLeaseLeaseStart', 'PreviousLeaseScheduledLeaseEnd', 'PreviousLeaseActualLeaseEnd', 'PreviousLeaseTerm', 'PreviousLeasePrem', 'PreviousLeaseGrossRent', 'PreviousLeaseConc', 'PreviousLeaseEffRent', 'VacantDays', 'TermVariance', 'TradeOutPercentage', 'TradeOutAmount', 'ReportDate', 'JoinDate', 'MonthOf', 'Property', 'City', 'State', 'Status', 'Units', 'FullAddress', 'Latitude', 'Longitude', 'Region', 'ConstructionStatus', 'BirthOrder'];
export async function syncUnitByUnitTradeout(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_UTRADE, UTRADE_COLS, rows, (row) => [
      str(getVal(row, 'FloorPlan', 'Floor Plan', 'FloorPlanName')),
      str(getVal(row, 'UnitDetailsUnitType', 'Unit Type', 'UnitDetails UnitType', 'Unit Type Details')),
      str(getVal(row, 'UnitDetailsBuilding', 'Building', 'UnitDetails Building', 'Unit Building')),
      str(getVal(row, 'UnitDetailsUnit', 'Unit', 'Unit Number', 'Unit #', 'UnitDetails Unit')),
      num(getVal(row, 'UnitDetailsSqFt', 'Sq Ft', 'Square Feet', 'UnitDetails SqFt', 'SqFt')),
      str(getVal(row, 'CurrentLeaseRateType', 'Current Lease Rate Type', 'Rate Type', 'Lease Rate Type')),
      str(getVal(row, 'CurrentLeaseLeaseType', 'Current Lease Lease Type', 'Lease Type', 'Current Lease Type')),
      str(getVal(row, 'CurrentLeaseAppSignedDate', 'App Signed Date', 'Application Signed Date', 'Current Lease App Signed Date')),
      str(getVal(row, 'CurrentLeaseLeaseStart', 'Lease Start', 'Current Lease Start', 'Current Lease Lease Start')),
      str(getVal(row, 'CurrentLeaseLeaseEnd', 'Lease End', 'Current Lease End', 'Current Lease Lease End')),
      num(getVal(row, 'CurrentLeaseTerm', 'Current Lease Term', 'Term', 'Lease Term')),
      num(getVal(row, 'CurrentLeasePrem', 'Current Lease Prem', 'Premium', 'Prem')),
      num(getVal(row, 'CurrentLeaseGrossRent', 'Current Lease Gross Rent', 'Gross Rent', 'GrossRent')),
      num(getVal(row, 'CurrentLeaseConc', 'Current Lease Conc', 'Concession', 'Conc')),
      num(getVal(row, 'CurrentLeaseEffRent', 'Current Lease Eff Rent', 'Effective Rent', 'Eff Rent', 'EffRent')),
      str(getVal(row, 'PreviousLeaseRateType', 'Previous Lease Rate Type', 'Prev Rate Type')),
      str(getVal(row, 'PreviousLeaseLeaseStart', 'Previous Lease Start', 'Previous Lease Lease Start')),
      str(getVal(row, 'PreviousLeaseScheduledLeaseEnd', 'Previous Lease Scheduled Lease End', 'Scheduled Lease End', 'Prev Scheduled End')),
      str(getVal(row, 'PreviousLeaseActualLeaseEnd', 'Previous Lease Actual Lease End', 'Actual Lease End', 'Prev Actual End')),
      num(getVal(row, 'PreviousLeaseTerm', 'Previous Lease Term', 'Prev Term')),
      num(getVal(row, 'PreviousLeasePrem', 'Previous Lease Prem', 'Prev Prem')),
      num(getVal(row, 'PreviousLeaseGrossRent', 'Previous Lease Gross Rent', 'Prev Gross Rent')),
      num(getVal(row, 'PreviousLeaseConc', 'Previous Lease Conc', 'Prev Conc')),
      num(getVal(row, 'PreviousLeaseEffRent', 'Previous Lease Eff Rent', 'Prev Eff Rent')),
      num(getVal(row, 'VacantDays', 'Vacant Days', 'Days Vacant')),
      num(getVal(row, 'TermVariance', 'Term Variance', 'Term Var')),
      num(getVal(row, 'TradeOutPercentage', 'Trade Out Percentage', 'Trade Out %', 'TradeOut %')),
      num(getVal(row, 'TradeOutAmount', 'Trade Out Amount', 'Trade Out Amt')),
      str(getVal(row, 'ReportDate', 'Report Date', 'Report date')),
      str(getVal(row, 'JoinDate', 'Join Date', 'Join date')),
      str(getVal(row, 'MonthOf', 'Month Of', 'Month', 'MonthOf')),
      str(getVal(row, 'Property', 'Property Name', 'Location', 'PropertyName')),
      str(getVal(row, 'City', 'Property City')),
      str(getVal(row, 'State', 'Property State')),
      str(getVal(row, 'Status', 'Property Status', 'Construction Status')),
      num(getVal(row, 'Units', 'Total Units', 'Unit Count', 'TotalUnits')),
      str(getVal(row, 'FullAddress', 'Full Address', 'Address')),
      num(getVal(row, 'Latitude', 'Lat')),
      num(getVal(row, 'Longitude', 'Long', 'Lng')),
      str(getVal(row, 'Region', 'Property Region')),
      str(getVal(row, 'ConstructionStatus', 'Construction Status', 'Status Construction')),
      num(getVal(row, 'BirthOrder', 'Birth Order', 'BirthOrder')),
    ], replace);
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
export async function syncPortfolioUnitDetails(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_PUD, PUD_COLS, rows, (row) => [
      str(getVal(row, 'Property')), str(getVal(row, 'UnitNumber')), str(getVal(row, 'FloorPlan')), str(getVal(row, 'UnitDesignation')), num(getVal(row, 'SQFT')), str(getVal(row, 'UnitLeaseStatus')), str(getVal(row, 'ResidentNameExternalTenantID')), str(getVal(row, 'LeaseID')), str(getVal(row, 'MoveIn')), str(getVal(row, 'Notice')), str(getVal(row, 'MoveOut')), num(getVal(row, 'DaysVacant')), str(getVal(row, 'MakeReady')), num(getVal(row, 'MakeReadyDaystoComplete')), str(getVal(row, 'LeaseStart')), str(getVal(row, 'Leaseend')), str(getVal(row, 'ApplicationDate')), str(getVal(row, 'LeaseType')), num(getVal(row, 'MarketRent')), num(getVal(row, 'LeaseRent')), num(getVal(row, 'EffectiveRent')), num(getVal(row, 'Concession')), num(getVal(row, 'SubsidyRent')), str(getVal(row, 'Amenities')), num(getVal(row, 'TotalBilling')), str(getVal(row, 'UnitText')), str(getVal(row, 'firstFloorDesignator')), str(getVal(row, 'floor')), str(getVal(row, 'ReportDate')),       str(getVal(row, 'BATCHLASTRUN')),
    ], replace);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- Units ----------
const T_UNITS = `${LEASING_SCHEMA}.Units`;
const UNITS_COLS = ['PropertyName', 'FloorPlan', 'UnitType', 'BldgUnit', 'SqFt', 'Features', 'Condition', 'Vacated', 'DateAvailable', 'BestPriceTerm', 'Monthlygrossrent', 'Concessions', 'MonthlyEffectiveRent', 'PreviousLeaseTerm', 'PreviousLeaseMonthlyEffectiveRent', 'GrossForecastedTradeout', 'ReportDate'];
export async function syncUnits(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_UNITS, UNITS_COLS, rows, (row) => [
      str(getVal(row, 'PropertyName', 'Property', 'Property Name', 'Location')),
      str(getVal(row, 'FloorPlan', 'Floor Plan', 'FloorPlanName', 'Plan')),
      str(getVal(row, 'UnitType', 'Unit Type', 'UnitDetailsUnitType', 'Type')),
      str(getVal(row, 'BldgUnit', 'Bldg Unit', 'Unit', 'Unit #', 'Unit Number', 'Building Unit')),
      num(getVal(row, 'SqFt', 'Sq Ft', 'Square Feet', 'SqFt', 'SF')),
      str(getVal(row, 'Features', 'Unit Features', 'Feature', 'Amenities')),
      str(getVal(row, 'Condition', 'Status', 'Unit Status', 'Unit Condition', 'Lease Status')),
      str(getVal(row, 'Vacated', 'Vacated Date', 'Move Out', 'Move Out Date')),
      str(getVal(row, 'DateAvailable', 'Date Available', 'Available Date', 'Available', 'Available On')),
      str(getVal(row, 'BestPriceTerm', 'Best Price Term', 'Best Term', 'Term')),
      num(getVal(row, 'Monthlygrossrent', 'Monthly Gross Rent', 'Gross Rent', 'Rent', 'Monthly Rent')),
      str(getVal(row, 'Concessions', 'Concession')),
      num(getVal(row, 'MonthlyEffectiveRent', 'Monthly Effective Rent', 'Effective Rent', 'Eff Rent')),
      num(getVal(row, 'PreviousLeaseTerm', 'Previous Lease Term', 'Prev Lease Term')),
      num(getVal(row, 'PreviousLeaseMonthlyEffectiveRent', 'Previous Lease Monthly Effective Rent', 'Prev Eff Rent', 'Previous Eff Rent')),
      num(getVal(row, 'GrossForecastedTradeout', 'Gross Forecasted Tradeout', 'Forecasted Tradeout', 'Tradeout')),
      str(getVal(row, 'ReportDate', 'Report Date', 'Report date')),
    ], replace);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- UnitMix ----------
const T_UNITMIX = `${LEASING_SCHEMA}.UnitMix`;
const UNITMIX_COLS = ['PropertyName', 'UnitType', 'TotalUnits', 'SquareFeet', 'PercentOccupied', 'percentLeased', 'GrossOfferedRent30days', 'GrossInPlaceRent', 'GrossRecentExecutedRent60days', 'GrossOfferedRentPSF', 'GrossRecentExecutedRentPSF', 'ReportDate', 'FloorPlan'];
export async function syncUnitMix(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_UNITMIX, UNITMIX_COLS, rows, (row) => [
      str(getVal(row, 'PropertyName', 'Property', 'Property Name', 'Location')),
      str(getVal(row, 'UnitType', 'Unit Type', 'Floor Plan Type')),
      num(getVal(row, 'TotalUnits', 'Total Units', 'Units')),
      num(getVal(row, 'SquareFeet', 'Square Feet', 'Sq Ft', 'SqFt')),
      num(getVal(row, 'PercentOccupied', 'Percent Occupied', '% Occupied', 'Occupied %')),
      num(getVal(row, 'percentLeased', 'Percent Leased', '% Leased', 'percent Leased')),
      num(getVal(row, 'GrossOfferedRent30days', 'Gross Offered Rent 30 days', 'Gross Offered Rent 30 Days', 'Offered Rent 30d')),
      num(getVal(row, 'GrossInPlaceRent', 'Gross In Place Rent', 'In Place Rent', 'In-Place Rent')),
      num(getVal(row, 'GrossRecentExecutedRent60days', 'Gross Recent Executed Rent 60 days', 'Recent Executed Rent 60d', 'Executed Rent 60d')),
      num(getVal(row, 'GrossOfferedRentPSF', 'Gross Offered Rent PSF', 'Offered Rent PSF', 'Offered $/SF')),
      num(getVal(row, 'GrossRecentExecutedRentPSF', 'Gross Recent Executed Rent PSF', 'Recent Executed Rent PSF', 'Executed $/SF')),
      str(getVal(row, 'ReportDate', 'Report Date', 'Report date')),
      str(getVal(row, 'FloorPlan', 'Floor Plan', 'FloorPlanName')),
    ], replace);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- Pricing ----------
const T_PRICING = `${LEASING_SCHEMA}.Pricing`;
const PRICING_COLS = ['Property', 'FloorPlan', 'RateType', 'PostDate', 'EndDate', 'DaysLeft', 'CapacityActualUnits', 'CapacitySustainablePercentage', 'CapacitySustainableUnits', 'CurrentInPlaceLeases', 'CurrentInPlaceOcc', 'CurrentForecastLeases', 'CurrentForecastOcc', 'RecommendedForecastLeases', 'RecommendedForecastOcc', 'RecommendedForecastChg', 'YesterdayDate', 'YesterdayRent', 'YesterdayPercentage', 'AmenityNormModelRent', 'AmenityNormAmenAdj', 'RecommendationsRecommendedEffRent', 'RecommendationsRecommendedEffPercentage', 'RecommendationsChangeRent', 'RecommendationsChangeRev', 'RecommendationsRecentAvgEffRent', 'RecommendationsRecentAvgEffPercentage'];
export async function syncPricing(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_PRICING, PRICING_COLS, rows, (row) => [
      str(getVal(row, 'Property')),
      str(getVal(row, 'FloorPlan', 'Floor Plan')),
      str(getVal(row, 'RateType', 'Rate Type')),
      str(getVal(row, 'PostDate', 'Post Date')),
      str(getVal(row, 'EndDate', 'End Date')),
      num(getVal(row, 'DaysLeft', 'Days Left')),
      num(getVal(row, 'CapacityActualUnits', 'Capacity - Actual Units')),
      num(getVal(row, 'CapacitySustainablePercentage', 'Capacity - Sustainable Percentage', 'Capacity - Sustainable %')),
      num(getVal(row, 'CapacitySustainableUnits', 'Capacity - Sustainable Units')),
      num(getVal(row, 'CurrentInPlaceLeases', 'Current In Place Leases')),
      num(getVal(row, 'CurrentInPlaceOcc', 'Current In Place Occ')),
      num(getVal(row, 'CurrentForecastLeases', 'Current Forecast Leases')),
      num(getVal(row, 'CurrentForecastOcc', 'Current Forecast Occ')),
      num(getVal(row, 'RecommendedForecastLeases', 'Recommended Forecast Leases')),
      num(getVal(row, 'RecommendedForecastOcc', 'Recommended Forecast Occ')),
      num(getVal(row, 'RecommendedForecastChg', 'Recommended Forecast Chg')),
      str(getVal(row, 'YesterdayDate', 'Yesterday Date')),
      num(getVal(row, 'YesterdayRent', 'Yesterday Rent')),
      num(getVal(row, 'YesterdayPercentage', 'Yesterday Percentage')),
      num(getVal(row, 'AmenityNormModelRent', 'Amenity Norm Model Rent')),
      num(getVal(row, 'AmenityNormAmenAdj', 'Amenity Norm Amen Adj')),
      num(getVal(row, 'RecommendationsRecommendedEffRent', 'Recommendations - Recommended Eff Rent')),
      num(getVal(row, 'RecommendationsRecommendedEffPercentage', 'Recommendations - Recommended Eff Percentage')),
      num(getVal(row, 'RecommendationsChangeRent', 'Recommendations - Change Rent')),
      num(getVal(row, 'RecommendationsChangeRev', 'Recommendations - Change Rev')),
      num(getVal(row, 'RecommendationsRecentAvgEffRent', 'Recommendations - Recent Avg Eff Rent')),
      num(getVal(row, 'RecommendationsRecentAvgEffPercentage', 'Recommendations - Recent Avg Eff Percentage')),
    ], replace);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- RecentRents ----------
const T_RECENTS = `${LEASING_SCHEMA}.RecentRents`;
const RECENTS_COLS = ['Property', 'FloorPlan', 'ApplicationDate', 'EffectiveDate', 'LeaseStart', 'LeaseEnd', 'GrossRent', 'EffectiveRent', 'ReportDate'];
export async function syncRecentRents(rows: Record<string, unknown>[], replace = true): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const n = await batchInsert(tx, T_RECENTS, RECENTS_COLS, rows, (row) => [
      str(getVal(row, 'Property')), str(getVal(row, 'FloorPlan')), str(getVal(row, 'ApplicationDate')), str(getVal(row, 'EffectiveDate')), str(getVal(row, 'LeaseStart')), str(getVal(row, 'LeaseEnd')), num(getVal(row, 'GrossRent')), num(getVal(row, 'EffectiveRent', 'ActualEffectiveRent')),       str(getVal(row, 'ReportDate')),
    ], replace);
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
