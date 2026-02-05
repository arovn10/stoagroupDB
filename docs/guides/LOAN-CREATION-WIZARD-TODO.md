# Loan Creation Wizard – Frontend TODO

Use this with the backend and api-client guides. Backend: **BACKEND-GUIDE-LOAN-CREATION-WIZARD.md**. API client: **API-CLIENT-GUIDE-LOAN-CREATION-WIZARD.md**.

---

## Wizard flow

- [ ] **Step 1 – Loan category**  
  Screen: "What loan category is this?"  
  Options: **Refinance**, **Restructure**, **Completely new**.  
  Store in wizard state; send as `LoanCategory` on create if API supports it.

- [ ] **Step 2 – Transfer from existing?**  
  "Do you want to transfer existing attributes from an existing loan on this project?"  
  **Yes** / **No**.  
  If Yes, show dropdown/list of existing loans for this project; user picks source loan.

- [ ] **Step 3 – What to carry over?** (only if Step 2 = Yes)  
  Checkboxes: **Covenants**, **Personal guarantees**, **Equity commitments**.  
  Anything unchecked = blank for the new loan.  
  On save: after creating the new loan, call copy API(s) for selected types (target = new LoanId, source = selected loan).

- [ ] **Step 4 – Loan type**  
  Searchable entry (like contacts): call `getLoanTypes(q)`, show results; option "Add new loan type" → modal with name + notes → `createLoanType`.  
  Store selected `LoanTypeId` for the create payload.

- [ ] **Step 4 (continued) – Lender & loan details**  
  Dynamic form: lender (dropdown), loan amount, fixed/floating, index name, spread, floor, ceiling, dates (closing, maturity, I/O, etc.), and any other existing loan fields.  
  Reuse/adapt existing add-edit loan fields so they’re all available in the wizard.

- [ ] **Save**  
  - Call create loan (POST) with: project, lender, loan type, category, all details, and optionally `IsActive: true`.  
  - If Step 2 was Yes and Step 3 had selections, call copy endpoint(s): covenants, guarantees, equity (per checkboxes).  
  - Close wizard, refresh loans for the project, re-render (e.g. expand property and show new loan in tabs).

- [ ] **Set as active**  
  In loan detail (or list), add control "Set as active".  
  On click: call `setLoanActive(loanId)`; then refetch loans for the project and re-render so the active loan is first in the tabs and marked Active.

---

## UI/UX

- [ ] Replace or supplement current "Add Loan" entry point with "Create loan (step-by-step)" that opens the wizard.
- [ ] Wizard: multi-step modal or full-screen flow with Back/Next and progress (Step 1 of 4, etc.).
- [ ] Loan type: search input + results list + "Add new loan type" that opens a small form (name + notes).
- [ ] Tabs: when a loan is set active, ensure the active loan appears first and is visually indicated (e.g. "Active" badge); inactive/paid off loans still visible in tabs.

---

## Dependencies

- Backend: loan types table + CRUD, copy-from-loan endpoint(s), IsActive behavior (see backend guide).
- API client: getLoanTypes, createLoanType, copyCovenantsToLoan (or copyLoanAttributes), setLoanActive (see api-client guide).
