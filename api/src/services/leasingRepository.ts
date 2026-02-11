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
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function str(v: unknown): string | null {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
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

// ---------- Leasing ----------
const T_LEASING = `${LEASING_SCHEMA}.Leasing`;
export async function syncLeasing(rows: Record<string, unknown>[]): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request().query(`TRUNCATE TABLE ${T_LEASING}`);
    for (const row of rows) {
      await tx
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
          `INSERT INTO ${T_LEASING} (Property, Units, LeasesNeeded, NewLeasesCurrentGrossRent, LeasingVelocity7Day, LeasingVelocity28Day, MonthOf, BatchTimestamp)
           VALUES (@Property, @Units, @LeasesNeeded, @NewLeasesCurrentGrossRent, @LeasingVelocity7Day, @LeasingVelocity28Day, @MonthOf, @BatchTimestamp)`
        );
    }
    await tx.commit();
    return rows.length;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- MMRData ----------
const T_MMR = `${LEASING_SCHEMA}.MMRData`;
export async function syncMMRData(rows: Record<string, unknown>[]): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request().query(`TRUNCATE TABLE ${T_MMR}`);
    for (const row of rows) {
      await tx
        .request()
        .input('Property', sql.NVarChar(255), str(getVal(row, 'Property')))
        .input('Location', sql.NVarChar(255), str(getVal(row, 'Location')))
        .input('TotalUnits', sql.Int, num(getVal(row, 'TotalUnits')))
        .input('OccupancyPercent', sql.Float, num(getVal(row, 'OccupancyPercent')))
        .input('CurrentLeasedPercent', sql.Float, num(getVal(row, 'CurrentLeasedPercent')))
        .input('MI', sql.Int, num(getVal(row, 'MI')))
        .input('MO', sql.Int, num(getVal(row, 'MO')))
        .input('FirstVisit', sql.Int, num(getVal(row, 'FirstVisit', '1st Visit')))
        .input('Applied', sql.Int, num(getVal(row, 'Applied')))
        .input('Canceled', sql.Int, num(getVal(row, 'Canceled')))
        .input('Denied', sql.Int, num(getVal(row, 'Denied')))
        .input('T12LeasesExpired', sql.Int, num(getVal(row, 'T12LeasesExpired')))
        .input('T12LeasesRenewed', sql.Int, num(getVal(row, 'T12LeasesRenewed')))
        .input('Delinquent', sql.Int, num(getVal(row, 'Delinquent')))
        .input('OccupiedRent', sql.Float, num(getVal(row, 'OccupiedRent')))
        .input('BudgetedRent', sql.Float, num(getVal(row, 'BudgetedRent')))
        .input('CurrentMonthIncome', sql.Float, num(getVal(row, 'CurrentMonthIncome')))
        .input('BudgetedIncome', sql.Float, num(getVal(row, 'BudgetedIncome')))
        .input('MoveInRent', sql.Float, num(getVal(row, 'MoveInRent')))
        .input('OccUnits', sql.Int, num(getVal(row, 'OccUnits')))
        .input('Week3EndDate', sql.NVarChar(50), str(getVal(row, 'Week3EndDate')))
        .input('Week3MoveIns', sql.Int, num(getVal(row, 'Week3MoveIns')))
        .input('Week3MoveOuts', sql.Int, num(getVal(row, 'Week3MoveOuts')))
        .input('Week3OccUnits', sql.Int, num(getVal(row, 'Week3OccUnits')))
        .input('Week3OccPercent', sql.Float, num(getVal(row, 'Week3OccPercent')))
        .input('Week4EndDate', sql.NVarChar(50), str(getVal(row, 'Week4EndDate')))
        .input('Week4MoveIns', sql.Int, num(getVal(row, 'Week4MoveIns')))
        .input('Week4MoveOuts', sql.Int, num(getVal(row, 'Week4MoveOuts')))
        .input('Week4OccUnits', sql.Int, num(getVal(row, 'Week4OccUnits')))
        .input('Week4OccPercent', sql.Float, num(getVal(row, 'Week4OccPercent')))
        .input('Week7EndDate', sql.NVarChar(50), str(getVal(row, 'Week7EndDate')))
        .input('Week7MoveIns', sql.Int, num(getVal(row, 'Week7MoveIns')))
        .input('Week7MoveOuts', sql.Int, num(getVal(row, 'Week7MoveOuts')))
        .input('Week7OccUnits', sql.Int, num(getVal(row, 'Week7OccUnits')))
        .input('Week7OccPercent', sql.Float, num(getVal(row, 'Week7OccPercent')))
        .input('InServiceUnits', sql.Int, num(getVal(row, 'InServiceUnits')))
        .input('T12LeaseBreaks', sql.Int, num(getVal(row, 'T12LeaseBreaks')))
        .input('BudgetedOccupancyCurrentMonth', sql.Int, num(getVal(row, 'BudgetedOccupancyCurrentMonth')))
        .input('BudgetedOccupancyPercentCurrentMonth', sql.Float, num(getVal(row, 'BudgetedOccupancyPercentCurrentMonth')))
        .input('BudgetedLeasedPercentCurrentMonth', sql.Float, num(getVal(row, 'BudgetedLeasedPercentCurrentMonth')))
        .input('BudgetedLeasedCurrentMonth', sql.Int, num(getVal(row, 'BudgetedLeasedCurrentMonth')))
        .input('ReportDate', sql.NVarChar(50), str(getVal(row, 'ReportDate')))
        .input('ConstructionStatus', sql.NVarChar(100), str(getVal(row, 'ConstructionStatus')))
        .input('Rank', sql.Int, num(getVal(row, 'Rank')))
        .input('PreviousOccupancyPercent', sql.Float, num(getVal(row, 'PreviousOccupancyPercent')))
        .input('PreviousLeasedPercent', sql.Float, num(getVal(row, 'PreviousLeasedPercent')))
        .input('PreviousDelinquentUnits', sql.Int, num(getVal(row, 'PreviousDelinquentUnits')))
        .input('WeekStart', sql.NVarChar(50), str(getVal(row, 'WeekStart')))
        .input('LatestDate', sql.NVarChar(50), str(getVal(row, 'LatestDate')))
        .input('City', sql.NVarChar(100), str(getVal(row, 'City')))
        .input('State', sql.NVarChar(50), str(getVal(row, 'State')))
        .input('Status', sql.NVarChar(50), str(getVal(row, 'Status')))
        .input('FinancingStatus', sql.NVarChar(100), str(getVal(row, 'FinancingStatus')))
        .input('ProductType', sql.NVarChar(100), str(getVal(row, 'ProductType')))
        .input('Units', sql.Int, num(getVal(row, 'Units')))
        .input('FullAddress', sql.NVarChar(500), str(getVal(row, 'FullAddress')))
        .input('Latitude', sql.Float, num(getVal(row, 'Latitude')))
        .input('Longitude', sql.Float, num(getVal(row, 'Longitude')))
        .input('Region', sql.NVarChar(50), str(getVal(row, 'Region')))
        .input('LatestConstructionStatus', sql.NVarChar(100), str(getVal(row, 'LatestConstructionStatus')))
        .input('BirthOrder', sql.Int, num(getVal(row, 'BirthOrder')))
        .input('NetLsd', sql.Float, num(getVal(row, 'NetLsd')))
        .query(`
          INSERT INTO ${T_MMR} (Property, Location, TotalUnits, OccupancyPercent, CurrentLeasedPercent, MI, MO, FirstVisit, Applied, Canceled, Denied,
            T12LeasesExpired, T12LeasesRenewed, Delinquent, OccupiedRent, BudgetedRent, CurrentMonthIncome, BudgetedIncome, MoveInRent, OccUnits,
            Week3EndDate, Week3MoveIns, Week3MoveOuts, Week3OccUnits, Week3OccPercent, Week4EndDate, Week4MoveIns, Week4MoveOuts, Week4OccUnits, Week4OccPercent,
            Week7EndDate, Week7MoveIns, Week7MoveOuts, Week7OccUnits, Week7OccPercent, InServiceUnits, T12LeaseBreaks,
            BudgetedOccupancyCurrentMonth, BudgetedOccupancyPercentCurrentMonth, BudgetedLeasedPercentCurrentMonth, BudgetedLeasedCurrentMonth,
            ReportDate, ConstructionStatus, Rank, PreviousOccupancyPercent, PreviousLeasedPercent, PreviousDelinquentUnits, WeekStart, LatestDate,
            City, State, Status, FinancingStatus, ProductType, Units, FullAddress, Latitude, Longitude, Region, LatestConstructionStatus, BirthOrder, NetLsd)
          VALUES (@Property, @Location, @TotalUnits, @OccupancyPercent, @CurrentLeasedPercent, @MI, @MO, @FirstVisit, @Applied, @Canceled, @Denied,
            @T12LeasesExpired, @T12LeasesRenewed, @Delinquent, @OccupiedRent, @BudgetedRent, @CurrentMonthIncome, @BudgetedIncome, @MoveInRent, @OccUnits,
            @Week3EndDate, @Week3MoveIns, @Week3MoveOuts, @Week3OccUnits, @Week3OccPercent, @Week4EndDate, @Week4MoveIns, @Week4MoveOuts, @Week4OccUnits, @Week4OccPercent,
            @Week7EndDate, @Week7MoveIns, @Week7MoveOuts, @Week7OccUnits, @Week7OccPercent, @InServiceUnits, @T12LeaseBreaks,
            @BudgetedOccupancyCurrentMonth, @BudgetedOccupancyPercentCurrentMonth, @BudgetedLeasedPercentCurrentMonth, @BudgetedLeasedCurrentMonth,
            @ReportDate, @ConstructionStatus, @Rank, @PreviousOccupancyPercent, @PreviousLeasedPercent, @PreviousDelinquentUnits, @WeekStart, @LatestDate,
            @City, @State, @Status, @FinancingStatus, @ProductType, @Units, @FullAddress, @Latitude, @Longitude, @Region, @LatestConstructionStatus, @BirthOrder, @NetLsd)
        `);
    }
    await tx.commit();
    return rows.length;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- UnitByUnitTradeout ----------
const T_UTRADE = `${LEASING_SCHEMA}.UnitByUnitTradeout`;
export async function syncUnitByUnitTradeout(rows: Record<string, unknown>[]): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request().query(`TRUNCATE TABLE ${T_UTRADE}`);
    for (const row of rows) {
      await tx
        .request()
        .input('FloorPlan', sql.NVarChar(255), str(getVal(row, 'FloorPlan')))
        .input('UnitDetailsUnitType', sql.NVarChar(100), str(getVal(row, 'UnitDetailsUnitType')))
        .input('UnitDetailsBuilding', sql.NVarChar(100), str(getVal(row, 'UnitDetailsBuilding')))
        .input('UnitDetailsUnit', sql.NVarChar(100), str(getVal(row, 'UnitDetailsUnit')))
        .input('UnitDetailsSqFt', sql.Float, num(getVal(row, 'UnitDetailsSqFt')))
        .input('CurrentLeaseRateType', sql.NVarChar(100), str(getVal(row, 'CurrentLeaseRateType')))
        .input('CurrentLeaseLeaseType', sql.NVarChar(100), str(getVal(row, 'CurrentLeaseLeaseType')))
        .input('CurrentLeaseAppSignedDate', sql.NVarChar(50), str(getVal(row, 'CurrentLeaseAppSignedDate')))
        .input('CurrentLeaseLeaseStart', sql.NVarChar(50), str(getVal(row, 'CurrentLeaseLeaseStart')))
        .input('CurrentLeaseLeaseEnd', sql.NVarChar(50), str(getVal(row, 'CurrentLeaseLeaseEnd')))
        .input('CurrentLeaseTerm', sql.Int, num(getVal(row, 'CurrentLeaseTerm')))
        .input('CurrentLeasePrem', sql.Float, num(getVal(row, 'CurrentLeasePrem')))
        .input('CurrentLeaseGrossRent', sql.Float, num(getVal(row, 'CurrentLeaseGrossRent')))
        .input('CurrentLeaseConc', sql.Float, num(getVal(row, 'CurrentLeaseConc')))
        .input('CurrentLeaseEffRent', sql.Float, num(getVal(row, 'CurrentLeaseEffRent')))
        .input('PreviousLeaseRateType', sql.NVarChar(100), str(getVal(row, 'PreviousLeaseRateType')))
        .input('PreviousLeaseLeaseStart', sql.NVarChar(50), str(getVal(row, 'PreviousLeaseLeaseStart')))
        .input('PreviousLeaseScheduledLeaseEnd', sql.NVarChar(50), str(getVal(row, 'PreviousLeaseScheduledLeaseEnd')))
        .input('PreviousLeaseActualLeaseEnd', sql.NVarChar(50), str(getVal(row, 'PreviousLeaseActualLeaseEnd')))
        .input('PreviousLeaseTerm', sql.Int, num(getVal(row, 'PreviousLeaseTerm')))
        .input('PreviousLeasePrem', sql.Float, num(getVal(row, 'PreviousLeasePrem')))
        .input('PreviousLeaseGrossRent', sql.Float, num(getVal(row, 'PreviousLeaseGrossRent')))
        .input('PreviousLeaseConc', sql.Float, num(getVal(row, 'PreviousLeaseConc')))
        .input('PreviousLeaseEffRent', sql.Float, num(getVal(row, 'PreviousLeaseEffRent')))
        .input('VacantDays', sql.Int, num(getVal(row, 'VacantDays')))
        .input('TermVariance', sql.Float, num(getVal(row, 'TermVariance')))
        .input('TradeOutPercentage', sql.Float, num(getVal(row, 'TradeOutPercentage')))
        .input('TradeOutAmount', sql.Float, num(getVal(row, 'TradeOutAmount')))
        .input('ReportDate', sql.NVarChar(50), str(getVal(row, 'ReportDate')))
        .input('JoinDate', sql.NVarChar(50), str(getVal(row, 'JoinDate')))
        .input('MonthOf', sql.NVarChar(50), str(getVal(row, 'MonthOf')))
        .input('Property', sql.NVarChar(255), str(getVal(row, 'Property')))
        .input('City', sql.NVarChar(100), str(getVal(row, 'City')))
        .input('State', sql.NVarChar(50), str(getVal(row, 'State')))
        .input('Status', sql.NVarChar(50), str(getVal(row, 'Status')))
        .input('Units', sql.Int, num(getVal(row, 'Units')))
        .input('FullAddress', sql.NVarChar(500), str(getVal(row, 'FullAddress')))
        .input('Latitude', sql.Float, num(getVal(row, 'Latitude')))
        .input('Longitude', sql.Float, num(getVal(row, 'Longitude')))
        .input('Region', sql.NVarChar(50), str(getVal(row, 'Region')))
        .input('ConstructionStatus', sql.NVarChar(100), str(getVal(row, 'ConstructionStatus')))
        .input('BirthOrder', sql.Int, num(getVal(row, 'BirthOrder')))
        .query(`
          INSERT INTO ${T_UTRADE} (FloorPlan, UnitDetailsUnitType, UnitDetailsBuilding, UnitDetailsUnit, UnitDetailsSqFt,
            CurrentLeaseRateType, CurrentLeaseLeaseType, CurrentLeaseAppSignedDate, CurrentLeaseLeaseStart, CurrentLeaseLeaseEnd, CurrentLeaseTerm, CurrentLeasePrem, CurrentLeaseGrossRent, CurrentLeaseConc, CurrentLeaseEffRent,
            PreviousLeaseRateType, PreviousLeaseLeaseStart, PreviousLeaseScheduledLeaseEnd, PreviousLeaseActualLeaseEnd, PreviousLeaseTerm, PreviousLeasePrem, PreviousLeaseGrossRent, PreviousLeaseConc, PreviousLeaseEffRent,
            VacantDays, TermVariance, TradeOutPercentage, TradeOutAmount, ReportDate, JoinDate, MonthOf, Property, City, State, Status, Units, FullAddress, Latitude, Longitude, Region, ConstructionStatus, BirthOrder)
          VALUES (@FloorPlan, @UnitDetailsUnitType, @UnitDetailsBuilding, @UnitDetailsUnit, @UnitDetailsSqFt,
            @CurrentLeaseRateType, @CurrentLeaseLeaseType, @CurrentLeaseAppSignedDate, @CurrentLeaseLeaseStart, @CurrentLeaseLeaseEnd, @CurrentLeaseTerm, @CurrentLeasePrem, @CurrentLeaseGrossRent, @CurrentLeaseConc, @CurrentLeaseEffRent,
            @PreviousLeaseRateType, @PreviousLeaseLeaseStart, @PreviousLeaseScheduledLeaseEnd, @PreviousLeaseActualLeaseEnd, @PreviousLeaseTerm, @PreviousLeasePrem, @PreviousLeaseGrossRent, @PreviousLeaseConc, @PreviousLeaseEffRent,
            @VacantDays, @TermVariance, @TradeOutPercentage, @TradeOutAmount, @ReportDate, @JoinDate, @MonthOf, @Property, @City, @State, @Status, @Units, @FullAddress, @Latitude, @Longitude, @Region, @ConstructionStatus, @BirthOrder)
        `);
    }
    await tx.commit();
    return rows.length;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- PortfolioUnitDetails ----------
const T_PUD = `${LEASING_SCHEMA}.PortfolioUnitDetails`;
export async function syncPortfolioUnitDetails(rows: Record<string, unknown>[]): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request().query(`TRUNCATE TABLE ${T_PUD}`);
    for (const row of rows) {
      await tx
        .request()
        .input('Property', sql.NVarChar(255), str(getVal(row, 'Property')))
        .input('UnitNumber', sql.NVarChar(50), str(getVal(row, 'UnitNumber')))
        .input('FloorPlan', sql.NVarChar(255), str(getVal(row, 'FloorPlan')))
        .input('UnitDesignation', sql.NVarChar(100), str(getVal(row, 'UnitDesignation')))
        .input('SQFT', sql.Float, num(getVal(row, 'SQFT')))
        .input('UnitLeaseStatus', sql.NVarChar(255), str(getVal(row, 'UnitLeaseStatus')))
        .input('ResidentNameExternalTenantID', sql.NVarChar(255), str(getVal(row, 'ResidentNameExternalTenantID')))
        .input('LeaseID', sql.NVarChar(100), str(getVal(row, 'LeaseID')))
        .input('MoveIn', sql.NVarChar(50), str(getVal(row, 'MoveIn')))
        .input('Notice', sql.NVarChar(50), str(getVal(row, 'Notice')))
        .input('MoveOut', sql.NVarChar(50), str(getVal(row, 'MoveOut')))
        .input('DaysVacant', sql.Int, num(getVal(row, 'DaysVacant')))
        .input('MakeReady', sql.NVarChar(50), str(getVal(row, 'MakeReady')))
        .input('MakeReadyDaystoComplete', sql.Int, num(getVal(row, 'MakeReadyDaystoComplete')))
        .input('LeaseStart', sql.NVarChar(50), str(getVal(row, 'LeaseStart')))
        .input('Leaseend', sql.NVarChar(50), str(getVal(row, 'Leaseend')))
        .input('ApplicationDate', sql.NVarChar(50), str(getVal(row, 'ApplicationDate')))
        .input('LeaseType', sql.NVarChar(100), str(getVal(row, 'LeaseType')))
        .input('MarketRent', sql.Float, num(getVal(row, 'MarketRent')))
        .input('LeaseRent', sql.Float, num(getVal(row, 'LeaseRent')))
        .input('EffectiveRent', sql.Float, num(getVal(row, 'EffectiveRent')))
        .input('Concession', sql.Float, num(getVal(row, 'Concession')))
        .input('SubsidyRent', sql.Float, num(getVal(row, 'SubsidyRent')))
        .input('Amenities', sql.NVarChar(255), str(getVal(row, 'Amenities')))
        .input('TotalBilling', sql.Float, num(getVal(row, 'TotalBilling')))
        .input('UnitText', sql.NVarChar(100), str(getVal(row, 'UnitText')))
        .input('firstFloorDesignator', sql.NVarChar(50), str(getVal(row, 'firstFloorDesignator')))
        .input('floor', sql.NVarChar(50), str(getVal(row, 'floor')))
        .input('ReportDate', sql.NVarChar(50), str(getVal(row, 'ReportDate')))
        .input('BATCHLASTRUN', sql.NVarChar(100), str(getVal(row, 'BATCHLASTRUN')))
        .query(`
          INSERT INTO ${T_PUD} (Property, UnitNumber, FloorPlan, UnitDesignation, SQFT, UnitLeaseStatus, ResidentNameExternalTenantID, LeaseID, MoveIn, Notice, MoveOut, DaysVacant, MakeReady, MakeReadyDaystoComplete, LeaseStart, Leaseend, ApplicationDate, LeaseType, MarketRent, LeaseRent, EffectiveRent, Concession, SubsidyRent, Amenities, TotalBilling, UnitText, firstFloorDesignator, floor, ReportDate, BATCHLASTRUN)
          VALUES (@Property, @UnitNumber, @FloorPlan, @UnitDesignation, @SQFT, @UnitLeaseStatus, @ResidentNameExternalTenantID, @LeaseID, @MoveIn, @Notice, @MoveOut, @DaysVacant, @MakeReady, @MakeReadyDaystoComplete, @LeaseStart, @Leaseend, @ApplicationDate, @LeaseType, @MarketRent, @LeaseRent, @EffectiveRent, @Concession, @SubsidyRent, @Amenities, @TotalBilling, @UnitText, @firstFloorDesignator, @floor, @ReportDate, @BATCHLASTRUN)
        `);
    }
    await tx.commit();
    return rows.length;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- Units ----------
const T_UNITS = `${LEASING_SCHEMA}.Units`;
export async function syncUnits(rows: Record<string, unknown>[]): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request().query(`TRUNCATE TABLE ${T_UNITS}`);
    for (const row of rows) {
      await tx
        .request()
        .input('PropertyName', sql.NVarChar(255), str(getVal(row, 'PropertyName')))
        .input('FloorPlan', sql.NVarChar(255), str(getVal(row, 'FloorPlan')))
        .input('UnitType', sql.NVarChar(100), str(getVal(row, 'UnitType')))
        .input('BldgUnit', sql.NVarChar(100), str(getVal(row, 'BldgUnit')))
        .input('SqFt', sql.Float, num(getVal(row, 'SqFt')))
        .input('Features', sql.NVarChar(500), str(getVal(row, 'Features')))
        .input('Condition', sql.NVarChar(100), str(getVal(row, 'Condition')))
        .input('Vacated', sql.NVarChar(50), str(getVal(row, 'Vacated')))
        .input('DateAvailable', sql.NVarChar(50), str(getVal(row, 'DateAvailable')))
        .input('BestPriceTerm', sql.NVarChar(100), str(getVal(row, 'BestPriceTerm')))
        .input('Monthlygrossrent', sql.Float, num(getVal(row, 'Monthlygrossrent')))
        .input('Concessions', sql.NVarChar(255), str(getVal(row, 'Concessions')))
        .input('MonthlyEffectiveRent', sql.Float, num(getVal(row, 'MonthlyEffectiveRent')))
        .input('PreviousLeaseTerm', sql.Int, num(getVal(row, 'PreviousLeaseTerm')))
        .input('PreviousLeaseMonthlyEffectiveRent', sql.Float, num(getVal(row, 'PreviousLeaseMonthlyEffectiveRent')))
        .input('GrossForecastedTradeout', sql.Float, num(getVal(row, 'GrossForecastedTradeout')))
        .input('ReportDate', sql.NVarChar(50), str(getVal(row, 'ReportDate')))
        .query(`
          INSERT INTO ${T_UNITS} (PropertyName, FloorPlan, UnitType, BldgUnit, SqFt, Features, Condition, Vacated, DateAvailable, BestPriceTerm, Monthlygrossrent, Concessions, MonthlyEffectiveRent, PreviousLeaseTerm, PreviousLeaseMonthlyEffectiveRent, GrossForecastedTradeout, ReportDate)
          VALUES (@PropertyName, @FloorPlan, @UnitType, @BldgUnit, @SqFt, @Features, @Condition, @Vacated, @DateAvailable, @BestPriceTerm, @Monthlygrossrent, @Concessions, @MonthlyEffectiveRent, @PreviousLeaseTerm, @PreviousLeaseMonthlyEffectiveRent, @GrossForecastedTradeout, @ReportDate)
        `);
    }
    await tx.commit();
    return rows.length;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- UnitMix ----------
const T_UNITMIX = `${LEASING_SCHEMA}.UnitMix`;
export async function syncUnitMix(rows: Record<string, unknown>[]): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request().query(`TRUNCATE TABLE ${T_UNITMIX}`);
    for (const row of rows) {
      await tx
        .request()
        .input('PropertyName', sql.NVarChar(255), str(getVal(row, 'PropertyName')))
        .input('UnitType', sql.NVarChar(100), str(getVal(row, 'UnitType')))
        .input('TotalUnits', sql.Int, num(getVal(row, 'TotalUnits')))
        .input('SquareFeet', sql.Float, num(getVal(row, 'SquareFeet')))
        .input('PercentOccupied', sql.Float, num(getVal(row, 'PercentOccupied')))
        .input('percentLeased', sql.Float, num(getVal(row, 'percentLeased')))
        .input('GrossOfferedRent30days', sql.Float, num(getVal(row, 'GrossOfferedRent30days')))
        .input('GrossInPlaceRent', sql.Float, num(getVal(row, 'GrossInPlaceRent')))
        .input('GrossRecentExecutedRent60days', sql.Float, num(getVal(row, 'GrossRecentExecutedRent60days')))
        .input('GrossOfferedRentPSF', sql.Float, num(getVal(row, 'GrossOfferedRentPSF')))
        .input('GrossRecentExecutedRentPSF', sql.Float, num(getVal(row, 'GrossRecentExecutedRentPSF')))
        .input('ReportDate', sql.NVarChar(50), str(getVal(row, 'ReportDate')))
        .input('FloorPlan', sql.NVarChar(255), str(getVal(row, 'FloorPlan')))
        .query(`
          INSERT INTO ${T_UNITMIX} (PropertyName, UnitType, TotalUnits, SquareFeet, PercentOccupied, percentLeased, GrossOfferedRent30days, GrossInPlaceRent, GrossRecentExecutedRent60days, GrossOfferedRentPSF, GrossRecentExecutedRentPSF, ReportDate, FloorPlan)
          VALUES (@PropertyName, @UnitType, @TotalUnits, @SquareFeet, @PercentOccupied, @percentLeased, @GrossOfferedRent30days, @GrossInPlaceRent, @GrossRecentExecutedRent60days, @GrossOfferedRentPSF, @GrossRecentExecutedRentPSF, @ReportDate, @FloorPlan)
        `);
    }
    await tx.commit();
    return rows.length;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- Pricing ----------
const T_PRICING = `${LEASING_SCHEMA}.Pricing`;
export async function syncPricing(rows: Record<string, unknown>[]): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request().query(`TRUNCATE TABLE ${T_PRICING}`);
    for (const row of rows) {
      await tx
        .request()
        .input('Property', sql.NVarChar(255), str(getVal(row, 'Property')))
        .input('FloorPlan', sql.NVarChar(255), str(getVal(row, 'FloorPlan')))
        .input('RateType', sql.NVarChar(100), str(getVal(row, 'RateType')))
        .input('PostDate', sql.NVarChar(50), str(getVal(row, 'PostDate')))
        .input('EndDate', sql.NVarChar(50), str(getVal(row, 'EndDate')))
        .input('DaysLeft', sql.Int, num(getVal(row, 'DaysLeft')))
        .input('CapacityActualUnits', sql.Int, num(getVal(row, 'CapacityActualUnits')))
        .input('CapacitySustainablePercentage', sql.Float, num(getVal(row, 'CapacitySustainablePercentage')))
        .input('CapacitySustainableUnits', sql.Int, num(getVal(row, 'CapacitySustainableUnits')))
        .input('CurrentInPlaceLeases', sql.Int, num(getVal(row, 'CurrentInPlaceLeases')))
        .input('CurrentInPlaceOcc', sql.Float, num(getVal(row, 'CurrentInPlaceOcc')))
        .input('CurrentForecastLeases', sql.Int, num(getVal(row, 'CurrentForecastLeases')))
        .input('CurrentForecastOcc', sql.Float, num(getVal(row, 'CurrentForecastOcc')))
        .input('RecommendedForecastLeases', sql.Int, num(getVal(row, 'RecommendedForecastLeases')))
        .input('RecommendedForecastOcc', sql.Float, num(getVal(row, 'RecommendedForecastOcc')))
        .input('RecommendedForecastChg', sql.Float, num(getVal(row, 'RecommendedForecastChg')))
        .input('YesterdayDate', sql.NVarChar(50), str(getVal(row, 'YesterdayDate')))
        .input('YesterdayRent', sql.Float, num(getVal(row, 'YesterdayRent')))
        .input('YesterdayPercentage', sql.Float, num(getVal(row, 'YesterdayPercentage')))
        .input('AmenityNormModelRent', sql.Float, num(getVal(row, 'AmenityNormModelRent')))
        .input('AmenityNormAmenAdj', sql.Float, num(getVal(row, 'AmenityNormAmenAdj')))
        .input('RecommendationsRecommendedEffRent', sql.Float, num(getVal(row, 'RecommendationsRecommendedEffRent')))
        .input('RecommendationsRecommendedEffPercentage', sql.Float, num(getVal(row, 'RecommendationsRecommendedEffPercentage')))
        .input('RecommendationsChangeRent', sql.Float, num(getVal(row, 'RecommendationsChangeRent')))
        .input('RecommendationsChangeRev', sql.Float, num(getVal(row, 'RecommendationsChangeRev')))
        .input('RecommendationsRecentAvgEffRent', sql.Float, num(getVal(row, 'RecommendationsRecentAvgEffRent')))
        .input('RecommendationsRecentAvgEffPercentage', sql.Float, num(getVal(row, 'RecommendationsRecentAvgEffPercentage')))
        .query(`
          INSERT INTO ${T_PRICING} (Property, FloorPlan, RateType, PostDate, EndDate, DaysLeft, CapacityActualUnits, CapacitySustainablePercentage, CapacitySustainableUnits,
            CurrentInPlaceLeases, CurrentInPlaceOcc, CurrentForecastLeases, CurrentForecastOcc, RecommendedForecastLeases, RecommendedForecastOcc, RecommendedForecastChg,
            YesterdayDate, YesterdayRent, YesterdayPercentage, AmenityNormModelRent, AmenityNormAmenAdj,
            RecommendationsRecommendedEffRent, RecommendationsRecommendedEffPercentage, RecommendationsChangeRent, RecommendationsChangeRev, RecommendationsRecentAvgEffRent, RecommendationsRecentAvgEffPercentage)
          VALUES (@Property, @FloorPlan, @RateType, @PostDate, @EndDate, @DaysLeft, @CapacityActualUnits, @CapacitySustainablePercentage, @CapacitySustainableUnits,
            @CurrentInPlaceLeases, @CurrentInPlaceOcc, @CurrentForecastLeases, @CurrentForecastOcc, @RecommendedForecastLeases, @RecommendedForecastOcc, @RecommendedForecastChg,
            @YesterdayDate, @YesterdayRent, @YesterdayPercentage, @AmenityNormModelRent, @AmenityNormAmenAdj,
            @RecommendationsRecommendedEffRent, @RecommendationsRecommendedEffPercentage, @RecommendationsChangeRent, @RecommendationsChangeRev, @RecommendationsRecentAvgEffRent, @RecommendationsRecentAvgEffPercentage)
        `);
    }
    await tx.commit();
    return rows.length;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------- RecentRents ----------
const T_RECENTS = `${LEASING_SCHEMA}.RecentRents`;
export async function syncRecentRents(rows: Record<string, unknown>[]): Promise<number> {
  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await tx.request().query(`TRUNCATE TABLE ${T_RECENTS}`);
    for (const row of rows) {
      await tx
        .request()
        .input('Property', sql.NVarChar(255), str(getVal(row, 'Property')))
        .input('FloorPlan', sql.NVarChar(255), str(getVal(row, 'FloorPlan')))
        .input('ApplicationDate', sql.NVarChar(50), str(getVal(row, 'ApplicationDate')))
        .input('EffectiveDate', sql.NVarChar(50), str(getVal(row, 'EffectiveDate')))
        .input('LeaseStart', sql.NVarChar(50), str(getVal(row, 'LeaseStart')))
        .input('LeaseEnd', sql.NVarChar(50), str(getVal(row, 'LeaseEnd')))
        .input('GrossRent', sql.Float, num(getVal(row, 'GrossRent')))
        .input('EffectiveRent', sql.Float, num(getVal(row, 'EffectiveRent', 'ActualEffectiveRent')))
        .input('ReportDate', sql.NVarChar(50), str(getVal(row, 'ReportDate')))
        .query(`
          INSERT INTO ${T_RECENTS} (Property, FloorPlan, ApplicationDate, EffectiveDate, LeaseStart, LeaseEnd, GrossRent, EffectiveRent, ReportDate)
          VALUES (@Property, @FloorPlan, @ApplicationDate, @EffectiveDate, @LeaseStart, @LeaseEnd, @GrossRent, @EffectiveRent, @ReportDate)
        `);
    }
    await tx.commit();
    return rows.length;
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
