/**
 * Build full LeasingDashboardPayload from raw DB rows.
 * Ports app.js build/calculate logic so frontend is visual-only.
 */
import type { LeasingDashboardPayload } from '../controllers/leasingController';
import type { LeasingDashboardRaw } from './leasingRepository';

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const s = String(v).trim();
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) return new Date(parsed);
    return null;
  }
  if (typeof v === 'number' && !Number.isNaN(v)) return new Date(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  return null;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function normProp(s: unknown): string {
  return (s ?? '')
    .toString()
    .trim()
    .replace(/\*/g, '')
    .toUpperCase();
}

function normPlan(s: unknown): string {
  return (s ?? '').toString().trim();
}

function normalizeLeaseType(s: unknown): string | null {
  const v = (s ?? '').toString().trim().toUpperCase();
  if (!v) return null;
  if (v.includes('NEW')) return 'New';
  if (v.includes('RENEW') || v.includes('RENEWAL')) return 'Renewal';
  return v || null;
}

// ---------- computeLastUpdated ----------
function computeLastUpdated(raw: LeasingDashboardRaw): Record<string, string | null> & { recentsTimestamp?: string | null; leasingTimestamp?: string | null } {
  const res: Record<string, string | null> = {
    leasing: null,
    pricing: null,
    units: null,
    unitmix: null,
    recents: null,
  };
  const pickMax = (rows: Record<string, unknown>[], ...fieldCandidates: string[]): Date | null => {
    let best: Date | null = null;
    for (const r of rows) {
      for (const f of fieldCandidates) {
        const d = parseDate((r as Record<string, unknown>)[f]);
        if (d && (!best || d > best)) best = d;
      }
    }
    return best;
  };
  const toStr = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
  if (raw.leasing?.length) res.leasing = toStr(pickMax(raw.leasing, 'BatchTimestamp', 'MonthOf'));
  if (raw.pricing?.length) res.pricing = toStr(pickMax(raw.pricing, 'PostDate', 'EndDate'));
  if (raw.units?.length) res.units = toStr(pickMax(raw.units, 'ReportDate'));
  if (raw.unitmix?.length) res.unitmix = toStr(pickMax(raw.unitmix, 'ReportDate'));
  if (raw.recents?.length) res.recents = toStr(pickMax(raw.recents, 'ApplicationDate', 'EffectiveDate'));
  return res;
}

// ---------- buildStatusFromMMR ----------
function buildStatusFromMMR(mmrRows: Record<string, unknown>[]): {
  statusByProperty: Record<string, string>;
  mmrOcc: Record<string, number>;
  mmrUnits: Record<string, number>;
} {
  const statusByProperty: Record<string, string> = {};
  const mmrOcc: Record<string, number> = {};
  const mmrUnits: Record<string, number> = {};
  if (!Array.isArray(mmrRows) || mmrRows.length === 0)
    return { statusByProperty, mmrOcc, mmrUnits };

  let latestGlobal: Date | null = null;
  for (const r of mmrRows) {
    const d = parseDate((r as Record<string, unknown>).WeekStart ?? (r as Record<string, unknown>).ReportDate);
    if (d && (!latestGlobal || d > latestGlobal)) latestGlobal = d;
  }
  const eqDay = (a: Date | null, b: Date | null) =>
    a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const byProp = new Map<string, Record<string, unknown>>();
  for (const r of mmrRows) {
    const row = r as Record<string, unknown>;
    const name = row.Property;
    if (name == null) continue;
    const key = normProp(name);
    const d = parseDate(row.WeekStart ?? row.ReportDate);
    const prev = byProp.get(key);
    if (!prev) {
      byProp.set(key, row);
      continue;
    }
    const prevD = parseDate(prev.WeekStart ?? prev.ReportDate);
    const prevIsGlobal = eqDay(prevD, latestGlobal);
    const curIsGlobal = eqDay(d, latestGlobal);
    if (prevIsGlobal && !curIsGlobal) continue;
    if (curIsGlobal && !prevIsGlobal) {
      byProp.set(key, row);
      continue;
    }
    if (d && prevD && d > prevD) byProp.set(key, row);
  }

  for (const [k, r] of byProp.entries()) {
    const status = r.Status;
    if (status != null) statusByProperty[k] = String(status).trim().toUpperCase();
    const occ = (r as Record<string, unknown>).OccupancyPercent ?? (r as Record<string, unknown>)['Occupancy %'];
    const units = (r as Record<string, unknown>).Units ?? (r as Record<string, unknown>).TotalUnits;
    if (occ != null) mmrOcc[k] = Number(occ);
    if (units != null) mmrUnits[k] = Number(units);
  }
  return { statusByProperty, mmrOcc, mmrUnits };
}

// ---------- buildUnitMixStructure ----------
type UnitMixUnitType = { totalUnits: number | null; pctOcc: number | null; pctLeased: number | null; plans: Array<{ plan: string; units: number | null }> };
type UnitMixProp = { unitTypes: Record<string, UnitMixUnitType>; plans: unknown[] };
function buildUnitMixStructure(rows: Record<string, unknown>[]): Record<string, UnitMixProp> {
  const out: Record<string, UnitMixProp> = {};
  const propertyName = 'PropertyName';
  const unitType = 'UnitType';
  const floorPlan = 'FloorPlan';
  const reportDate = 'ReportDate';
  const totalUnits = 'TotalUnits';
  const pctOcc = 'PercentOccupied';
  const pctLeased = 'percentLeased';

  const latestUT = new Map<string, Record<string, unknown>>();
  const latestPlan = new Map<string, { units: number | null; d: Date }>();
  for (const r of rows || []) {
    const row = r as Record<string, unknown>;
    const prop = normProp(row[propertyName]);
    const ut = (row[unitType] ?? '').toString().trim();
    const plan = normPlan(row[floorPlan]);
    const d = parseDate(row[reportDate]);
    if (!prop || !ut || !d) continue;
    const keyUT = `${prop}|${ut}`;
    const prev = latestUT.get(keyUT);
    if (!prev || (parseDate(prev[reportDate]) ?? new Date(0)) < d) latestUT.set(keyUT, row);
    const keyPlan = `${prop}|${ut}|${plan}`;
    const prevP = latestPlan.get(keyPlan);
    if (!prevP || prevP.d < d) latestPlan.set(keyPlan, { units: num(row[totalUnits]), d });
  }

  for (const [key, utRow] of latestUT.entries()) {
    const [prop, ut] = key.split('|');
    if (!out[prop]) out[prop] = { unitTypes: {}, plans: [] };
    const plans: Array<{ plan: string; units: number | null }> = [];
    for (const [pkey, v] of latestPlan.entries()) {
      const [pp, uut, plan] = pkey.split('|');
      if (pp === prop && uut === ut) plans.push({ plan, units: v.units ?? null });
    }
    plans.sort((a, b) => String(a.plan).localeCompare(String(b.plan)));
    out[prop].unitTypes[ut] = {
      totalUnits: num(utRow[totalUnits]),
      pctOcc: num(utRow[pctOcc]),
      pctLeased: num(utRow[pctLeased]),
      plans,
    };
  }
  return out;
}

// ---------- buildRecentsByPlan (simplified: by prop|plan, avg effective rent) ----------
function buildRecentsByPlan(rows: Record<string, unknown>[]): Record<string, unknown> {
  const best = new Map<string, Record<string, unknown>>();
  for (const r of rows || []) {
    const row = r as Record<string, unknown>;
    const prop = normProp(row.Property ?? row['Property']);
    const plan = normPlan(row.FloorPlan ?? row['Floor Plan']);
    const appDate = parseDate(row.ApplicationDate ?? row['Application Date']);
    const actualRent = num(row.EffectiveRent ?? row.ActualEffectiveRent ?? row['Actual Effective Rent']);
    if (!prop || !plan || !appDate || actualRent == null || actualRent <= 0) continue;
    const key = `${prop}|${plan}`;
    const prev = best.get(key);
    if (!prev || appDate > (parseDate(prev.ApplicationDate) ?? new Date(0))) {
      best.set(key, {
        Property: prop,
        FloorPlan: plan,
        ApplicationDate: appDate.toISOString ? appDate.toISOString().slice(0, 10) : String(appDate),
        RecentAverageEffectiveRent: actualRent,
        ActualEffectiveRent: actualRent,
      });
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of best.entries()) out[k] = v;
  return out;
}

// ---------- buildPricingIndexAndTimeseries (simplified: latest per prop|plan, ts array) ----------
function buildPricingIndexAndTimeseries(rows: Record<string, unknown>[]): {
  pricingByPlan: Record<string, unknown>;
  pricingTS: Record<string, unknown>;
} {
  const latest = new Map<string, Record<string, unknown>>();
  const ts: Record<string, Array<{ x: string; recEff: number | null; rate: string }>> = {};
  const property = 'Property';
  const floorPlan = 'FloorPlan';
  const rateType = 'RateType';
  const postDate = 'PostDate';
  const endDate = 'EndDate';
  const recEff = 'RecommendationsRecommendedEffRent';
  const recentAvg = 'RecommendationsRecentAvgEffRent';

  for (const r of rows || []) {
    const row = r as Record<string, unknown>;
    const prop = normProp(row[property]);
    const plan = normPlan(row[floorPlan]);
    const rate = normalizeLeaseType(row[rateType]) ?? '';
    const d = parseDate(row[postDate]) ?? parseDate(row[endDate]);
    if (!prop || !plan) continue;
    const keyTS = `${prop}|${plan}`;
    if (!ts[keyTS]) ts[keyTS] = [];
    ts[keyTS].push({
      x: d ? d.toISOString().slice(0, 10) : '',
      recEff: num(row[recEff]) ?? num(row[recentAvg]),
      rate,
    });
    if (d) {
      const keyAll = `${prop}|${plan}|${rate}`;
      const prev = latest.get(keyAll);
      const prevD = prev ? parseDate(prev[postDate] ?? prev[endDate]) : null;
      if (!prev || !prevD || d > prevD) latest.set(keyAll, row);
    }
  }
  const pricingByPlan: Record<string, unknown> = {};
  for (const [k, v] of latest.entries()) pricingByPlan[k] = v;
  for (const arr of Object.values(ts)) arr.sort((a, b) => a.x.localeCompare(b.x));
  return { pricingByPlan, pricingTS: ts as unknown as Record<string, unknown> };
}

// ---------- buildLeaseTypeLookupFromTradeout ----------
function buildLeaseTypeLookupFromTradeout(utradeRows: Record<string, unknown>[]): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const r of utradeRows || []) {
    const row = r as Record<string, unknown>;
    const prop = normProp(row.Property ?? '');
    if (!prop) continue;
    const building = (row.UnitDetailsBuilding ?? '').toString().trim();
    const unit = (row.UnitDetailsUnit ?? '').toString().trim();
    let unitKey = building && unit ? `${building}-${unit}` : (unit || building).toString().trim();
    if (!unitKey) continue;
    const rateType = row.CurrentLeaseRateType ?? row['Current Lease | Rate Type'];
    const normalized = normalizeLeaseType(rateType);
    if (normalized) lookup[`${prop.toLowerCase()}|${unitKey.toLowerCase()}`] = normalized;
  }
  return lookup;
}

// ---------- buildLeasingTimeseries (simplified: prop -> [{ x, occPct, v7, v28, ... }]) ----------
function buildLeasingTimeseries(
  rows: Record<string, unknown>[],
  mmrOcc: Record<string, number>,
  mmrUnits: Record<string, number>
): Record<string, unknown> {
  const tsByProp: Record<string, Array<{ x: string; occPct: number | null; v7: number | null; v28: number | null; unitsTotal: number }>> = {};
  const dateCol = 'MonthOf';
  const property = 'Property';
  const units = 'Units';
  const v7 = '7DayLeasingVelocity';
  const v28 = '28DayLeasingVelocity';

  const latest = new Map<string, Record<string, unknown>>();
  for (const r of rows || []) {
    const row = r as Record<string, unknown>;
    const prop = normProp(row[property]);
    const d = parseDate(row[dateCol] ?? row.BatchTimestamp);
    if (!prop || !d) continue;
    const key = `${prop}|${d.getTime()}`;
    const prev = latest.get(key);
    if (!prev || (parseDate(prev[dateCol]) ?? new Date(0)) < d) latest.set(key, row);
  }

  for (const [, r] of latest.entries()) {
    const row = r as Record<string, unknown>;
    const prop = normProp(row[property]);
    const d = parseDate(row[dateCol] ?? row.BatchTimestamp);
    if (!prop || !d) continue;
    const unitsTotal = num(row[units]) ?? 0;
    const v28Val = num(row[v28] ?? row['28DayLeasingVelocity']);
    const v7Val = num(row[v7] ?? row['7DayLeasingVelocity']);
    let occPct: number | null = mmrOcc[prop] ?? null;
    if (occPct != null && occPct <= 1) occPct = occPct * 100;
    if (!tsByProp[prop]) tsByProp[prop] = [];
    tsByProp[prop].push({
      x: d.toISOString().slice(0, 10),
      occPct,
      v7: v7Val,
      v28: v28Val,
      unitsTotal,
    });
  }
  for (const arr of Object.values(tsByProp)) arr.sort((a, b) => a.x.localeCompare(b.x));
  return tsByProp as unknown as Record<string, unknown>;
}

// ---------- buildUnitTradeoutIndex (simplified: prop -> { months: {}, latestMonth }) ----------
function buildUnitTradeoutIndex(utradeRows: Record<string, unknown>[]): Record<string, { months: Record<string, unknown>; latestMonth: string | null }> {
  const out: Record<string, { months: Record<string, unknown>; latestMonth: string | null }> = {};
  const monthOf = 'MonthOf';
  const reportDate = 'ReportDate';
  const property = 'Property';
  const tradeoutPct = 'TradeOutPercentage';
  const tradeoutAmt = 'TradeOutAmount';

  let latestGlobal: Date | null = null;
  const byPropMonth = new Map<string, Map<string, { pct: number | null; amt: number | null }>>();
  for (const r of utradeRows || []) {
    const row = r as Record<string, unknown>;
    const prop = normProp(row[property]);
    const d = parseDate(row[monthOf] ?? row[reportDate]);
    if (!prop || !d) continue;
    if (!latestGlobal || d > latestGlobal) latestGlobal = d;
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byPropMonth.has(prop)) byPropMonth.set(prop, new Map());
    const prev = byPropMonth.get(prop)!.get(monthKey);
    const pct = num(row[tradeoutPct]);
    const amt = num(row[tradeoutAmt]);
    if (!prev || (d > (parseDate(row[monthOf]) ?? new Date(0)))) {
      byPropMonth.get(prop)!.set(monthKey, { pct: pct ?? null, amt: amt ?? null });
    }
  }

  for (const [prop, monthsMap] of byPropMonth.entries()) {
    const months: Record<string, unknown> = {};
    for (const [k, v] of monthsMap.entries()) months[k] = v;
    out[prop] = {
      months,
      latestMonth: latestGlobal ? latestGlobal.toISOString().slice(0, 10) : null,
    };
  }
  return out;
}

// ---------- unitsIndex: prop -> { plan -> latest row } (simplified: prop|plan -> row) ----------
function buildUnitsIndex(unitRows: Record<string, unknown>[]): Record<string, unknown> {
  const byKey = new Map<string, Record<string, unknown>>();
  const propertyName = 'PropertyName';
  const floorPlan = 'FloorPlan';
  const reportDate = 'ReportDate';
  for (const r of unitRows || []) {
    const row = r as Record<string, unknown>;
    const prop = normProp(row[propertyName]);
    const plan = normPlan(row[floorPlan]);
    const d = parseDate(row[reportDate]);
    if (!prop || !d) continue;
    const key = `${prop}|${plan}`;
    const prev = byKey.get(key);
    if (!prev || (parseDate(prev[reportDate]) ?? new Date(0)) < d) byKey.set(key, row);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of byKey.entries()) out[k] = v;
  return out;
}

// ---------- month from leasing ----------
function getMonth(leasing: Record<string, unknown>[]): string | null {
  let latest: Date | null = null;
  for (const r of leasing || []) {
    const d = parseDate((r as Record<string, unknown>).MonthOf ?? (r as Record<string, unknown>).BatchTimestamp);
    if (d && (!latest || d > latest)) latest = d;
  }
  if (!latest) return null;
  return `${latest.getFullYear()}-${String(latest.getMonth() + 1).padStart(2, '0')}`;
}

/** Convert Map and other non-JSON values to plain objects for storage. */
function toSerializable(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) obj[String(k)] = toSerializable(v);
    return obj;
  }
  if (Array.isArray(value)) return value.map(toSerializable);
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toSerializable(v);
    return out;
  }
  return value;
}

/** Return a JSON-serializable copy of the dashboard payload (for storing in DashboardSnapshot). */
export function dashboardPayloadToJsonSafe(payload: LeasingDashboardPayload): Record<string, unknown> {
  return toSerializable(payload) as Record<string, unknown>;
}

export async function buildDashboardFromRaw(raw: LeasingDashboardRaw): Promise<LeasingDashboardPayload> {
  const { statusByProperty, mmrOcc, mmrUnits } = buildStatusFromMMR(raw.mmrRows);
  const lastUpdated = computeLastUpdated(raw);
  const unitmixStruct = buildUnitMixStructure(raw.unitmix);
  const recentsByPlan = buildRecentsByPlan(raw.recents);
  const { pricingByPlan, pricingTS } = buildPricingIndexAndTimeseries(raw.pricing);
  const utradeIndex = buildUnitTradeoutIndex(raw.utradeRows);
  const leasingTS = buildLeasingTimeseries(raw.leasing, mmrOcc, mmrUnits);
  const tradeoutLeaseTypeLookup = buildLeaseTypeLookupFromTradeout(raw.utradeRows);
  const unitsIndex = buildUnitsIndex(raw.units);
  const month = getMonth(raw.leasing);

  // rows: leasing sorted by Property (same as app)
  const rows = [...(raw.leasing || [])].sort((a, b) =>
    String((a as Record<string, unknown>).Property ?? '').localeCompare(String((b as Record<string, unknown>).Property ?? ''))
  );

  const payload: LeasingDashboardPayload = {
    rows,
    leasing: raw.leasing ?? [],
    unitmixStruct,
    unitmixRows: raw.unitmix ?? [],
    recentsByPlan,
    pricingByPlan,
    pricingTS,
    unitRows: raw.units ?? [],
    unitsIndex,
    utradeIndex,
    leasingTS,
    diagnostics: [],
    mmrRows: raw.mmrRows ?? [],
    recRowsAll: raw.recents ?? [],
    pricingRowsAll: raw.pricing ?? [],
    month,
    utradeRows: raw.utradeRows ?? [],
    lastUpdated,
    portfolioUnitDetails: raw.portfolioUnitDetails ?? [],
    tradeoutLeaseTypeLookup,
    statusByProperty,
    mmrOcc,
    mmrUnits,
  };
  return payload;
}
