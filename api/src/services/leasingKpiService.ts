/**
 * Leasing KPI service – portfolio and by-property KPIs from portfolio unit details and leasing data.
 * Logic ported from leasing velocity report app.js (RealPage BOXSCORE: occupancy, leased, available, velocity, delta to budget).
 */
import type { LeasingDashboardRaw } from './leasingRepository';

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const parsed = Date.parse(String(v).trim());
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
  return (s ?? '').toString().trim();
}

/** Canonical key for merging property names that differ only by case/spacing (e.g. "The Waters at Millerville" vs "THE WATERS AT MILLERVILLE"). */
function normPropCanonical(s: unknown): string {
  return (s ?? '').toString().trim().toUpperCase();
}

function normPlan(s: unknown): string {
  return (s ?? '').toString().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

function reportDateFromPortfolioRow(r: Record<string, unknown>): Date | null {
  return parseDate(r.ReportDate ?? r.reportDate ?? r['Report Date']);
}

function getStatusPriorityForDedup(status: string): number {
  const s = (status || '').toLowerCase();
  if (s.includes('occupied')) return 1;
  if (s.includes('vacant') && s.includes('leased')) return 2;
  if (s.includes('vacant')) return 3;
  if (s.includes('pending')) return 4;
  if (s === 'model') return 5;
  return 6;
}

/**
 * RealPage BOXSCORE occupied logic (matches frontend isOccupiedBoxscoreLogic in leasing velocity report app.js).
 * Frontend source: getCurrentOccupancyAndLeasedFromDetails -> isOccupiedBoxscoreLogic.
 *
 * UnitLeaseStatus rules for OCCUPIED (all definitions the frontend uses):
 * - Excluded: empty, any status containing "vacant", "model", "admin", "corporate", "free", "down".
 * - Included: "Pending Renewal" (treated as occupied).
 * - Included: status containing "occupied" — e.g. "Occupied", "Occupied -ntv", "Occupied NTV", "Occupied NTVL",
 *   "Occupied ntvl", "Occupied - NTV", etc. — unless one of the exceptions below applies.
 * Exceptions (do NOT count as occupied):
 *   - Unit has applicant/applied row and notice date is on report date (same calendar day).
 *   - Notice date is report day minus one (immediate move-out).
 *   - Notice date = report date and status does not contain "ntv" (plain Occupied on notice = vacant).
 * - "Vacant Leased" is NOT occupied (excluded by "vacant"); it counts only toward leased.
 */
function isOccupiedBoxscoreLogic(
  r: Record<string, unknown>,
  reportDate: Date,
  options?: { unitKeysWithApplicantRow?: Set<string> }
): boolean {
  const status = (r.UnitLeaseStatus ?? r['Unit/Lease Status'] ?? '').toString().trim();
  const statusLower = status.toLowerCase();
  if (!status || statusLower.includes('vacant') || statusLower.includes('model') || statusLower.includes('admin') ||
      statusLower.includes('corporate') || statusLower.includes('free') || statusLower.includes('down')) return false;
  if (statusLower.includes('pending renewal')) return true;
  if (!statusLower.includes('occupied')) return false;
  const noticeDate = parseDate(
    r.Notice ?? r['Notice'] ?? r['Notice Date'] ?? r.NoticeDate ??
    r['Notice Given'] ?? r.NoticeGiven ?? r['Notice Given Date'] ?? r.NoticeGivenDate
  );
  const moveOutDate = parseDate(
    r.MoveOut ?? r['Move Out'] ?? r['Move Out Date'] ?? r.MoveOutDate ??
    r['Move-Out'] ?? r['Move-Out Date']
  );
  const unitKey = `${normPlan(r.FloorPlan ?? r['Floor Plan'] ?? '')}-${(r.UnitNumber ?? r['Unit #'] ?? r.UnitDesignation ?? r['Unit Designation'] ?? '').toString().trim().toLowerCase()}`;
  const unitKeysWithApplicantRow = options?.unitKeysWithApplicantRow;
  // Same calendar day = notice "on report date" (robust to time component)
  const noticeOnReportDate =
    reportDate && noticeDate &&
    new Date(noticeDate.getFullYear(), noticeDate.getMonth(), noticeDate.getDate()).getTime() ===
    new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate()).getTime();
  if (noticeOnReportDate && unitKeysWithApplicantRow && unitKey && unitKeysWithApplicantRow.has(unitKey)) return false;
  if (!moveOutDate && noticeDate && reportDate) {
    const noticeDay = new Date(noticeDate.getFullYear(), noticeDate.getMonth(), noticeDate.getDate()).getTime();
    const reportDay = new Date(reportDate.getFullYear(), reportDate.getMonth(), reportDate.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (noticeDay === reportDay - oneDayMs) return false;
    if (noticeDay === reportDay && !statusLower.includes('ntv')) return false;
  }
  return true;
}

function getLeaseStartDate(r: Record<string, unknown>): Date | null {
  const candidates = [r.LeaseStart, r['Lease Start'], r['Lease Start Date'], r.LeaseStartDate, r.MoveIn, r['Move In']];
  for (const c of candidates) {
    const d = parseDate(c);
    if (d) return d;
  }
  return null;
}

/** Single-property occupancy and leased from PUD (matches getCurrentOccupancyAndLeasedFromDetails). */
function getOccupancyAndLeasedForProperty(
  prop: string,
  portfolioUnitDetails: Record<string, unknown>[],
  asOf?: Date
): { occupied: number; leased: number; totalUnits: number } | null {
  const pKey = normPropCanonical(prop);
  if (!Array.isArray(portfolioUnitDetails) || portfolioUnitDetails.length === 0) return null;
  const propUnitDetails = portfolioUnitDetails.filter((r) => {
    const rProp = normPropCanonical(r.Property ?? r.propertyName ?? '');
    return rProp === pKey;
  });
  if (propUnitDetails.length === 0) return null;
  let allReportDates = propUnitDetails
    .map((r) => parseDate(r.ReportDate ?? r.reportDate))
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime());
  if (asOf) {
    const cap = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 23, 59, 59, 999);
    allReportDates = allReportDates.filter((d) => d.getTime() <= cap.getTime());
  }
  const latestReportDate = allReportDates.length > 0 ? allReportDates[0] : null;
  if (!latestReportDate) return null;
  const latestPropUnitDetails = propUnitDetails.filter((r) => {
    const reportDate = parseDate(r.ReportDate ?? r.reportDate);
    return reportDate && reportDate.getTime() === latestReportDate.getTime();
  });
  const unitMap = new Map<string, Record<string, unknown>>();
  const unitsWithoutId: Record<string, unknown>[] = [];
  let rowIndex = 0;
  for (const r of latestPropUnitDetails) {
    const row = r as Record<string, unknown>;
    const unitNum = (row.UnitNumber ?? row['Unit #'] ?? '').toString().trim();
    const unitDesignation = (row.UnitDesignation ?? row['Unit Designation'] ?? '').toString().trim();
    const plan = normPlan(row.FloorPlan ?? row['Floor Plan'] ?? '');
    const unitKey = `${plan}-${(unitNum || unitDesignation || '').toLowerCase()}`;
    if (!unitNum && !unitDesignation) {
      unitsWithoutId.push({ ...row, _rowIndex: rowIndex });
      rowIndex++;
      continue;
    }
    const existing = unitMap.get(unitKey);
    if (!existing) {
      unitMap.set(unitKey, row);
    } else {
      const existingStatus = (existing.UnitLeaseStatus ?? existing['Unit/Lease Status'] ?? '').toString();
      const currentStatus = (row.UnitLeaseStatus ?? row['Unit/Lease Status'] ?? '').toString();
      const existingPriority = getStatusPriorityForDedup(existingStatus);
      const currentPriority = getStatusPriorityForDedup(currentStatus);
      if (currentPriority < existingPriority) {
        unitMap.set(unitKey, row);
      } else if (currentPriority === existingPriority) {
        const existingDate = parseDate(existing.ReportDate ?? existing.reportDate);
        const currentDate = parseDate(row.ReportDate ?? row.reportDate);
        if (currentDate && (!existingDate || currentDate > existingDate)) unitMap.set(unitKey, row);
      }
    }
  }
  const deduplicatedUnits = Array.from(unitMap.values()).concat(unitsWithoutId);
  const totalUnits = deduplicatedUnits.length;
  const unitKeysWithApplicantRow = new Set<string>();
  for (const r of latestPropUnitDetails) {
    const row = r as Record<string, unknown>;
    const status = (row.UnitLeaseStatus ?? row['Unit/Lease Status'] ?? '').toString().toLowerCase();
    if (status.includes('applicant') || status.includes('applied')) {
      const unitNum = (row.UnitNumber ?? row['Unit #'] ?? '').toString().trim();
      const unitDesignation = (row.UnitDesignation ?? row['Unit Designation'] ?? '').toString().trim();
      const plan = normPlan(row.FloorPlan ?? row['Floor Plan'] ?? '');
      const uk = `${plan}-${(unitNum || unitDesignation || '').toLowerCase()}`;
      if (uk && (unitNum || unitDesignation)) unitKeysWithApplicantRow.add(uk);
    }
  }
  const currentOccupied = deduplicatedUnits.filter((r) =>
    isOccupiedBoxscoreLogic(r as Record<string, unknown>, latestReportDate, { unitKeysWithApplicantRow })
  ).length;
  const isOccupiedNTV = (r: Record<string, unknown>): boolean => {
    const status = (r.UnitLeaseStatus ?? r['Unit/Lease Status'] ?? '').toString().trim().toLowerCase();
    if (!status || !status.includes('occupied') || status.includes('vacant')) return false;
    if (!status.includes('ntv') || status.includes('ntvl')) return false;
    const leaseStart = getLeaseStartDate(r);
    const isPreLeased = leaseStart && latestReportDate && leaseStart > latestReportDate;
    return !isPreLeased;
  };
  const currentLeased = deduplicatedUnits.filter((r) => {
    const row = r as Record<string, unknown>;
    const status = (row.UnitLeaseStatus ?? row['Unit/Lease Status'] ?? '').toString().trim().toLowerCase();
    if (!status) return false;
    if (status.includes('model') || status.includes('admin') || status.includes('corporate') || status.includes('free') || status.includes('down')) return false;
    if (status.includes('vacant')) return status.includes('leased');
    return !isOccupiedNTV(row);
  }).length;

  if (process.env.DEBUG_LEASING_UNITS === 'true' || process.env.DEBUG_LEASING_UNITS === '1') {
    const statusKey = (r: Record<string, unknown>) =>
      (r.UnitLeaseStatus ?? r['Unit/Lease Status'] ?? '').toString().trim();
    const unitKeyOf = (r: Record<string, unknown>) => {
      const plan = normPlan(r.FloorPlan ?? r['Floor Plan'] ?? '');
      const num = (r.UnitNumber ?? r['Unit #'] ?? '').toString().trim();
      const des = (r.UnitDesignation ?? r['Unit Designation'] ?? '').toString().trim();
      return `${plan}-${(num || des || '').toLowerCase()}`;
    };
    const unitsLog = deduplicatedUnits.map((r) => {
      const row = r as Record<string, unknown>;
      const uk = unitKeyOf(row);
      const status = statusKey(row);
      const occupied = isOccupiedBoxscoreLogic(row, latestReportDate, { unitKeysWithApplicantRow });
      const leased = (() => {
        const s = status.toLowerCase();
        if (!s) return false;
        if (s.includes('model') || s.includes('admin') || s.includes('corporate') || s.includes('free') || s.includes('down')) return false;
        if (s.includes('vacant')) return s.includes('leased');
        return !isOccupiedNTV(row);
      })();
      return { unitKey: uk, status, occupied, leased };
    });
    const occupancyPct = totalUnits > 0 ? Math.round((currentOccupied / totalUnits) * 10000) / 100 : null;
    console.log('[DEBUG_LEASING_UNITS]', {
      property: prop,
      latestReportDate: latestReportDate?.toISOString?.()?.slice(0, 10),
      totalUnits,
      occupied: currentOccupied,
      leased: currentLeased,
      occupancyPct,
      leasedPct: totalUnits > 0 ? Math.round((currentLeased / totalUnits) * 10000) / 100 : null,
      units: unitsLog,
    });
  }

  return { occupied: currentOccupied, leased: currentLeased, totalUnits };
}

/**
 * RealPage BOXSCORE controllable availability (exact port from app.js calculateAvailableUnitsFromDetails).
 * Available = Net Exposure - Model/Admin - Down; Net Exposure = (Total Vacant - Vacant Leased) + (Occupied On Notice - Occupied On Notice Preleased).
 */
function getAvailableUnitsFromDetails(
  prop: string,
  portfolioUnitDetails: Record<string, unknown>[],
  asOf?: Date
): { availableUnits: number; totalUnitsFromDetails: number } | null {
  const pKey = normPropCanonical(prop);
  if (!Array.isArray(portfolioUnitDetails) || portfolioUnitDetails.length === 0) return null;
  let allReportDates = portfolioUnitDetails
    .map((r) => reportDateFromPortfolioRow(r as Record<string, unknown>))
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime());
  if (asOf) {
    const cap = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 23, 59, 59, 999);
    allReportDates = allReportDates.filter((d) => d.getTime() <= cap.getTime());
  }
  const latestReportDate = allReportDates.length > 0 ? allReportDates[0] : null;
  if (!latestReportDate) return null;
  const propUnitDetails = portfolioUnitDetails.filter((r) => {
    const rProp = normPropCanonical((r as Record<string, unknown>).Property ?? (r as Record<string, unknown>).propertyName ?? '');
    if (rProp !== pKey) return false;
    const reportDate = reportDateFromPortfolioRow(r as Record<string, unknown>);
    return reportDate && reportDate.getTime() === latestReportDate.getTime();
  });
  const unitMap = new Map<string, Record<string, unknown>>();
  const unitsWithoutId: Record<string, unknown>[] = [];
  let rowIndex = 0;
  for (const r of propUnitDetails) {
    const row = r as Record<string, unknown>;
    const unitNum = (row.UnitNumber ?? row['Unit #'] ?? '').toString().trim();
    const unitDesignation = (row.UnitDesignation ?? row['Unit Designation'] ?? '').toString().trim();
    const plan = normPlan(row.FloorPlan ?? row['Floor Plan'] ?? '');
    const unitKey = `${plan}-${(unitNum || unitDesignation || '').toLowerCase()}`;
    if (!unitNum && !unitDesignation) {
      unitsWithoutId.push({ ...row, _rowIndex: rowIndex });
      rowIndex++;
      continue;
    }
    const existing = unitMap.get(unitKey);
    if (!existing) {
      unitMap.set(unitKey, row);
    } else {
      const existingStatus = (existing.UnitLeaseStatus ?? existing['Unit/Lease Status'] ?? '').toString();
      const currentStatus = (row.UnitLeaseStatus ?? row['Unit/Lease Status'] ?? '').toString();
      const existingPriority = getStatusPriorityForDedup(existingStatus);
      const currentPriority = getStatusPriorityForDedup(currentStatus);
      if (currentPriority < existingPriority) {
        unitMap.set(unitKey, row);
      } else if (currentPriority === existingPriority) {
        const existingDate = parseDate(existing.ReportDate ?? existing.reportDate);
        const currentDate = parseDate(row.ReportDate ?? row.reportDate);
        if (currentDate && (!existingDate || currentDate > existingDate)) unitMap.set(unitKey, row);
      }
    }
  }
  const deduplicatedUnits = Array.from(unitMap.values()).concat(unitsWithoutId);
  const totalUnitsFromDetails = deduplicatedUnits.length;

  const getStatus = (r: Record<string, unknown>) => (r.UnitLeaseStatus ?? r['Unit/Lease Status'] ?? '').toString().trim();
  const hasNotice = (r: Record<string, unknown>) => parseDate(r.Notice ?? r['Notice'] ?? r['Notice Date'] ?? r.NoticeDate ?? r['Notice Given'] ?? r.NoticeGiven ?? r['Notice Given Date'] ?? r.NoticeGivenDate) != null;

  type Class = { unit: Record<string, unknown>; status: string; isModel: boolean; isAdmin: boolean; isDown: boolean; isVacant: boolean; isVacantLeased: boolean; isOccupied: boolean; isOccupiedNTV: boolean; isOccupiedNTVL: boolean; hasNotice: boolean };
  const unitClassifications: Class[] = deduplicatedUnits.map((r) => {
    const status = getStatus(r);
    const statusLower = status.toLowerCase();
    const isModel = statusLower === 'model' || status === 'MODEL' || statusLower.includes('model/');
    const isAdmin = statusLower.includes('admin');
    const isDown = statusLower.includes('down');
    const isVacant = statusLower.includes('vacant') || isModel || isAdmin || isDown;
    const isVacantLeased = (statusLower.includes('vacant') && statusLower.includes('leased')) || statusLower.includes('vacant-leased');
    const isOccupied = statusLower.includes('occupied') && !statusLower.includes('vacant');
    const hasNTVStatus = statusLower.includes('ntv') && !statusLower.includes('ntvl');
    const hasNTVLStatus = statusLower.includes('ntvl');
    const leaseStart = parseDate(r.LeaseStart ?? r['Lease Start']);
    const isPreLeasedUnit = (leaseStart && latestReportDate && leaseStart > latestReportDate) || (statusLower.includes('vacant') && statusLower.includes('leased'));
    const isOccupiedNTVL = isOccupied && (hasNTVLStatus || (hasNotice(r) && isPreLeasedUnit));
    const isOccupiedNTV = isOccupied && !isOccupiedNTVL && (hasNTVStatus || (hasNotice(r) && !isPreLeasedUnit));
    return { unit: r, status, isModel, isAdmin, isDown, isVacant, isVacantLeased, isOccupied, isOccupiedNTV, isOccupiedNTVL, hasNotice: hasNotice(r) };
  });

  const isImmediateMoveOut = (r: Record<string, unknown>, noticeDate: Date | null, moveOutDate: Date | null): boolean => {
    if (moveOutDate || !noticeDate || !latestReportDate) return false;
    const noticeDay = new Date(noticeDate.getFullYear(), noticeDate.getMonth(), noticeDate.getDate()).getTime();
    const reportDay = new Date(latestReportDate.getFullYear(), latestReportDate.getMonth(), latestReportDate.getDate()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (noticeDay === reportDay - oneDayMs) return true;
    if (noticeDay === reportDay) return !(r.UnitLeaseStatus ?? r['Unit/Lease Status'] ?? '').toString().toLowerCase().includes('ntv');
    return false;
  };

  const parseMoveOut = (r: Record<string, unknown>) => parseDate(r.MoveOut ?? r['Move Out'] ?? r['Move Out Date'] ?? r.MoveOutDate ?? r['Move-Out'] ?? r['Move-Out Date']);
  const parseNotice = (r: Record<string, unknown>) => parseDate(r.Notice ?? r['Notice'] ?? r['Notice Date'] ?? r.NoticeDate ?? r['Notice Given'] ?? r.NoticeGiven ?? r['Notice Given Date'] ?? r.NoticeGivenDate);

  const totalVacantUnits = unitClassifications.filter((u) => {
    if (u.isVacant) return true;
    const r = u.unit;
    const moveOutDate = parseMoveOut(r);
    const noticeDate = parseNotice(r);
    if (u.isOccupied && isImmediateMoveOut(r, noticeDate, moveOutDate)) return true;
    if (moveOutDate && latestReportDate && moveOutDate <= latestReportDate) return true;
    if (u.isOccupiedNTVL && !moveOutDate && noticeDate && latestReportDate && noticeDate < latestReportDate) return true;
    return false;
  }).length;

  const vacantUnitsLeased = unitClassifications.filter((u) => {
    const r = u.unit;
    const leaseStart = parseDate(r.LeaseStart ?? r['Lease Start']);
    if (u.isVacantLeased) {
      if (leaseStart && latestReportDate && leaseStart <= latestReportDate) return false;
      return true;
    }
    if (u.isVacant && !u.isVacantLeased && !u.isModel && !u.isAdmin && !u.isDown && leaseStart && latestReportDate && leaseStart > latestReportDate) return true;
    const moveOutDate = parseMoveOut(r);
    const noticeDate = parseNotice(r);
    if (u.isOccupied && isImmediateMoveOut(r, noticeDate, moveOutDate)) return (leaseStart && latestReportDate && leaseStart > latestReportDate);
    const hasMovedOut = (moveOutDate && latestReportDate && moveOutDate <= latestReportDate) || (u.isOccupiedNTVL && !moveOutDate && noticeDate && latestReportDate && noticeDate < latestReportDate);
    if (hasMovedOut && leaseStart && latestReportDate && leaseStart > latestReportDate) return true;
    return false;
  }).length;

  const occupiedOnNotice = unitClassifications.filter((u) => {
    const r = u.unit;
    const noticeDate = parseNotice(r);
    const moveOutDate = parseMoveOut(r);
    if (u.isOccupied && isImmediateMoveOut(r, noticeDate, moveOutDate)) return false;
    if (!(u.isOccupiedNTV || u.isOccupiedNTVL) && !(u.isOccupied && noticeDate != null)) return false;
    if (u.isOccupiedNTVL) {
      if (noticeDate && latestReportDate && noticeDate.getTime() === latestReportDate.getTime()) return true;
      if (moveOutDate && latestReportDate && moveOutDate <= latestReportDate) return false;
      if (!moveOutDate && noticeDate && latestReportDate && noticeDate < latestReportDate) return false;
      return true;
    }
    if (u.isOccupied && !u.isOccupiedNTV && !u.isOccupiedNTVL && noticeDate && latestReportDate && noticeDate.getTime() === latestReportDate.getTime()) return true;
    if (u.isOccupiedNTV) return true;
    return false;
  }).length;

  const occupiedOnNoticePreleased = unitClassifications.filter((u) => {
    if (!u.isOccupiedNTVL) return false;
    const r = u.unit;
    const noticeDate = parseNotice(r);
    const moveOutDate = parseMoveOut(r);
    if (noticeDate && latestReportDate && noticeDate.getTime() === latestReportDate.getTime()) return false;
    if (moveOutDate && latestReportDate && moveOutDate <= latestReportDate) return false;
    if (!moveOutDate && noticeDate && latestReportDate && noticeDate < latestReportDate) return false;
    return true;
  }).length;

  const netExposure = (totalVacantUnits - vacantUnitsLeased) + (occupiedOnNotice - occupiedOnNoticePreleased);
  const modelAdmin = unitClassifications.filter((u) => u.isModel || u.isAdmin).length;
  const down = unitClassifications.filter((u) => u.isDown).length;
  const availableUnits = netExposure - modelAdmin - down;
  return { availableUnits: Math.max(0, availableUnits), totalUnitsFromDetails };
}

/** Base plan type for weighted avg rent (exact port from app.js getBasePlanType). */
function getBasePlanType(planName: string): string {
  if (!planName) return '';
  const str = planName.toString().trim().toUpperCase();
  const match = str.match(/^(\d+B\d+B|STUDIO|STUDIO\*|STUDIO-\w+)/);
  if (match) return match[1].replace(/\*/g, '').replace(/-\w+$/, '');
  const genericMatch = str.match(/^(\d+B\d+B)/);
  if (genericMatch) return genericMatch[1];
  if (str.match(/^A\d*$/)) return '1B1B';
  if (str.match(/^B\d*$/)) return '2B2B';
  if (str.match(/^C\d*$/)) return '3B2B';
  return str;
}

/**
 * Avg Leased Rent (weighted by base plan) – exact port from app.js weightedOccupiedAvgRent.
 * LEASED units only (No NTV + NTV-L), exclude NTV-NL; same dedupe as boxscore; LeaseRent.
 */
function getWeightedOccupiedAvgRent(
  prop: string,
  portfolioUnitDetails: Record<string, unknown>[]
): number | null {
  const occResult = getOccupancyAndLeasedForProperty(prop, portfolioUnitDetails);
  if (!occResult) return null;
  const pKey = normPropCanonical(prop);
  const pud = portfolioUnitDetails.filter((r) => normPropCanonical((r as Record<string, unknown>).Property ?? (r as Record<string, unknown>).propertyName ?? '') === pKey);
  let allReportDates = pud.map((r) => parseDate((r as Record<string, unknown>).ReportDate ?? (r as Record<string, unknown>).reportDate)).filter((d): d is Date => d != null).sort((a, b) => b.getTime() - a.getTime());
  const latestReportDate = allReportDates.length > 0 ? allReportDates[0] : null;
  if (!latestReportDate) return null;
  const latestPropUnitDetails = pud.filter((r) => {
    const d = parseDate((r as Record<string, unknown>).ReportDate ?? (r as Record<string, unknown>).reportDate);
    return d && d.getTime() === latestReportDate.getTime();
  });
  const unitMap = new Map<string, Record<string, unknown>>();
  const unitsWithoutId: Record<string, unknown>[] = [];
  let rowIndex = 0;
  for (const r of latestPropUnitDetails) {
    const row = r as Record<string, unknown>;
    const unitNum = (row.UnitNumber ?? row['Unit #'] ?? row.Unit ?? '').toString().trim();
    const unitDesignation = (row.UnitDesignation ?? row['Unit Designation'] ?? '').toString().trim();
    const plan = normPlan(row.FloorPlan ?? row['Floor Plan'] ?? '');
    const unitKey = `${plan}-${(unitNum || unitDesignation || '').toLowerCase()}`;
    if (!unitNum && !unitDesignation) {
      unitsWithoutId.push({ ...row, _rowIndex: rowIndex });
      rowIndex++;
      continue;
    }
    const existing = unitMap.get(unitKey);
    if (!existing) {
      unitMap.set(unitKey, row);
    } else {
      const existingStatus = (existing.UnitLeaseStatus ?? existing['Unit/Lease Status'] ?? '').toString();
      const currentStatus = (row.UnitLeaseStatus ?? row['Unit/Lease Status'] ?? '').toString();
      const existingPriority = getStatusPriorityForDedup(existingStatus);
      const currentPriority = getStatusPriorityForDedup(currentStatus);
      if (currentPriority < existingPriority) unitMap.set(unitKey, row);
      else if (currentPriority === existingPriority) {
        const existingDate = parseDate(existing.ReportDate ?? existing.reportDate);
        const currentDate = parseDate(row.ReportDate ?? row.reportDate);
        if (currentDate && (!existingDate || currentDate > existingDate)) unitMap.set(unitKey, row);
      }
    }
  }
  const deduplicatedUnits = Array.from(unitMap.values()).concat(unitsWithoutId);
  const planTypeGroups = new Map<string, { rents: number[]; count: number }>();
  for (const r of deduplicatedUnits) {
    const row = r as Record<string, unknown>;
    const status = (row.UnitLeaseStatus ?? row['Unit/Lease Status'] ?? '').toString().trim().toLowerCase();
    if (status === 'model' || status.includes('admin') || status.includes('down')) continue;
    if (status.includes('vacant') && !status.includes('leased')) continue;
    let isLeasedForRent = false;
    if (status.includes('occupied')) {
      const moveOutDate = parseDate(row.MoveOut ?? row['Move Out'] ?? row['Move Out Date'] ?? row.MoveOutDate ?? row['Move-Out'] ?? row['Move-Out Date']);
      const noticeDate = parseDate(row.Notice ?? row['Notice'] ?? row['Notice Date'] ?? row.NoticeDate ?? row['Notice Given'] ?? row.NoticeGiven ?? row['Notice Given Date'] ?? row.NoticeGivenDate);
      if (status.includes('ntvl') && moveOutDate && moveOutDate < latestReportDate) continue;
      if (status.includes('ntvl') && !moveOutDate && noticeDate && noticeDate < latestReportDate) continue;
      if (status.includes('ntv') && !status.includes('ntvl')) continue;
      isLeasedForRent = true;
    }
    if (!isLeasedForRent && status.includes('vacant') && status.includes('leased')) {
      const leaseStart = parseDate(row.LeaseStart ?? row['Lease Start'] ?? row['Lease Start Date'] ?? row.LeaseStartDate);
      if (leaseStart && leaseStart > latestReportDate) continue;
      isLeasedForRent = true;
    }
    if (!isLeasedForRent) continue;
    const leaseRent = num(row.LeaseRent ?? row['Lease Rent']);
    if (leaseRent == null || leaseRent <= 0) continue;
    const floorPlan = normPlan(row.FloorPlan ?? row['Floor Plan'] ?? '');
    const basePlan = getBasePlanType(floorPlan);
    if (!basePlan) continue;
    if (!planTypeGroups.has(basePlan)) planTypeGroups.set(basePlan, { rents: [], count: 0 });
    const g = planTypeGroups.get(basePlan)!;
    g.rents.push(leaseRent);
    g.count += 1;
  }
  if (planTypeGroups.size === 0) return null;
  let totalWeightedSum = 0;
  let totalOccupiedUnitsWithRent = 0;
  for (const [, group] of planTypeGroups) {
    if (group.rents.length === 0) continue;
    const planAvgRent = group.rents.reduce((a, b) => a + b, 0) / group.rents.length;
    totalWeightedSum += planAvgRent * group.count;
    totalOccupiedUnitsWithRent += group.count;
  }
  return totalOccupiedUnitsWithRent > 0 ? totalWeightedSum / totalOccupiedUnitsWithRent : null;
}

export interface VelocityBreakdown {
  newLeases7d: number;
  newLeases28d: number;
  renewal7d: number;
  renewal28d: number;
}

export interface PropertyKpis {
  property: string;
  occupied: number;
  leased: number;
  available: number;
  totalUnits: number;
  occupancyPct: number | null;
  budgetedOccupancyUnits: number | null;
  budgetedOccupancyPct: number | null;
  avgLeasedRent: number | null;
  leases7d: number | null;
  leases28d: number | null;
  deltaToBudget: number | null;
  /** When velocity is computed from PUD (app-signed date), New/Renewal breakdown. */
  velocityBreakdown?: VelocityBreakdown | null;
  /** 4-week look-ahead occupancy % (optional override, e.g. from Performance Overview). */
  projectedOccupancy4WeeksPct?: number | null;
}

export interface PortfolioKpis {
  properties: number;
  totalUnits: number;
  occupied: number;
  leased: number;
  available: number;
  occupancyPct: number | null;
  avgLeasedRent: number | null;
  leases7d: number | null;
  leases28d: number | null;
  deltaToBudget: number | null;
  byProperty: Record<string, PropertyKpis>;
  latestReportDate: string | null;
}

/** Build velocity (7d/28d) from leasing rows – latest row per property by date. */
function getVelocityFromLeasing(
  leasing: Record<string, unknown>[],
  propertyFilter?: string
): { byProperty: Record<string, { leases7d: number; leases28d: number }>; portfolio7d: number; portfolio28d: number } {
  const v7 = '7DayLeasingVelocity';
  const v28 = '28DayLeasingVelocity';
  const property = 'Property';
  const dateCol = 'MonthOf';
  const latestByProp = new Map<string, Record<string, unknown>>();
  for (const r of leasing ?? []) {
    const row = r as Record<string, unknown>;
    const prop = normPropCanonical(row[property]);
    const d = parseDate(row[dateCol] ?? row.BatchTimestamp);
    if (!prop || !d) continue;
    if (propertyFilter && normPropCanonical(propertyFilter) !== prop) continue;
    const prev = latestByProp.get(prop);
    if (!prev || (parseDate(prev[dateCol]) ?? new Date(0)) < d) latestByProp.set(prop, row);
  }
  const byProperty: Record<string, { leases7d: number; leases28d: number }> = {};
  let portfolio7d = 0;
  let portfolio28d = 0;
  for (const [prop, row] of latestByProp) {
    const v7Val = num(row[v7] ?? row['7DayLeasingVelocity']) ?? 0;
    const v28Val = num(row[v28] ?? row['28DayLeasingVelocity']) ?? 0;
    byProperty[prop] = { leases7d: v7Val, leases28d: v28Val };
    portfolio7d += v7Val;
    portfolio28d += v28Val;
  }
  return { byProperty, portfolio7d, portfolio28d };
}

/** Lease type from row (same candidates as frontend getRawLeaseTypeFromRow / normalizeLeaseType). */
function getLeaseTypeFromRow(r: Record<string, unknown>): 'New' | 'Renewal' | null {
  const raw =
    (r.LeaseType ?? r['Lease Type'] ?? r['Current Lease Type'] ?? r.CurrentLeaseType ?? r['Lease Type (Current)'] ?? '')
      .toString()
      .trim();
  const lower = raw.toLowerCase();
  if (!raw) {
    const status = (r.UnitLeaseStatus ?? r['Unit/Lease Status'] ?? '').toString().toLowerCase();
    if (status.includes('pending renewal')) return 'Renewal';
    return null;
  }
  if (lower === 'new' || lower.startsWith('new ') || lower.includes('new lease')) return 'New';
  if (lower === 'renewal' || lower.startsWith('renewal') || lower.includes('renew')) return 'Renewal';
  return null;
}

/**
 * Velocity from portfolio unit details (app-signed date, New/Renewal by lease type).
 * Matches frontend calculateVelocityFromUnitDetails: app date only, 7-day = [refDate-7, refDate], 28-day = [refDate-27, refDate].
 */
function getVelocityFromPortfolioUnitDetails(
  prop: string,
  portfolioUnitDetails: Record<string, unknown>[],
  asOf?: Date
): {
  leases7d: number;
  leases28d: number;
  newLeases7d: number;
  newLeases28d: number;
  renewal7d: number;
  renewal28d: number;
} | null {
  const pKey = normPropCanonical(prop);
  if (!Array.isArray(portfolioUnitDetails) || portfolioUnitDetails.length === 0) return null;
  const propUnits = portfolioUnitDetails.filter((r) => {
    const rProp = normPropCanonical((r as Record<string, unknown>).Property ?? (r as Record<string, unknown>).propertyName ?? '');
    return rProp === pKey;
  });
  if (propUnits.length === 0) return null;

  const refDate = asOf ? new Date(asOf) : new Date();
  refDate.setHours(23, 59, 59, 999);
  const cutoff7 = new Date(refDate);
  cutoff7.setDate(cutoff7.getDate() - 7);
  cutoff7.setHours(0, 0, 0, 0);
  const cutoff28 = new Date(refDate);
  cutoff28.setDate(cutoff28.getDate() - 27);
  cutoff28.setHours(0, 0, 0, 0);

  const appDateKeys = [
    'CurrentLeaseAppSignedDate',
    'Current Lease App Signed Date',
    'Current Lease | App Signed Date',
    'AppSignedDate',
    'App Signed Date',
    'ApplicationDate',
    'Application Date',
  ];
  const hasAppDate = (row: Record<string, unknown>) => {
    for (const k of appDateKeys) {
      const d = parseDate(row[k]);
      if (d) return true;
    }
    return false;
  };
  const getAppDate = (row: Record<string, unknown>): Date | null => {
    for (const k of appDateKeys) {
      const d = parseDate(row[k]);
      if (d) return d;
    }
    return null;
  };

  const unitMap = new Map<string, Record<string, unknown>>();
  for (const r of propUnits) {
    const row = r as Record<string, unknown>;
    const unitNum = (row.UnitNumber ?? row['Unit #'] ?? '').toString().trim();
    const unitDesignation = (row.UnitDesignation ?? row['Unit Designation'] ?? '').toString().trim();
    const unitKey = (unitNum || unitDesignation || '').toLowerCase();
    if (!unitKey) continue;
    const existing = unitMap.get(unitKey);
    const rHasApp = hasAppDate(row);
    if (!existing) {
      unitMap.set(unitKey, row);
      continue;
    }
    const existingHasApp = hasAppDate(existing);
    const reportDate = parseDate(row.ReportDate ?? row.reportDate ?? row['Report Date']);
    const existingReportDate = parseDate(existing.ReportDate ?? existing.reportDate ?? existing['Report Date']);
    if (rHasApp && !existingHasApp) {
      unitMap.set(unitKey, row);
    } else if (!rHasApp && existingHasApp) {
      // keep existing
    } else if (reportDate && (!existingReportDate || reportDate > existingReportDate)) {
      unitMap.set(unitKey, row);
    }
  }

  const seenLeases = new Set<string>();
  let leases7d = 0;
  let leases28d = 0;
  let newLeases7d = 0;
  let newLeases28d = 0;
  let renewal7d = 0;
  let renewal28d = 0;

  for (const row of unitMap.values()) {
    const appSignedDate = getAppDate(row);
    if (!appSignedDate) continue;
    const status = (row.UnitLeaseStatus ?? row['Unit/Lease Status'] ?? '').toString().toLowerCase();
    if (status === 'model' || status.includes('admin') || status.includes('down')) continue;
    const unitNum = (row.UnitNumber ?? row['Unit #'] ?? '').toString().trim();
    const unitDesignation = (row.UnitDesignation ?? row['Unit Designation'] ?? '').toString().trim();
    const unitKey = (unitNum || unitDesignation || '').toLowerCase();
    const leaseKey = `${unitKey}|${appSignedDate.getTime()}`;
    if (seenLeases.has(leaseKey)) continue;
    seenLeases.add(leaseKey);

    const in7 = appSignedDate.getTime() >= cutoff7.getTime() && appSignedDate.getTime() <= refDate.getTime();
    const in28 = appSignedDate.getTime() >= cutoff28.getTime() && appSignedDate.getTime() <= refDate.getTime();
    const leaseType = getLeaseTypeFromRow(row);

    if (in7) {
      leases7d++;
      if (leaseType === 'New') newLeases7d++;
      else if (leaseType === 'Renewal') renewal7d++;
    }
    if (in28) {
      leases28d++;
      if (leaseType === 'New') newLeases28d++;
      else if (leaseType === 'Renewal') renewal28d++;
    }
  }

  return {
    leases7d,
    leases28d,
    newLeases7d,
    newLeases28d,
    renewal7d,
    renewal28d,
  };
}

/**
 * Occupancy/leased from Unit Mix (RealPage – same definition as frontend app.js).
 * Most recent ReportDate only; dedupe by PropertyName|UnitType|FloorPlan.
 * Per property: totalUnits = sum(TotalUnits), occupied = sum(TotalUnits * PercentOccupied/100), leased = sum(TotalUnits * percentLeased/100).
 */
function getOccupancyFromUnitMix(
  unitmixRows: Record<string, unknown>[],
  propertyFilter?: string
): { byProperty: Record<string, { totalUnits: number; occupied: number; leased: number; occupancyPct: number | null }> } {
  const byProperty: Record<string, { totalUnits: number; occupied: number; leased: number; occupancyPct: number | null }> = {};
  if (!Array.isArray(unitmixRows) || unitmixRows.length === 0) return { byProperty };

  const reportDate = 'ReportDate';
  const propertyName = 'PropertyName';
  const unitType = 'UnitType';
  const floorPlan = 'FloorPlan';
  const totalUnitsCol = 'TotalUnits';
  const pctOcc = 'PercentOccupied';
  const pctLeased = 'percentLeased';

  let latestDate: Date | null = null;
  for (const r of unitmixRows) {
    const d = parseDate((r as Record<string, unknown>)[reportDate]);
    if (d && (!latestDate || d > latestDate)) latestDate = d;
  }
  if (!latestDate) return { byProperty };

  const onLatest = unitmixRows.filter((r) => {
    const d = parseDate((r as Record<string, unknown>)[reportDate]);
    return d && d.getTime() === latestDate!.getTime();
  });

  const seen = new Set<string>();
  for (const r of onLatest) {
    const row = r as Record<string, unknown>;
    const prop = normProp(row[propertyName] ?? row['Property'] ?? '');
    if (propertyFilter && normPropCanonical(prop) !== propertyFilter) continue;
    const ut = (row[unitType] ?? '').toString().trim();
    const plan = normPlan(row[floorPlan] ?? '');
    const key = `${prop}|${ut}|${plan}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const units = num(row[totalUnitsCol]) ?? 0;
    const pctO = num(row[pctOcc]) ?? 0;
    const pctL = num(row[pctLeased]) ?? 0;
    const occupiedRow = units * (pctO / 100);
    const leasedRow = units * (pctL / 100);

    if (!byProperty[prop]) byProperty[prop] = { totalUnits: 0, occupied: 0, leased: 0, occupancyPct: null };
    byProperty[prop].totalUnits += units;
    byProperty[prop].occupied += occupiedRow;
    byProperty[prop].leased += leasedRow;
  }

  for (const prop of Object.keys(byProperty)) {
    const tot = byProperty[prop].totalUnits;
    byProperty[prop].occupancyPct = tot > 0 ? Math.round((byProperty[prop].occupied / tot) * 10000) / 100 : null;
  }
  // Collapse by canonical key: same property with different casing (e.g. "The Waters at Millerville" vs "THE WATERS AT MILLERVILLE") — keep the entry with max totalUnits
  const byCanonical: Record<string, { totalUnits: number; occupied: number; leased: number; occupancyPct: number | null }> = {};
  for (const [prop, data] of Object.entries(byProperty)) {
    const can = normPropCanonical(prop);
    if (!byCanonical[can] || byCanonical[can].totalUnits < data.totalUnits) byCanonical[can] = data;
  }
  return { byProperty: byCanonical };
}

/** Delta to budget = current occupied - budgeted occupancy target. Uses leasing row LeasesNeeded when present (delta), else occupied - (total * budgetPct) from unit mix. */
function getDeltaToBudgetFromLeasing(
  leasing: Record<string, unknown>[],
  occupiedByProperty: Record<string, number>,
  unitsByProperty: Record<string, number>
): { byProperty: Record<string, number>; portfolio: number } {
  const property = 'Property';
  const dateCol = 'MonthOf';
  const leasesNeeded = 'LeasesNeeded';
  const latestByProp = new Map<string, Record<string, unknown>>();
  for (const r of leasing ?? []) {
    const row = r as Record<string, unknown>;
    const prop = normPropCanonical(row[property]);
    const d = parseDate(row[dateCol] ?? row.BatchTimestamp);
    if (!prop || !d) continue;
    const prev = latestByProp.get(prop);
    if (!prev || (parseDate(prev[dateCol]) ?? new Date(0)) < d) latestByProp.set(prop, row);
  }
  const byProperty: Record<string, number> = {};
  let portfolio = 0;
  for (const [prop, row] of latestByProp) {
    const occ = occupiedByProperty[prop] ?? 0;
    const total = unitsByProperty[prop] ?? 0;
    const needed = num(row[leasesNeeded] ?? row['Leases Needed']);
    const delta = needed != null ? -needed : (total > 0 ? occ - total : 0);
    byProperty[prop] = delta;
    portfolio += delta;
  }
  return { byProperty, portfolio };
}

/**
 * Build full portfolio and by-property KPIs from raw data.
 * Optional property filter: when set, only that property is included in byProperty and portfolio is that property's totals.
 */
export function buildKpis(
  raw: LeasingDashboardRaw,
  options?: {
    asOf?: string;
    property?: string;
    mmrOcc?: Record<string, number>;
    mmrBudgetedOcc?: Record<string, number>;
    mmrBudgetedOccPct?: Record<string, number>;
    mmrCurrentLeasedPct?: Record<string, number>;
  }
): PortfolioKpis {
  const asOfDate = options?.asOf ? parseDate(options.asOf) ?? undefined : undefined;
  const propertyFilter = options?.property?.trim() || undefined;
  const pud = raw.portfolioUnitDetails ?? [];
  const leasing = raw.leasing ?? [];
  const unitmixOcc = getOccupancyFromUnitMix(raw.unitmix ?? [], propertyFilter ? normPropCanonical(propertyFilter) : undefined);

  const propertyKeys = new Set<string>();
  const displayKeyByCanonical: Record<string, string> = {};
  if (leasing.length > 0) {
    leasing.forEach((r) => {
      const row = r as Record<string, unknown>;
      const displayKey = normProp(row.Property ?? '');
      const can = normPropCanonical(displayKey);
      if (!can) return;
      if (propertyFilter && normPropCanonical(propertyFilter) !== can) return;
      propertyKeys.add(can);
      if (!displayKeyByCanonical[can]) displayKeyByCanonical[can] = displayKey;
    });
  }
  if (pud.length > 0) {
    pud.forEach((r) => {
      const row = r as Record<string, unknown>;
      const displayKey = normProp(row.Property ?? row.propertyName ?? '');
      const can = normPropCanonical(displayKey);
      if (!can) return;
      if (propertyFilter && normPropCanonical(propertyFilter) !== can) return;
      propertyKeys.add(can);
      if (!displayKeyByCanonical[can]) displayKeyByCanonical[can] = displayKey;
    });
  }
  Object.keys(unitmixOcc.byProperty).forEach((can) => {
    if (propertyFilter && normPropCanonical(propertyFilter) !== can) return;
    propertyKeys.add(can);
    if (!displayKeyByCanonical[can]) displayKeyByCanonical[can] = can;
  });

  const byProperty: Record<string, PropertyKpis> = {};
  let totalUnits = 0;
  let occupied = 0;
  let leased = 0;
  let available = 0;
  let weightedRentSum = 0;
  let weightedRentCount = 0;
  const occupiedByProperty: Record<string, number> = {};
  const unitsByProperty: Record<string, number> = {};

  for (const prop of propertyKeys) {
    const um = unitmixOcc.byProperty[prop];
    const occResult = getOccupancyAndLeasedForProperty(prop, pud, asOfDate);
    const avResult = getAvailableUnitsFromDetails(prop, pud, asOfDate);
    const avgRent = getWeightedOccupiedAvgRent(prop, pud);

    // Prefer PUD (RealPage boxscore) for occupancy/leased/available when we have portfolio unit details.
    if (occResult) {
      occupiedByProperty[prop] = occResult.occupied;
      unitsByProperty[prop] = occResult.totalUnits;
      totalUnits += occResult.totalUnits;
      occupied += occResult.occupied;
      leased += occResult.leased;
      available += avResult?.availableUnits ?? Math.max(0, occResult.totalUnits - occResult.leased);
    } else if (um && um.totalUnits > 0) {
      occupiedByProperty[prop] = Math.round(um.occupied);
      unitsByProperty[prop] = um.totalUnits;
      totalUnits += um.totalUnits;
      occupied += Math.round(um.occupied);
      leased += Math.round(um.leased);
      available += Math.max(0, um.totalUnits - Math.round(um.leased));
    } else if (avResult) {
      available += avResult.availableUnits;
    }
    const usedLeased = occResult?.leased ?? (um && um.totalUnits > 0 ? Math.round(um.leased) : 0);
    if (avgRent != null && usedLeased > 0) {
      weightedRentSum += avgRent * usedLeased;
      weightedRentCount += usedLeased;
    }
  }

  const velocityFromLeasing = getVelocityFromLeasing(leasing, propertyFilter);
  const delta = getDeltaToBudgetFromLeasing(leasing, occupiedByProperty, unitsByProperty);

  const velocityFromPudByProp: Record<string, { leases7d: number; leases28d: number; newLeases7d: number; newLeases28d: number; renewal7d: number; renewal28d: number }> = {};
  if (pud.length > 0) {
    for (const prop of propertyKeys) {
      const v = getVelocityFromPortfolioUnitDetails(prop, pud, asOfDate);
      if (v) velocityFromPudByProp[prop] = v;
    }
  }

  const mmrOcc = options?.mmrOcc ?? {};
  const mmrBudgetedOcc = options?.mmrBudgetedOcc ?? {};
  const mmrBudgetedOccPct = options?.mmrBudgetedOccPct ?? {};
  const mmrCurrentLeasedPct = options?.mmrCurrentLeasedPct ?? {};
  for (const prop of propertyKeys) {
    const um = unitmixOcc.byProperty[prop];
    const occResult = getOccupancyAndLeasedForProperty(prop, pud, asOfDate);
    const avResult = getAvailableUnitsFromDetails(prop, pud, asOfDate);
    const avgRent = getWeightedOccupiedAvgRent(prop, pud);
    const velPud = velocityFromPudByProp[prop];
    const velLeasing = velocityFromLeasing.byProperty[prop] ?? { leases7d: 0, leases28d: 0 };
    const vel = velPud
      ? { leases7d: velPud.leases7d, leases28d: velPud.leases28d }
      : velLeasing;
    const d = delta.byProperty[prop] ?? null;

    const usePud = occResult != null;
    const tot = usePud ? occResult.totalUnits : (um?.totalUnits ?? 0);
    let occ = usePud ? occResult.occupied : (um ? Math.round(um.occupied) : 0);
    let leas = usePud ? occResult.leased : (um ? Math.round(um.leased) : 0);
    const displayKey = displayKeyByCanonical[prop] ?? prop;
    const propKeyNorm = (prop ?? '').toString().trim().replace(/\*/g, '').toUpperCase();
    // Prefer MMR occupancy % when available (matches app.js: occupancy from MMR as source of truth)
    const mmrOccVal = mmrOcc[displayKey] ?? mmrOcc[prop] ?? mmrOcc[propKeyNorm] ?? null;
    let occPct: number | null = tot > 0 ? Math.round((occ / tot) * 10000) / 100 : null;
    if (mmrOccVal != null) {
      occPct = mmrOccVal <= 1 ? Math.round(mmrOccVal * 10000) / 100 : Math.round(mmrOccVal * 100) / 100;
      if (tot > 0) occ = Math.round((occPct / 100) * tot);
    }
    // Prefer MMR current leased % when available (matches app.js currentLeasedMap)
    const mmrLeasedVal = mmrCurrentLeasedPct[displayKey] ?? mmrCurrentLeasedPct[prop] ?? mmrCurrentLeasedPct[propKeyNorm] ?? null;
    if (mmrLeasedVal != null && tot > 0) {
      const leasedPctNorm = mmrLeasedVal <= 1 ? mmrLeasedVal * 100 : mmrLeasedVal;
      leas = Math.round((leasedPctNorm / 100) * tot);
    }
    const av = usePud
      ? (avResult?.availableUnits ?? Math.max(0, tot - leas))
      : (um ? Math.max(0, um.totalUnits - Math.round(um.leased)) : (avResult?.availableUnits ?? Math.max(0, tot - leas)));

    const budgetedUnits = mmrBudgetedOcc[displayKey] ?? mmrBudgetedOcc[prop] ?? mmrBudgetedOcc[propKeyNorm] ?? null;
    const budgetedPctRaw = mmrBudgetedOccPct[displayKey] ?? mmrBudgetedOccPct[prop] ?? mmrBudgetedOccPct[propKeyNorm] ?? null;
    // Normalize to 0-100 for display (app.js: budgetedOccPct <= 1 ? * 100 : as-is)
    const budgetedPct = budgetedPctRaw != null ? (budgetedPctRaw <= 1 ? budgetedPctRaw * 100 : budgetedPctRaw) : null;
    byProperty[prop] = {
      property: displayKey,
      occupied: occ,
      leased: leas,
      available: av,
      totalUnits: tot,
      occupancyPct: occPct,
      budgetedOccupancyUnits: budgetedUnits != null ? budgetedUnits : null,
      budgetedOccupancyPct: budgetedPct,
      avgLeasedRent: avgRent ?? null,
      leases7d: vel.leases7d,
      leases28d: vel.leases28d,
      deltaToBudget: d,
      velocityBreakdown:
        velPud != null
          ? {
              newLeases7d: velPud.newLeases7d,
              newLeases28d: velPud.newLeases28d,
              renewal7d: velPud.renewal7d,
              renewal28d: velPud.renewal28d,
            }
          : undefined,
    };
  }

  const latestReportDate =
    pud.length > 0
      ? (() => {
          const dates = pud.map((r) => reportDateFromPortfolioRow(r as Record<string, unknown>)).filter((d): d is Date => d != null);
          if (dates.length === 0) return null;
          dates.sort((a, b) => b.getTime() - a.getTime());
          return dates[0].toISOString().slice(0, 10);
        })()
      : null;

  // Output byProperty keyed by display name (so frontend can look up by row.Property)
  const byPropertyDisplay: Record<string, PropertyKpis> = {};
  for (const [canonical, data] of Object.entries(byProperty)) {
    const displayKey = displayKeyByCanonical[canonical] ?? canonical;
    byPropertyDisplay[displayKey] = data;
  }

  const portfolio7d = Object.values(byProperty).reduce((s, p) => s + (p.leases7d ?? 0), 0);
  const portfolio28d = Object.values(byProperty).reduce((s, p) => s + (p.leases28d ?? 0), 0);

  return {
    properties: Object.keys(byPropertyDisplay).length,
    totalUnits,
    occupied,
    leased,
    available,
    occupancyPct: totalUnits > 0 ? Math.round((occupied / totalUnits) * 10000) / 100 : null,
    avgLeasedRent: weightedRentCount > 0 ? weightedRentSum / weightedRentCount : null,
    leases7d: portfolio7d,
    leases28d: portfolio28d,
    deltaToBudget: delta.portfolio,
    byProperty: byPropertyDisplay,
    latestReportDate,
  };
}
