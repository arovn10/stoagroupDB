# Backend Guide: Deals LTC, Column Data, Lead/Participant, and Misc Loans

This document is for the **backend agent** (or backend team). The Banking Dashboard is being updated with the following. The frontend will be implemented in parallel; these backend changes (and API contract) are needed for full functionality.

---

## 1. LTC (Original) – deal-wide, project-level

**Requirement:** One “LTC (Original)” value per **deal** (property/project). It represents the original LTC on the first loan at closing. Users need to **add/edit** this value and see it in the By Property table column “LTC (Original)”.

**Backend tasks:**
- Add a **project-level** field for original LTC, e.g. **`LTCOriginal`** (decimal, e.g. `0.65` for 65%). Store as decimal in DB and API.
- **GET** project (or banking/projects payload): include **`LTCOriginal`** (number or null) so the frontend can display it as a percentage and show it in the table.
- **PATCH/PUT** project: accept **`LTCOriginal`** (optional decimal or null) so the frontend can save it when the user adds or edits LTC.

**API contract:**
- Response: `LTCOriginal: number | null` (e.g. `0.65`).
- Request (update project): body may include `LTCOriginal: number | null`.
- Frontend will display the value as a percentage (e.g. 65%).

---

## 2. By Property table – maturity and index (no API change if data exists)

**Maturity:** The table column is now **“Maturity”** (not “I/O Maturity”). It should show the **active loan’s** primary maturity date (e.g. `IOMaturityDate`, or `MaturityDate`, or `PermPhaseMaturity` depending on loan type). The frontend will use whichever date the backend already returns for the active loan; no new fields required if loans already expose these dates.

**Index (fixed rate):** When the active loan is fixed rate, the frontend will show **“Fixed (IndexName) X.XX%”** (e.g. “Fixed (SOFR) 5.25%”) using:
- `FixedOrFloating` (to detect Fixed)
- `IndexName` (e.g. SOFR)
- `InterestRate` (or equivalent) for the total rate

Ensure **GET** loan(s) include **`FixedOrFloating`**, **`IndexName`**, and **`InterestRate`** (or the rate field you use) so the frontend can build this string.

---

## 3. Lead vs Participant – mutually exclusive per deal

**Requirement:** For each deal, there is **one lead bank** (flagged) and the rest are **participants**. A bank should never be shown as both “Lead” and “Participant” for the same deal (e.g. no “Lead, Participant” label).

**Backend tasks:**
- Ensure the data model enforces **one lead per deal** (e.g. one participation with `IsLead = true` per project, or a dedicated lead bank on the loan).
- **GET** participations (or bank/deal payload): for each deal, return a clear **lead** indicator (e.g. `IsLead: true` on exactly one participation per project). The frontend will display **“Lead”** when `IsLead === true` and **“Participant”** otherwise—never “Lead, Participant”.
- If the API currently returns both a “lender” and participations and the same bank can appear as both, document how the frontend should derive “Lead” vs “Participant” (e.g. “treat as Lead if bank is the loan’s lender; otherwise Participant”). The frontend will then show a single role per bank per deal.

---

## 4. Misc Loans – debt not tied to a deal (entities)

**Requirement:** Users need to track **debt that is not tied to a deal/project** but is tied to an **entity**. The dashboard will have a **“Misc Loans”** tab where:
- **Entities** are listed (these are not shown on the By Property tab).
- Each entity can have **loans** (same loan concept as deal loans, but linked to the entity instead of a project).

**Assumption (clarify if wrong):** Entities already exist in your system and may already have project IDs or a similar identifier. If so, loans can be linked to an entity via that ID (e.g. `ProjectId` pointing to an “entity” record, or an **`EntityId`** on the loan).

**Backend tasks:**
- **Option A – Same Loan table, optional project:**  
  - Allow **loans** with **no deal** (e.g. **`ProjectId`** null or optional).  
  - Add **`EntityId`** (or equivalent) to the Loan table so a loan can be tied to an **entity** instead of a project.  
  - **GET** list of **entities** (e.g. `GET /api/banking/entities` or similar) so the frontend can list them in the Misc Loans tab.  
  - **GET** loans for an entity (e.g. `GET /api/banking/loans/entity/:entityId` or `GET /api/banking/entities/:entityId/loans`).  
  - **POST** loan: allow creating a loan with **`EntityId`** and no **`ProjectId`** (or with `ProjectId` pointing to the entity’s project if you use one project per entity).

- **Option B – Entities as projects:**  
  - If “entities” are stored as projects (e.g. with a type/category like “Entity”), then:  
  - **GET** list of entity-projects (e.g. filter projects by type = Entity).  
  - **GET** loans for a project already supports `GET /api/banking/loans/project/:projectId`; use the same for entity-projects.  
  - **POST** loan: allow **`ProjectId`** to be an entity’s project ID so the loan is “standalone” relative to deal properties.

**API contract (to be finalized with your schema):**
- A way to **list entities** (or entity-projects) for the Misc Loans tab.
- A way to **list loans** for a given entity (or entity-project).
- **Create/update loan** with a link to an entity (via `EntityId` or entity’s `ProjectId`) instead of a deal project.

The frontend will add a **Misc Loans** main tab that lists entities and their loans once these endpoints (and payloads) are available. Until then, the tab may show a placeholder or “Coming soon” message.

---

## 5. Loan creation – maturity type and labels

**Requirement:** When **creating** a loan (step-by-step flow), the user should be asked for **maturity details** and to **select the type** of maturity (e.g. I/O Maturity, Loan Maturity, Mini-Perm Maturity, Perm Phase Maturity). The form then shows the appropriate fields and labels for that type.

**Backend tasks:**
- No new fields required if loans already have: **`IOMaturityDate`**, **`MaturityDate`**, **`MiniPermMaturity`**, **`PermPhaseMaturity`** (or equivalents).
- **GET/POST/PUT** loan: continue to accept and return these date fields so the frontend can:
  - Let the user pick a maturity type.
  - Show the correct label (e.g. “I/O Maturity Date”, “Loan Maturity Date”) and persist the corresponding date field.

If maturity type is stored (e.g. “IOMaturity” vs “LoanMaturity”), expose it so the frontend can pre-fill the right label; otherwise the frontend can infer from which date field is populated.

---

## 6. Create loan (POST) – SQL Server OUTPUT and triggers

**Error:** `The target table 'banking.Loan' of the DML statement cannot have any enabled triggers if the statement contains an OUTPUT clause without INTO clause.`

**Cause:** SQL Server does not allow `OUTPUT INSERTED.*` (or `OUTPUT INSERTED.LoanId`) on a table that has enabled triggers, unless the output is into a table variable (e.g. `OUTPUT INSERTED.LoanId INTO @Output(LoanId)`).

**Fix applied (Option B):** Remove the `OUTPUT` clause from the Loan INSERT and use `SCOPE_IDENTITY()` in the same batch to get the new `LoanId`:

- `INSERT INTO banking.Loan (...) VALUES (...);`
- `SELECT CAST(SCOPE_IDENTITY() AS INT) AS LoanId;`

The API then uses that `LoanId` to fetch the full row and return it. No trigger changes required.

**Alternative (Option A):** Use a table variable: `DECLARE @Output TABLE (LoanId INT); INSERT INTO banking.Loan (...) OUTPUT INSERTED.LoanId INTO @Output(LoanId) VALUES (...); SELECT LoanId FROM @Output;`

---

## 7. Summary for API client (when you implement)

After implementation, the **api-client** (or API contract) should support:

- **Project:** `LTCOriginal` (decimal, optional) in GET and PATCH/PUT.
- **Loan:** `FixedOrFloating`, `IndexName`, `InterestRate` (or rate field) in GET; maturity date fields as already defined.
- **Participations / bank-deal payload:** One clear “lead” per deal (e.g. `IsLead`), so the UI can show “Lead” or “Participant” only.
- **Entities:** Endpoint(s) to list entities and to list (and create/update) loans per entity, as in section 4.

The frontend will **not** change the api-client; it will consume the above once the backend (and updated api-client) are provided.
