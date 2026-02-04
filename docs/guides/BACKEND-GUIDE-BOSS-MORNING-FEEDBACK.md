# Backend Guide: Boss Morning Feedback (Dashboard Improvements)

This document is for the **backend agent** and describes API/schema/data changes needed to support the dashboard improvements requested. The frontend will be updated in parallel where applicable.

---

## 1. Loans that convert from I/O to P&I prior to maturity

**Requirement:** Support loans that convert from interest-only (I/O) to principal & interest (P&I) before the stated maturity date.

**Backend tasks:**
- Add a **conversion date** (or “P&I start date”) to the Loans table if not present, e.g. `ConversionDate` or `PandIStartDate` (date).
- Ensure GET/POST/PUT for loans support this field so the dashboard can show “I/O through [date]” and “P&I from [date]”.
- If there is a separate “I/O term” and “amortizing term”, consider whether conversion is implied by those or needs an explicit date.

**Frontend:** Will display conversion date and/or P&I start and use it for flags/calculations.

---

## 2. Mini-perm rate info (same as I/O rate)

**Requirement:** Mini-perm rate should be structured like the I/O rate: fixed/floating option, index, spread, floor, ceiling, etc.

**Backend tasks:**
- Ensure the **Loans** (or relevant) table has mini-perm–specific rate fields, e.g.:
  - `MiniPermRateType` or equivalent (Fixed / Floating)
  - `MiniPermIndex`, `MiniPermSpread`
  - `MiniPermRateFloor`, `MiniPermRateCeiling` (if not already covered by existing floor/ceiling)
- Expose these via GET/POST/PUT so the dashboard can show the same UX as I/O (fixed vs floating, index, spread, floor, ceiling).

**Frontend:** Will add mini-perm rate section in loan detail with same controls as I/O (fixed/floating, index, spread, etc.).

---

## 3. Flag mismatches to loan amount

**Requirement:** Dashboard should flag when participations (and/or other debt) don’t match the loan amount.

**Backend tasks:**
- No strict API change required; the frontend can sum participations and compare to loan amount.
- Optional: add a computed field or validation endpoint that returns “participation total vs loan amount” so the dashboard can show a single source of truth or server-side warning.

**Frontend:** Will compare sum of participation amounts to loan amount and show a visual flag when they don’t match.

---

## 4. Lead Bank auto-populated, amount adjustable

**Requirement:** Lead bank should be auto-populated (e.g. from loan/facility data), but the amount (or participation %) should remain editable.

**Backend tasks:**
- If “lead” is determined by a flag (e.g. `IsLead` on participations), ensure the API returns it and supports PATCH/PUT to update participation amount/percent without changing lead status.
- If lead is derived from another source (e.g. first bank, or a dedicated “LeadBankId” on the loan), expose that so the frontend can pre-fill the lead bank; ensure participation amounts/percentages for that bank are still updatable via existing participation update endpoints.

**Frontend:** Will auto-populate lead bank from API and allow editing the amount/%.

---

## 5. Participation %s and Total Bank Exposure (double counting)

**Requirement:**  
- “The %s seem off” – participation percentages should be correct.  
- “Total Bank Exposure appears to be double counting their participations and the loan amount.”

**Backend tasks:**
- **Percentages:** Confirm how participation percent is stored and returned (e.g. 0–100 vs 0–1; whether it’s derived from amount/loan amount or stored directly). Document the convention so the frontend can display and validate correctly.
- **Total Bank Exposure:** Confirm whether “bank exposure” is intended to be:
  - (A) Sum of that bank’s participation amounts across deals (no loan amount added), or  
  - (B) Something that includes “loan amount” plus participations (which would double count if participations already sum to loan amount).
- If the API returns an “exposure” or “total” field, ensure it does not add loan amount and participation amount together for the same deal. Fix any such logic and document the intended formula.

**Frontend:** Fixed. When a bank is both lead and has a participation record, we use only the participation amount as that deal’s exposure (no loan amount + participation). Total Bank Exposure no longer double-counts. Participation amounts/percentages from API unchanged. “Total Bank Exposure” aggregation (e.g. use only participation totals, not participation + loan amount).

---

## 6. Participations → “Debt Structure” tab (styling / UX)

**Requirement:** Rename “Participations” tab to something like “Debt Structure” and improve styling and edit-mode usability.

**Backend tasks:** None. This is a frontend-only change (labels, CSS, and edit-mode hints).

---

## 7. Two “Add Equity Commitment” buttons

**Requirement:** Only one “Add Equity Commitment” button should appear.

**Backend tasks:** None. This is a frontend-only fix (single button in empty state and after table; dedupe on rebuild if needed).

---

## Summary checklist (backend)

| # | Item | Backend action |
|---|------|----------------|
| 1 | I/O to P&I conversion before maturity | Add conversion/P&I start date; expose in loan GET/POST/PUT |
| 2 | Mini-perm rate like I/O (fixed/floating, index, spread) | Add/mini-perm rate fields; expose in loan API |
| 3 | Flag mismatch to loan amount | Optional: computed/validation endpoint; frontend can compare sums |
| 4 | Lead Bank auto-populated, amount adjustable | Expose lead bank; ensure participation amount/% updatable |
| 5 | %s off; Total Bank Exposure double counting | Clarify % convention; fix exposure formula (no loan + participation double count) |
| 6 | Debt Structure tab / styling | Frontend only |
| 7 | Duplicate Add Equity Commitment button | Frontend only |

---

## Backend implementation notes (done)

- **Participation % convention:** `ParticipationPercent` is stored as NVARCHAR (e.g. `"32.0%"`, `"50%"`). The API also returns `CalculatedParticipationPercent` (and overwrites `ParticipationPercent` in list responses) as **0–100 with "%" suffix**, derived from `(ActiveExposure / totalActiveExposure) * 100` where ActiveExposure = `ExposureAmount` when not PaidOff, else 0. So display is 0–100; source of truth for calculation is `ExposureAmount` and the sum of active participations per loan/project.
- **Total Bank Exposure (no double count):** Bank exposure is **only** the sum of that bank’s participation `ExposureAmount` (active = not PaidOff). The API does **not** add loan amount and participation amount together; total exposure for a bank = sum of its participation amounts across deals. No backend change was required; frontend uses participation amounts only.
- **Participation vs loan amount:** Optional endpoint `GET /loans/:id/participation-summary` returns `{ loanId, loanAmount, participationTotal, participationActiveTotal, mismatch }` so the dashboard can show a server-side mismatch flag if desired.

---

*Document generated for backend agent; frontend changes are tracked in the dashboard repo.*
