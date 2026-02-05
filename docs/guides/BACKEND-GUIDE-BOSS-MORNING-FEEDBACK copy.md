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
| 9 | Show other admins in edit mode | Add presence/heartbeat; GET/POST edit-mode |
| 10 | Principal paydowns / current balance | Add CurrentBalance; expose in loan GET/POST/PUT |
| 11 | POST loans – return created loan | Return created loan in 201 response (OUTPUT + fetch) |
| 12 | Participation IsLead on PUT | Accept IsLead as boolean or "true"/"false"; schema IsLead |
| 13 | Delete loan (block only covenants/guarantees) | Cascade participations; block only on Covenant/Guarantee |
| 14 | Covenant ReminderDaysBefore/ReminderEmails | No action (frontend no longer sends) |

---

## Backend implementation notes (done)

- **Participation % convention:** `ParticipationPercent` is stored as NVARCHAR (e.g. `"32.0%"`, `"50%"`). The API also returns `CalculatedParticipationPercent` (and overwrites `ParticipationPercent` in list responses) as **0–100 with "%" suffix**, derived from `(ActiveExposure / totalActiveExposure) * 100` where ActiveExposure = `ExposureAmount` when not PaidOff, else 0. So display is 0–100; source of truth for calculation is `ExposureAmount` and the sum of active participations per loan/project.
- **Total Bank Exposure (no double count):** Bank exposure is **only** the sum of that bank’s participation `ExposureAmount` (active = not PaidOff). The API does **not** add loan amount and participation amount together; total exposure for a bank = sum of its participation amounts across deals. No backend change was required; frontend uses participation amounts only.
- **Participation vs loan amount:** Optional endpoint `GET /loans/:id/participation-summary` returns `{ loanId, loanAmount, participationTotal, participationActiveTotal, mismatch }` so the dashboard can show a server-side mismatch flag if desired.
- **§10 Current balance:** Schema `add_loan_current_balance.sql` adds `CurrentBalance` to `banking.Loan`. GET/POST/PUT loans expose it.
- **§11 POST loans:** createLoan uses `OUTPUT INSERTED.LoanId` then fetches the full row; 201 response includes the created loan in `data`.
- **§12 IsLead:** Schema `add_participation_islead.sql` adds `IsLead` to `banking.Participation`. PUT participations accepts `IsLead` as boolean or `"true"`/`"false"` string.
- **§13 Delete loan:** DELETE /api/banking/loans/:id blocks when the loan has personal guarantees or any **manual** covenants (DSCR, Occupancy, Liquidity Requirement, Other). **Auto-created** key-date covenants (I/O Maturity, Loan Maturity, Permanent Loan Maturity, Mini-Perm Maturity, Perm Phase Maturity) are deleted with the loan; participations are always cascade-deleted. Returns 409 with `LOAN_HAS_ASSOCIATIONS` when blocked. **Retroactive cleanup:** (1) Run `schema/cleanup_orphaned_auto_covenants.sql` once to remove auto-created covenants whose loan no longer exists. (2) If you ran `assign_covenants_guarantees_to_first_loan.sql`, run `schema/dedupe_auto_covenants_per_loan.sql` once to keep only one auto-created covenant per (LoanId, CovenantType) and remove duplicates.
- **§14 Covenant reminder:** ReminderDaysBefore/ReminderEmails removed from covenant INSERT/UPDATE so API works without those columns; GET still returns empty arrays when columns are absent.

---

## 9. Show other admins in edit mode (multi-admin awareness)

**Requirement:** Dashboard should show when another admin is logged in and in edit mode, so users are aware of concurrent editing.

**Backend tasks:**
- Add a **presence** or **heartbeat** mechanism: e.g. when an admin enables edit mode, POST to something like `/api/banking/presence/edit-mode` with `{ userId, userName?, timestamp }` and optionally a short TTL.
- Expose **who is in edit mode**: e.g. `GET /api/banking/presence/edit-mode` returns `{ users: [{ userId, userName, lastSeen }] }` (excluding the current user if desired).
- Frontend can poll this endpoint every 30–60s while the current user is in edit mode and call `setOtherAdminsInEditMode(names)` with the list of other users’ display names. When the list is empty, the UI shows “Only you in edit mode.”

**Frontend:** Placeholder is in place: when you’re in edit mode, a small pill shows “Only you in edit mode” until the backend provides a list; then it shows “1 other in edit mode: Jane” or “2 others in edit mode: Jane, John.” The global `window.setOtherAdminsInEditMode(names)` is ready to be called from a poll or push.

---

## 10. Principal paydowns / current balance (not immediate)

**Requirement:** Track principal paydowns without requiring monthly manual updates. Keep **original loan amount** but also know **current balance** (or current outstanding principal).

**Backend tasks:**
- Add a **current balance** (or **outstanding principal**) field to the Loans table if not present, e.g. `CurrentBalance` or `OutstandingPrincipal`.
- Option A: Store only **original amount** and **current balance**; dashboard (or backend) can derive total paydown as original − current.
- Option B: Store **original amount** and a **paydown history** (date, amount) and derive current balance; or store current balance and update it when a paydown is recorded.
- Expose via GET/POST/PUT so the dashboard can display both “Original loan amount” and “Current balance” (and optionally “Total paydown” or history).

**Frontend:** Will show original loan amount and current balance (and optional paydown summary) when the API provides these fields. No frontend change until backend is ready.

---

## 11. POST /api/banking/loans – "Failed to retrieve created loan"

**Observed:** After creating a loan (POST succeeds), the API returns an error "Failed to retrieve created loan", so the client does not receive the created loan in the response.

**Backend tasks:**
- Ensure that after INSERT, the created loan is retrieved (e.g. by `LoanId` from scope/output) and returned in the response body as `{ success: true, data: { LoanId, ProjectId, ... } }`.
- If using SQL Server OUTPUT or similar, ensure the inserted row (or its ID) is available to the same handler so it can run a GET-by-id or return the entity in the same response.

**Frontend:** When this error is returned, the dashboard now treats it as "create likely succeeded": it closes the modal, refreshes the list (`loadAll`), and shows a message asking the user to confirm the new loan appears. A proper 201 response with the created loan in `data` remains the desired behavior.

---

## 12. Participation `IsLead` on PUT (after delete participation)

**Issue:** After deleting a participation, the frontend calls `updateLeadBankForProject`, which may send `PUT /api/banking/participations/:id` with body `{ IsLead: true }` or `{ IsLead: false }` to recalculate which bank is lead. The backend returns: *"Validation failed for parameter 'IsLead'. Invalid string."*

**Backend tasks:**
- For `PUT /api/banking/participations/:id`, ensure the **IsLead** field in the request body is accepted as either:
  - A **boolean** (`true` / `false`), or
  - A **string** (`"true"` / `"false"`).
- If the validator currently rejects the value, adjust validation so that both boolean and the strings `"true"`/`"false"` are valid. Do not require a string and then reject boolean (or vice versa).

**Frontend:** Currently sends `IsLead` as the string `"true"` or `"false"` to avoid the validation error. If the backend is updated to accept JSON boolean, the frontend can be switched back to sending `{ IsLead: true }` / `{ IsLead: false }`.

---

## 13. Delete loan: only block when covenants, personal guarantees, or equity commitments exist

**Issue:** When the user clicks **Delete** on a loan, the API returns *"Cannot delete loan with associated records"* and blocks the delete. The intent is to **only** block when the loan has **loan-specific** detail records that would be orphaned or ambiguous if the loan were removed.

**Business rule:**

- **Do block** delete only when the loan has any of:
  - **Covenants** tied to this `LoanId`
  - **Personal guarantees** tied to this `LoanId`
  - **Equity commitments** tied to this `LoanId`
- **Do not block** delete because of **participations**. When deleting a loan, **cascade-delete** (or remove) all participations for that `LoanId`, then delete the loan. A loan that has only participations and no covenants, personal guarantees, or equity commitments **must** be deletable.

So: if a loan has no covenants, no personal guarantees, and no equity commitments for that `LoanId`, the backend should allow delete and remove any participations for that loan as part of the operation.

**Implementation:**

1. On `DELETE /api/banking/loans/:id`:
   - If the loan has one or more **covenants** with `LoanId` = this loan → return 400 with a clear error (e.g. "Cannot delete loan: it has covenants. Remove or reassign them first.").
   - If the loan has one or more **personal guarantees** for this loan → return 400 (same idea).
   - If the loan has one or more **equity commitments** for this loan → return 400 (same idea).
   - Otherwise: delete (cascade) all **participations** for this `LoanId`, then delete the loan. Return 200.

2. **Defaulting covenants / guarantees / equity to “first active loan”:** For each property, when creating or displaying covenants, personal guarantees, or equity commitments, the app may treat “no loan selected” as the first active loan for that property. Backend does not need to change for that; frontend can default `LoanId` to the first active loan when saving if needed.

**Frontend:** The dashboard shows a user-friendly message when delete is blocked, mentioning covenants, personal guarantees, and equity commitments (not participations). No frontend change needed once the backend only blocks on those three.

---

## 14. Covenant create/update: no ReminderDaysBefore or ReminderEmails

**Issue:** When adding or editing a covenant, the API previously could receive body fields `ReminderDaysBefore` (array of numbers) and `ReminderEmails` (array of strings). The backend returned *"Invalid column name 'ReminderDaysBefore'"* because those columns do not exist on the Covenants table.

**Frontend change:** The covenant create/update payload **no longer includes** `ReminderDaysBefore` or `ReminderEmails`. Reminder configuration is global (Key dates & covenants → Reminder settings), not per-covenant, so the frontend does not send these on create/update.

**Backend:** No action required for normal covenant create/update. If you later add optional columns `ReminderDaysBefore` and/or `ReminderEmails` to the Covenants table (e.g. to support “Remember these emails” in the Send reminder modal), the API can accept them; the frontend is not sending them for now.

---

*Document generated for backend agent; frontend changes are tracked in the dashboard repo.*
