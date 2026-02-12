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

/** RealPage BOXSCORE occupied logic (matches frontend isOccupiedBoxscoreLogic). */
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
  const noticeInReportRange = reportDate && noticeDate && noticeDate.getTime() === reportDate.getTime();
  if (noticeInReportRange && unitKeysWithApplicantRow && unitKey && unitKeysWithApplicantRow.has(unitKey)) return false;
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
  const pKey = normProp(prop);
  if (!Array.isArray(portfolioUnitDetails) || portfolioUnitDetails.length === 0) return null;
  const propUnitDetails = portfolioUnitDetails.filter((r) => {
    const rProp = normProp(r.Property ?? r.propertyName ?? '');
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
  const pKey = normProp(prop);
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
    const rProp = normProp((r as Record<string, unknown>).Property ?? (r as Record<string, unknown>).propertyName ?? '');
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
  const pKey = normProp(prop);
  const pud = portfolioUnitDetails.filter((r) => normProp((r as Record<string, unknown>).Property ?? (r as Record<string, unknown>).propertyName ?? '') === pKey);
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
    const prop = normProp(row[property]);
    const d = parseDate(row[dateCol] ?? row.BatchTimestamp);
    if (!prop || !d) continue;
    if (propertyFilter && normProp(propertyFilter) !== prop) continue;
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
    const prop = normProp(row[property]);
    const d = parseDate(row[dateCol] ?? row.BatchTimestamp);
    if (!prop || !d) continue;
    const key = prop;
    const prev = latestByProp.get(key);
    if (!prev || (parseDate(prev[dateCol]) ?? new Date(0)) < d) latestByProp.set(key, row);
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
  options?: { asOf?: string; property?: string; mmrBudgetedOcc?: Record<string, number>; mmrBudgetedOccPct?: Record<string, number> }
): PortfolioKpis {
  const asOfDate = options?.asOf ? parseDate(options.asOf) ?? undefined : undefined;
  const propertyFilter = options?.property?.trim() || undefined;
  const pud = raw.portfolioUnitDetails ?? [];
  const leasing = raw.leasing ?? [];

  const propertyKeys = new Set<string>();
  if (pud.length > 0) {
    pud.forEach((r) => {
      const p = normProp((r as Record<string, unknown>).Property ?? (r as Record<string, unknown>).propertyName ?? '');
      if (p && (!propertyFilter || p === normProp(propertyFilter))) propertyKeys.add(p);
    });
  }
  if (leasing.length > 0) {
    leasing.forEach((r) => {
      const p = normProp((r as Record<string, unknown>).Property ?? '');
      if (p && (!propertyFilter || p === normProp(propertyFilter))) propertyKeys.add(p);
    });
  }

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
    const occResult = getOccupancyAndLeasedForProperty(prop, pud, asOfDate);
    const avResult = getAvailableUnitsFromDetails(prop, pud, asOfDate);
    const avgRent = getWeightedOccupiedAvgRent(prop, pud);
    if (occResult) {
      occupiedByProperty[prop] = occResult.occupied;
      unitsByProperty[prop] = occResult.totalUnits;
      totalUnits += occResult.totalUnits;
      occupied += occResult.occupied;
      leased += occResult.leased;
      available += avResult?.availableUnits ?? Math.max(0, occResult.totalUnits - occResult.leased);
    } else if (avResult) {
      available += avResult.availableUnits;
    }
    if (avgRent != null && occResult && occResult.leased > 0) {
      weightedRentSum += avgRent * occResult.leased;
      weightedRentCount += occResult.leased;
    }
  }

  const velocity = getVelocityFromLeasing(leasing, propertyFilter);
  const delta = getDeltaToBudgetFromLeasing(leasing, occupiedByProperty, unitsByProperty);

  const mmrBudgetedOcc = options?.mmrBudgetedOcc ?? {};
  const mmrBudgetedOccPct = options?.mmrBudgetedOccPct ?? {};
  for (const prop of propertyKeys) {
    const occResult = getOccupancyAndLeasedForProperty(prop, pud, asOfDate);
    const avResult = getAvailableUnitsFromDetails(prop, pud, asOfDate);
    const avgRent = getWeightedOccupiedAvgRent(prop, pud);
    const vel = velocity.byProperty[prop] ?? { leases7d: 0, leases28d: 0 };
    const d = delta.byProperty[prop] ?? null;
    const tot = occResult?.totalUnits ?? 0;
    const occ = occResult?.occupied ?? 0;
    const propKeyNorm = (prop ?? '').toString().trim().replace(/\*/g, '').toUpperCase();
    const budgetedUnits = mmrBudgetedOcc[prop] ?? mmrBudgetedOcc[propKeyNorm] ?? null;
    const budgetedPct = mmrBudgetedOccPct[prop] ?? mmrBudgetedOccPct[propKeyNorm] ?? null;
    byProperty[prop] = {
      property: prop,
      occupied: occ,
      leased: occResult?.leased ?? 0,
      available: avResult?.availableUnits ?? Math.max(0, tot - (occResult?.leased ?? 0)),
      totalUnits: tot,
      occupancyPct: tot > 0 ? Math.round((occ / tot) * 10000) / 100 : null,
      budgetedOccupancyUnits: budgetedUnits != null ? budgetedUnits : null,
      budgetedOccupancyPct: budgetedPct != null ? budgetedPct : null,
      avgLeasedRent: avgRent ?? null,
      leases7d: vel.leases7d,
      leases28d: vel.leases28d,
      deltaToBudget: d,
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

  return {
    properties: Object.keys(byProperty).length,
    totalUnits,
    occupied,
    leased,
    available,
    occupancyPct: totalUnits > 0 ? Math.round((occupied / totalUnits) * 10000) / 100 : null,
    avgLeasedRent: weightedRentCount > 0 ? weightedRentSum / weightedRentCount : null,
    leases7d: velocity.portfolio7d,
    leases28d: velocity.portfolio28d,
    deltaToBudget: delta.portfolio,
    byProperty,
    latestReportDate,
  };
}
