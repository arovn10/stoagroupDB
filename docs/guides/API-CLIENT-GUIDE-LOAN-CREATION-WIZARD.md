# API Client Guide: Loan Creation Wizard & Loan Types

The dashboard uses a **step-by-step loan creation wizard** and **loan types** (searchable/addable). This guide lists the API client functions and endpoints the frontend expects. **Implement these in api-client.js** (or your API layer) so the dashboard can call them. Do not change the dashboard’s api-client.js yourself; this doc is for the team that maintains the API client.

---

## 1. Loan types (new)

The backend exposes a **LoanType** table and CRUD. The api-client should expose:

| Function | Method / Endpoint | Purpose |
|----------|-------------------|---------|
| **getLoanTypes**(query?) | GET `/api/banking/loan-types` or `?q=...` | List (and optional search) loan types for the wizard dropdown. |
| **getLoanType**(id) | GET `/api/banking/loan-types/:id` | Get one loan type (if needed). |
| **createLoanType**(payload) | POST `/api/banking/loan-types` | Add new type. Payload: `{ LoanTypeName, Notes?, DisplayOrder? }`. |
| **updateLoanType**(id, payload) | PUT `/api/banking/loan-types/:id` | Update name, notes, order. |
| **deleteLoanType**(id) | DELETE `/api/banking/loan-types/:id` | Soft or hard delete (per backend). |

**Response shape (loan type):** `{ LoanTypeId, LoanTypeName, Notes, DisplayOrder }` (or as backend returns).

Attach to `window.API` (e.g. `API.getLoanTypes`, `API.createLoanType`) so the dashboard can use them.

---

## 2. Copy from existing loan (after creating new loan)

After the frontend creates the new loan, it may copy covenants, guarantees, and/or equity commitments from an existing loan. Either:

**Option A – Separate copy endpoints (if backend implements them):**

| Function | Method / Endpoint | Purpose |
|----------|-------------------|---------|
| **copyCovenantsToLoan**(targetLoanId, sourceLoanId) | POST `/api/banking/loans/:targetLoanId/copy-covenants-from/:sourceLoanId` | Copy all covenants from source loan to target (new) loan. |
| **copyGuaranteesToLoan**(targetLoanId, sourceLoanId) | POST `/api/banking/loans/:targetLoanId/copy-guarantees-from/:sourceLoanId` | Copy personal guarantees. |
| **copyEquityCommitmentsToLoan**(targetLoanId, sourceLoanId) | POST `/api/banking/loans/:targetLoanId/copy-equity-commitments-from/:sourceLoanId` | Copy equity commitments. |

**Option B – Single copy endpoint (if backend implements it):**

| Function | Method / Endpoint | Purpose |
|----------|-------------------|---------|
| **copyLoanAttributes**(targetLoanId, sourceLoanId, options) | POST `/api/banking/loans/:targetLoanId/copy-from/:sourceLoanId` with body `{ copyCovenants, copyGuarantees, copyEquityCommitments }` | Copy selected attribute types in one call. |

Implement the set that matches the backend (see BACKEND-GUIDE-LOAN-CREATION-WIZARD.md).

---

## 3. Create loan (existing + new fields)

The existing **createLoan** (or create-by-project) should send the full loan payload. The backend will accept (in addition to current fields):

- **LoanTypeId** (optional) – from loan types API.
- **LoanCategory** (optional) – e.g. `"Refinance"`, `"Restructure"`, `"Completely New"` (if backend supports it).
- **IsActive** (optional) – boolean; when true, backend sets this loan active and others on the project inactive.

No signature change required if the backend simply accepts extra fields on the existing POST body; ensure the api-client does not strip unknown fields when building the request.

---

## 4. Set loan as active

The dashboard needs to set a loan as “active”, which tells the backend to set that loan’s IsActive = true and other loans on the same project to inactive.

| Function | Method / Endpoint | Purpose |
|----------|-------------------|---------|
| **setLoanActive**(loanId) | PATCH `/api/banking/loans/:id` with body `{ "IsActive": true }` (or PUT) | Set this loan active and others on project inactive. |

If the backend adds **POST /api/banking/loans/:id/set-active** with no body, then:

| Function | Method / Endpoint |
|----------|-------------------|
| **setLoanActive**(loanId) | POST `/api/banking/loans/:id/set-active` |

Use whichever the backend implements. The frontend will call this and then refetch loans for the project to refresh the tabs.

---

## 5. Get loans by project (existing)

The dashboard already uses **getLoansByProject(projectId)**. Ensure the response includes:

- **IsActive** (or equivalent) so the dashboard can show Active vs Paid off and order tabs (active first).
- **LoanTypeId** and, if the backend returns it, **LoanTypeName** for display.
- **LoanCategory** if the backend stores it.

No new function is required if the existing GET project loans response is extended with these fields.

---

## 6. Summary – attach to window.API

- `getLoanTypes(query?)`
- `createLoanType(payload)`
- `updateLoanType(id, payload)` (optional for wizard)
- `deleteLoanType(id)` (optional for wizard)
- `copyCovenantsToLoan(targetLoanId, sourceLoanId)` **or** `copyLoanAttributes(targetLoanId, sourceLoanId, options)` (match backend)
- `copyGuaranteesToLoan(targetLoanId, sourceLoanId)` (if Option A)
- `copyEquityCommitmentsToLoan(targetLoanId, sourceLoanId)` (if Option A)
- `setLoanActive(loanId)`
- Existing `createLoan` / create-by-project and `getLoansByProject` unchanged except backend may accept/return new fields.

Reference: **BACKEND-GUIDE-LOAN-CREATION-WIZARD.md** for backend API and schema details.
