# Backend Guide: Loan Creation Wizard & Loan Types

This guide describes API and schema changes needed to support the new **step-by-step loan creation** flow and **loan types** (e.g. HUD) with a searchable/addable list. The frontend will implement a wizard; the backend must support loan types, optional copy-from-existing, and setting the active loan.

---

## Overview of the wizard (frontend)

1. **Step 1 – Loan category:** Refinance, Restructure, or Completely new (frontend-only or stored on loan).
2. **Step 2 – Transfer from existing loan?** Yes/No. If Yes, user picks which existing loan on the project.
3. **Step 3 – What to carry over?** Covenants, Personal guarantees, Equity commitments (checkboxes). Anything not selected is blank for the new loan; selected items are copied and reassigned to the new LoanId.
4. **Step 4 – Loan type:** Searchable list (like contacts). Option to add a new loan type with name + notes. Then lender and all other loan details (fixed/floating, index, amount, etc.) – dynamic form. Save creates the loan and optionally runs the copy operations.

**Additional:** User can **set a loan as active**, which makes the current active loan inactive and updates tab order (active first).

---

## 1. Loan category (Refinance / Restructure / Completely new)

**Frontend:** Step 1 asks "What loan category is this?" with options: Refinance, Restructure, Completely new.

**Backend (optional):**

- If you want to persist this for reporting/filtering, add a column to the Loans table, e.g.:
  - **LoanCategory** – `NVARCHAR(50)` or similar, values: `'Refinance'`, `'Restructure'`, `'Completely New'` (or codes).
- Expose in GET/POST/PUT for loans so the dashboard can send it when creating a loan.
- If you prefer not to add a column, the frontend can still ask the question and use it only to drive the "transfer from existing?" step (e.g. pre-fill Yes for Refinance/Restructure, No for Completely new). No backend change required in that case.

---

## 2. Copy attributes from an existing loan to the new loan

When the user selects "Yes" and chooses which attributes to carry over (covenants, personal guarantees, equity commitments), the frontend will **create the new loan first**, then call one or more endpoints to **copy** the selected record types from the source LoanId to the new LoanId (reassigning `LoanId` and optionally `ProjectId` where applicable).

**Backend options:**

### Option A – Copy endpoints (recommended)

Expose endpoints that duplicate records from one loan to another and reassign `LoanId`:

- **POST /api/banking/loans/:targetLoanId/copy-covenants-from/:sourceLoanId**  
  Copy all covenants where `LoanId = sourceLoanId` to the new loan: insert new rows with the same data but `LoanId = targetLoanId` (and same `ProjectId`). Do not delete the originals (or do, depending on business rule; document it).

- **POST /api/banking/loans/:targetLoanId/copy-guarantees-from/:sourceLoanId**  
  Same for personal guarantees: copy rows with `LoanId = sourceLoanId` to `LoanId = targetLoanId`.

- **POST /api/banking/loans/:targetLoanId/copy-equity-commitments-from/:sourceLoanId**  
  Same for equity commitments: copy rows tied to `sourceLoanId` to `targetLoanId`.

**Request body:** Optional. If you need to limit which rows are copied (e.g. by ID list), accept a body like `{ "CovenantIds": [...] }`; otherwise copy all for that loan.

**Response:** 200 with count or list of created IDs; or 201 with created resources.

### Option B – Single "copy attributes" endpoint

- **POST /api/banking/loans/:targetLoanId/copy-from/:sourceLoanId**  
  Body: `{ "copyCovenants": true, "copyGuarantees": true, "copyEquityCommitments": false }`.  
  Backend copies the selected types in one transaction. Returns 200 with summary.

Use whichever fits your API style. The frontend will call after creating the new loan.

---

## 3. Loan types table and API

**Requirement:** A new reference table for **loan types** (e.g. HUD, Conventional, etc.) so the user can search/select or add a new type with notes.

### 3.1 Schema (suggested)

Create a table, e.g. **banking.LoanType** (or **dbo.LoanType**):

| Column        | Type           | Description                    |
|---------------|----------------|--------------------------------|
| LoanTypeId    | INT, PK        | Identity.                      |
| LoanTypeName  | NVARCHAR(200)  | Display name (e.g. "HUD").     |
| Notes         | NVARCHAR(MAX)  | Optional notes for this type.  |
| DisplayOrder  | INT, nullable  | Optional sort order.           |
| IsActive      | BIT            | Default 1 (soft delete).       |

Unique constraint on `LoanTypeName` (or allow duplicates and distinguish by ID).

### 3.2 API contract

- **GET /api/banking/loan-types**  
  Returns all active loan types: `[{ LoanTypeId, LoanTypeName, Notes, DisplayOrder }, ...]`.  
  Optional query: `?q=HUD` to filter by name (search).

- **GET /api/banking/loan-types/:id**  
  Returns one loan type by ID.

- **POST /api/banking/loan-types**  
  Body: `{ "LoanTypeName": "HUD", "Notes": "HUD 223(f) etc.", "DisplayOrder": null }`.  
  Creates a new loan type; returns created resource with `LoanTypeId`.

- **PUT /api/banking/loan-types/:id**  
  Update name, notes, display order, or IsActive.

- **DELETE /api/banking/loan-types/:id**  
  Soft delete (set IsActive = 0) or hard delete; document which.

### 3.3 Loans table – link to loan type

- Add **LoanTypeId** (INT, nullable, FK to banking.LoanType) to the Loans table if you want to store the selected type. Alternatively store **LoanTypeName** as a string; the guide assumes LoanTypeId for referential integrity.
- Expose **LoanTypeId** (and optionally **LoanTypeName** in responses) in GET/POST/PUT for loans so the dashboard can set the loan type when creating/editing.

---

## 4. Create loan payload (existing + new fields)

The existing **POST /api/banking/loans** (or create-by-project) should accept at least:

- All current loan fields (ProjectId, LenderId, LoanPhase, LoanAmount, dates, fixed/floating, index, spread, floor, ceiling, etc.).
- **LoanTypeId** (optional) – from the new loan types table.
- **LoanCategory** (optional) – if you add it: Refinance, Restructure, Completely New.
- **IsActive** (optional) – boolean; if true, backend should set this loan as active and set other loans on the same project to inactive (so only one active per project, or per your business rule).

Ensure the response returns the created loan with **LoanId** so the frontend can call the copy endpoints with `targetLoanId`.

---

## 5. Set loan as active

**Requirement:** User can mark a loan as "active", which should make the current active loan on that project inactive and update ordering so the active loan is first (or clearly indicated).

**Backend options:**

- **PATCH /api/banking/loans/:id** or **PUT /api/banking/loans/:id** with body `{ "IsActive": true }`.  
  When setting a loan to active, the backend should:
  1. Set `IsActive = true` for this loan.
  2. Set `IsActive = false` for all other loans on the same project (same ProjectId).
  3. Optionally maintain a "display order" or "BirthOrder" so the active loan appears first; if so, update that when activating.

- Or expose **POST /api/banking/loans/:id/set-active** that does the above in one call.  
  Response: 200; the frontend will refetch loans for the project and re-render tabs so the active loan is first.

**Loans table:** Ensure there is an **IsActive** (or equivalent) column and that GET loan/list responses include it so the dashboard can show "Active" vs "Paid off" and order tabs correctly.

---

## 6. Summary checklist (backend)

| # | Item | Action |
|---|------|--------|
| 1 | Loan category | Optional: add LoanCategory to Loans; expose in GET/POST/PUT. |
| 2 | Copy covenants/guarantees/equity to new loan | Add copy endpoints (Option A or B in §2). |
| 3 | Loan types table | Add banking.LoanType (or equivalent); CRUD + search (GET with ?q=). |
| 4 | Loans.LoanTypeId | Add FK to LoanType; expose in loan GET/POST/PUT. |
| 5 | Create loan | Accept LoanTypeId, LoanCategory (if added), IsActive in POST. |
| 6 | Set loan active | When IsActive=true, set others on project inactive; support PATCH/PUT or set-active endpoint. |

**Implementation status:** Schema `add_loan_type_table_and_columns.sql` creates banking.LoanType and adds LoanTypeId, LoanCategory to banking.Loan. API implements: loan types CRUD + GET ?q=; POST /api/banking/loans/:targetLoanId/copy-from/:sourceLoanId (body: copyCovenants, copyGuarantees, copyEquityCommitments); create/update loan accept LoanTypeId, LoanCategory; when IsActive=true, other loans on project set inactive; GET loans return LoanTypeName (join). Run the schema script before deploying the API.

---

## 7. Frontend flow (for reference)

- Step 1: Category → store in wizard state; optionally send as LoanCategory.
- Step 2: Transfer? Yes/No (+ select source loan if Yes).
- Step 3: If Yes, checkboxes for Covenants, Personal guarantees, Equity commitments.
- Step 4: Loan type search (GET /api/banking/loan-types?q=...) or add new (POST /api/banking/loan-types). Then dynamic form: lender, loan amount, fixed/floating, index, spread, dates, etc. All existing loan fields.
- Save: POST create loan (with LoanTypeId, IsActive if "set as active"). Then if copy selected: POST copy-covenants-from, copy-guarantees-from, copy-equity-commitments-from (or single copy-from) with new LoanId and source LoanId.
- Set as active: PATCH loan with IsActive: true; refetch loans and re-render so active tab is first.

No backend change is required for "dynamic form" – the frontend will collect all existing loan fields and send them in the create payload.
