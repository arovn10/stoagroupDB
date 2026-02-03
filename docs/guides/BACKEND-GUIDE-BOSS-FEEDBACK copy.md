# Backend Guide: Boss Feedback (Banking Dashboard)

This document is for the **backend agent** (or backend team). It lists data, API, and integration changes needed to address feedback from the boss using the Banking Dashboard. The frontend will be updated to consume these once implemented.

---

## 1. Bank names: add State identifier

**Request:** "Need to add State identifier on the bank names as some of them are the same."

**Backend work:**
- Ensure the **Banks** entity (or `/api/core/banks` response) includes a **State** (or **BankState**) field so banks can be disambiguated (e.g. "Hancock Whitney (LA)" vs "Hancock Whitney (MS)").
- If the field already exists, ensure it is returned in:
  - `GET /api/core/banks` (list)
  - Any loan/participation responses that include bank info (e.g. `BankName` + `BankState` or equivalent).
- If the field does not exist, add it to the Banks table and API responses.

**Frontend:** Will show bank as `BankName (State)` when State is present (e.g. in Search by Bank table, participations, and anywhere else bank name is displayed).

---

## 2. Two Ryan Nash's as guarantors

**Request:** "There are 2 Ryan Nash's to add as guarantors."

**Backend work:**
- **Persons/Guarantors:** Support multiple people with the same display name (e.g. two "Ryan Nash" records) so both can be added as guarantors.
  - Ensure **Person** (or guarantor) entity is keyed by ID, not name.
  - Add a second "Ryan Nash" person if only one exists (e.g. different `PersonId`), with a way to disambiguate in the UI if needed (e.g. optional **Title**, **Email**, or **Notes** field).
- **Guarantees API:** Continue to accept `PersonId` when adding a guarantee so the correct Ryan Nash is selected by ID.

**Frontend:** Will show both in the "Person" dropdown when adding a guarantee (e.g. "Ryan Nash" and "Ryan Nash (2)" or "Ryan Nash – [email/title]" if backend provides a disambiguator).

---

## 3. How to add a new guarantor (UX – frontend)

**Request:** "How do I add a new guarantor? … not self-explanatory enough."

**Backend work:** None required. Frontend will add short instructions and clearer labels (see frontend TODO).

**Optional:** If "guarantor" is a subset of "persons," document in your API whether new guarantors are added via:
- `POST /api/core/persons` (and then they appear in the guarantee Person dropdown), or
- A dedicated "guarantors" or "add guarantor" endpoint.

If there is a dedicated flow, we can expose it in the UI (e.g. "Add new person/guarantor" link that calls the right API).

---

## 4. Permanent debt and loan extensions/modifications

**Request:** "Need a way to add permanent debt and Loan extensions/modifications (e.g. Redstone Debt Restructure, Settlers Loan modification at mini-perm)."

**Backend work:**
- Define a way to represent **permanent debt** and **loan extensions/modifications** (restructures, modifications).
  - Option A: New entity (e.g. **LoanModification** or **LoanExtension**) with fields such as: ProjectId, LoanId, Type (e.g. "Restructure", "Modification", "Extension"), Description, EffectiveDate, and link to existing loan.
  - Option B: New deal/loan types or statuses that the frontend can filter and display (e.g. "Permanent Debt", "Mini-Perm Modification").
- Expose **CRUD endpoints** (or at least Create + Read) for these records so the dashboard can:
  - List them per property/loan.
  - Add new ones (e.g. "Redstone Debt Restructure", "Settlers Loan modification").
- If these are date-driven or affect key dates (maturities, etc.), ensure they feed into the existing key-dates/covenants or loan summary APIs so the dashboard can show them in the right place.

**Frontend:** Will add UI to list and add permanent debt and loan extensions/modifications once the API and data model are defined.

---

## 5. Construction Completion Date from Procore

**Request:** "Construction Completion Date should be dictated by Procore."

**Backend work:**
- **Integration:** Ensure **Construction Completion Date** (or equivalent) is sourced from **Procore** (e.g. via sync job or API pull from Procore into your DB).
- **API:** Expose this date in the project/loan API (e.g. `ConstructionCompletionDate` or `ProcoreConstructionCompletionDate`) and, if possible, a flag or source field indicating it came from Procore so the UI can show "(from Procore)" or similar.
- If the field is currently manual, document the plan to switch it to Procore-driven and any temporary manual override behavior.

**Frontend:** Will continue to display Construction Completion Date; if backend marks it as Procore-sourced, we can show a small "(from Procore)" label.

---

## 6. Lease-up Completion Date – operations ownership

**Request:** "Lease-up Completion Date I'd like to eventually put in the hands of operations."

**Backend work:**
- No immediate API change required.
- **Future:** When operations will own this field, consider:
  - Permissions/roles so only operations (or specific users) can edit **Lease-up Completion Date**.
  - Or a separate "operations" service/API that writes this field, and the banking dashboard reads it.
- Document the intended ownership and any planned permission or integration changes.

**Frontend:** No code change now; we may later show "(managed by Operations)" or restrict editing by role when backend supports it.

---

## 7. Heights at Waterpointe missing

**Request:** "Heights at Waterpointe is completely missing for some reason."

**Backend work:**
- **Data:** Add **Heights at Waterpointe** as a property/project in the source system (database / master list that feeds `/api/core/projects` or equivalent).
- Ensure it appears in the same API(s) that other properties use (e.g. projects, loans, participations) so the Banking Dashboard can load and display it like any other property.
- If there is a filter (e.g. by status, region, or data source) that might exclude it, adjust so this property is included for the dashboard.

**Frontend:** No change; once the property exists in the API response, it will show up in the dashboard.

---

## 8. The Waters at Crosspointe → The Flats at Crosspointe

**Request:** "The Waters at Crosspointe needs a name change to The Flats at Crosspointe."

**Backend work:**
- **Data:** Update the **project/property name** from "The Waters at Crosspointe" to **"The Flats at Crosspointe"** in the database (or master source that feeds the API).
- Ensure all APIs that return project/property names (e.g. projects, loans, equity commitments, key dates) return the new name so the dashboard shows "The Flats at Crosspointe" everywhere.

**Frontend:** No change; the dashboard displays the name returned by the API.

---

## 9. West Village region: Lafayette → Gulf Coast

**Request:** "West Village Region shows 'Lafayette' when it should be Gulf Coast."

**Backend work:**
- **Data:** For the property that represents **West Village** (or the project named "West Village" / "The Waters at West Village" etc.), set **Region** to **"Gulf Coast"** instead of "Lafayette" in the database (or master source).
- Ensure the **Region** field is returned in project/loan APIs so the dashboard can display it correctly.

**Frontend:** No change; the dashboard displays the region returned by the API.

---

## 10. Banks (Lenders) – fields needed for Deal Pipeline Lenders form

**Request:** The Deal Pipeline has an Add/Edit Lender form and Lenders table. The form and table need these fields to be supported by the API so users can save and see them.

**Backend work:**
- **Banks table / `GET /api/core/banks`:** Return these fields for each bank:
  - **BankId** (existing)
  - **BankName** (existing)
  - **State** or **BankState** (existing per item 1)
  - **Address** (optional) – street, city, ZIP
  - **ContactName** (optional)
  - **ContactEmail** (optional)
  - **ContactPhone** (optional)
- **POST /api/core/banks** and **PUT /api/core/banks/:id:** Accept the same fields in the request body (BankName required; State, Address, ContactName, ContactEmail, ContactPhone optional). Persist them and return them in the response.

**Frontend:** The Deal Pipeline Lenders form already has inputs for Bank Name, State, Address, Contact Name, Contact Email, and Contact Phone. The Lenders table shows Bank, State, Address, and Contact. Once the API accepts and returns these fields, the frontend will send them on create/update and display them in the list (no frontend change required beyond re-enabling the payload).

---

## Summary checklist for backend

| # | Item | Action | Status |
|---|------|--------|--------|
| 1 | Bank State | Add/return State (or BankState) for banks; frontend will show "BankName (State)". | Done: LenderState/BankState in loan/participation APIs; banks include State/HQState. |
| 2 | Two Ryan Nash's | Support multiple persons with same name; add second Ryan Nash if needed; key guarantees by PersonId. | Done: Person has Title/Notes; seed script `db:seed-second-ryan-nash`; guarantees use PersonId. |
| 3 | Add guarantor UX | No backend change; optional: document how new persons/guarantors are created. | Done: see "Adding new guarantors" below. |
| 4 | Permanent debt / extensions | Define model + API for loan modifications/extensions/restructures; CRUD or at least Create + Read. | Done: `banking.LoanModification` + full CRUD; see schema/add_loan_modification.sql and `/api/banking/loan-modifications`. |
| 5 | Construction Completion from Procore | Source Construction Completion Date from Procore; expose in API; optional: mark as Procore-sourced. | Done: `ConstructionCompletionSource` on Loan (e.g. "Procore"/"Manual"); Procore sync TBD (see below). |
| 6 | Lease-up and operations | Document future ownership; plan permissions/integration when operations take over. | Documented below; no API change now. |
| 7 | Heights at Waterpointe | Add property to source system and APIs so it appears in the dashboard. | Done: schema/boss_feedback_data_updates.sql inserts project. |
| 8 | Crosspointe name | Rename "The Waters at Crosspointe" → "The Flats at Crosspointe" in data. | Done: schema/boss_feedback_data_updates.sql. |
| 9 | West Village region | Set West Village property Region to "Gulf Coast" (not "Lafayette"). | Done: schema/boss_feedback_data_updates.sql. |
| 10 | Banks/Lenders form | Add Address, ContactName, ContactEmail, ContactPhone to Banks table and API (GET/POST/PUT) so the Deal Pipeline Lenders form can save and display them. | Done: schema/add_bank_address_contact.sql; createBank/updateBank accept and return these fields. Run migration first. |

After backend implements the above, the frontend can be updated where needed (e.g. bank + state display, guarantor dropdown, permanent debt / modifications UI, and full Lenders form payload once Banks support Address/Contact*).

---

## Implementation notes (backend)

### Adding new guarantors (Item 3)

Guarantors are **persons**. There is no separate "guarantors" table; the banking dashboard uses **Person** for the guarantee dropdown and **Guarantee** links `PersonId` to project/loan.

- **To add a new guarantor:** Create a person via `POST /api/core/persons` with `{ FullName, Email?, Phone?, Title?, Notes? }`. The new person then appears in the Person list and can be selected when adding a guarantee via `POST /api/banking/guarantees` with `PersonId`.
- **Frontend:** An "Add new person/guarantor" flow can call `POST /api/core/persons` and then refresh the Person dropdown used for guarantees.

### Construction Completion Date and Procore (Items 5–6)

- **Current state:** `banking.Loan` has `ConstructionCompletionDate` (text, e.g. "May-23") and optional **`ConstructionCompletionSource`** (e.g. `"Procore"` or `"Manual"`). The API returns both; the UI can show "(from Procore)" when `ConstructionCompletionSource === 'Procore'`.
- **Procore integration (future):** A sync job or API pull from Procore can update `ConstructionCompletionDate` and set `ConstructionCompletionSource = 'Procore'`. Manual overrides can set `ConstructionCompletionSource = 'Manual'`. No Procore sync is implemented yet; this is documented for when the integration is built.
- **Lease-up Completion Date (Item 6):** No API change now. When operations will own this field, consider role-based edit permissions or an operations service that writes `LeaseUpCompletedDate`; the banking dashboard will continue to read it from the project/loan API.

### Banks/Lenders form (Item 10)

- **Done:** `schema/add_bank_address_contact.sql` adds Address, ContactName, ContactEmail, ContactPhone to `core.Bank`. createBank and updateBank accept and return them; GET /api/core/banks returns them. Run the migration first, then the Deal Pipeline Lenders form can save and display these fields.

### Contact book: one entry per individual (synced with investor reps and guarantors)

An individual should appear in the contact book **once**, not once as an individual investor and again as investor rep or guarantor. The DB keeps one `core.Person` per human and syncs individual investors to it.

- **API sync:** When you create or update an **Individual** equity partner without `InvestorRepId`, the API finds or creates a `core.Person` with the same name (case-insensitive) and sets `InvestorRepId` so that person is the single contact (used for contacts, investor reps, and guarantors). No duplicate people.
- **Backfill:** Run `npm run db:sync-individual-investors-to-contacts` (dry-run) or `npm run db:sync-individual-investors-to-contacts -- --apply` from the `api` folder to link existing Individual partners that have no `InvestorRepId` to a matching or new `core.Person`.
- **Use `GET /api/core/contacts`** for the contact book. It returns a unified list: each person once, with `IsInvestorRep` and `IsIndividualInvestor` flags. Individual partners with a linked Person appear only as that Person row.
- **Do not** build the contact book by merging `GET /api/core/persons` and individual investors from `GET /api/core/equity-partners`, or the same person can appear twice (as the Person and as the Individual partner’s “investor rep”).

### Scripts and migrations

- **Individual investors → contacts:** Run `npm run db:sync-individual-investors-to-contacts` (dry-run) or `npm run db:sync-individual-investors-to-contacts -- --apply` from the `api` folder to link Individual equity partners with no `InvestorRepId` to a matching or new `core.Person` (no duplicate people).
- **Second Ryan Nash:** Run `npm run db:seed-second-ryan-nash` from the `api` folder (only inserts if exactly one "Ryan Nash" exists).
- **Data updates (Heights at Waterpointe, Crosspointe rename, West Village region):** Run `schema/boss_feedback_data_updates.sql` against the database.
- **Loan modifications table:** Run `schema/add_loan_modification.sql` before using loan-modification endpoints.
- **Construction completion source:** Run `schema/add_construction_completion_source_to_loan.sql` so the API can persist and return `ConstructionCompletionSource`.
- **Banks/Lenders form (Item 10):** Run `schema/add_bank_address_contact.sql` so the API can persist and return Address, ContactName, ContactEmail, ContactPhone for lenders.
