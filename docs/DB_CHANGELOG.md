# Database change log

**Requirement:** Every change to the database (schema, migrations, bulk data, or config) must be recorded here with **who** made the change, **when**, and **what** changed (from → to).

---

## How to log a change

When you run any script or migration that changes the DB, add one entry to the table below (copy the row, fill it in, insert at the top under “Recent changes”).

| When (UTC) | Who | What changed | From → To | Script / How |
|------------|-----|--------------|-----------|--------------|
| 2025-01-XX | | | | |

- **When:** Date (and time if useful) of the change, UTC.
- **Who:** Person making the change (e.g. `arovner`, `mmurray`, or full name).
- **What changed:** Short description of what was changed.
- **From → To:** For schema/data: previous state → new state (e.g. “Added columns …”, “Stage values: X → Y”).
- **Script / How:** Script name (e.g. `schema/add_deal_pipeline_site_tracking_columns.sql`) or “Manual in SSMS”, “API deployment”, etc.

---

## Recent changes

| When (UTC) | Who | What changed | From → To | Script / How |
|------------|-----|--------------|-----------|--------------|
| 2026-02-03 | Backend (guide) | Land Development Contacts | New table pipeline.LandDevelopmentContact (Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays). API: GET/POST/PUT/DELETE /api/land-development/contacts, POST send-reminder (nodemailer; set SMTP_HOST, MAIL_FROM). List returns NextFollowUpDate, UpcomingFollowUp. | schema/add_land_development_contacts.sql, api landDevelopmentController, landDevelopmentRoutes |
| 2026-02-03 | Backend (guide) | Land Development Pipeline: CoordinateSource | pipeline.DealPipeline: added CoordinateSource (NVARCHAR(20) NULL) for KMZ/Manual/Procore. getDealPipelineById now returns PriceRaw, BrokerReferralContactId, Latitude, Longitude, CoordinateSource and BrokerReferralContact join. Create/update accept CoordinateSource. | schema/add_deal_pipeline_coordinate_source.sql, api pipelineController |
| 2026-02-03 | Backend (guide) | I/O to P&I conversion + mini-perm rate fields | banking.Loan: added ConversionDate (DATE), MiniPermFixedOrFloating, MiniPermIndex, MiniPermSpread, MiniPermRateFloor, MiniPermRateCeiling (NVARCHAR). API createLoan/updateLoan support. Optional GET /loans/:id/participation-summary for mismatch flag. | schema/add_loan_io_conversion_and_miniperm_rate.sql, api bankingController |
| 2026-02-03 | Backend (guide) | Loans restructure: IsActive, floor/ceiling, IsPrimary | banking.Loan: added IsActive (BIT, default 1), InterestRateFloor, InterestRateCeiling (NVARCHAR(50)), IsPrimary (BIT). API GET/POST/PUT support; loans by project ordered active first, then BirthOrder, LoanId. | schema/add_loan_restructure_columns.sql, api bankingController |
| 2025-01-XX | (who) | Bank geographic seed | core.Bank City/State/Address NULL → Populated HQ city, state, and address for 50+ banks (researched) | schema/seed_bank_geographic_info.sql |
| *(example)* | *(who)* | Deal pipeline site tracking columns | pipeline.DealPipeline had no County/ZipCode/… → Added County, ZipCode, MFAcreage, Zoning, Zoned, ListingStatus, BrokerReferralSource, RejectedReason | schema/add_deal_pipeline_site_tracking_columns.sql |

*(Insert new rows above this line. Replace the example row with real entries when you run migrations.)*

---

## Row-level “who / when / what” (data changes)

- **Data** changes (INSERT/UPDATE/DELETE) are tracked in **audit tables**:
  - `audit.AuditLog` – column-level: TableName, RecordId, ColumnName, ChangeType, OldValue, NewValue, **ChangedBy**, **ChangedAt**.
  - History tables (e.g. `audit.ProjectHistory`, `audit.LoanHistory`) – full row snapshots and **ChangedBy** / **ValidFrom**.
- Triggers populate **ChangedBy** / **ChangedAt**; today **ChangedBy** is the DB login (e.g. app account). To record the **human user** (e.g. Domo/API user), the API would need to set `SESSION_CONTEXT` or write to audit with `req.user`; see `audit/09_audit_tracking_guide.md` and `audit/12_audit_tracking_guide.md`.

---

## Schema / migration “who / when / what”

- **Schema and one-off migrations** are documented **only in this changelog**.
- Before or right after running any DDL or migration script, add a row above with who, when, what (from → to), and the script name.
