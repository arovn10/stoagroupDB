# Backend Guide: Contacts and Equity Partners (One Person = One Record)

**Rule:** Equity partners (individuals) and contacts are the same people. They live in **core.Person**. There should **never be duplicate people** — one person = one `core.Person` record and at most one Individual **core.EquityPartner** per person.

## Model

- **core.Person** – All people: contacts, guarantors, investor reps, and the “contact” side of individual investors. This is the single source of truth for a human.
- **core.EquityPartner** – Investors (entities or individuals).
  - **Entity** (e.g. Stoa Holdings, LLC): no “one per person” limit; `InvestorRepId` can point to a contact.
  - **Individual**: represents one person as an investor. Must link to **core.Person** via `InvestorRepId`. **At most one** EquityPartner row per Person when `PartnerType = 'Individual'`.

So: contacts and individual investors are in the same table (Person). An individual investor is an EquityPartner row with `PartnerType = 'Individual'` and `InvestorRepId` pointing to that one Person. No duplicate people — no second Person for the same human, and no second Individual EquityPartner for the same Person.

## Enforcement

1. **Schema** – Filtered unique index on **core.EquityPartner**: `(InvestorRepId)` where `PartnerType = 'Individual' AND InvestorRepId IS NOT NULL`. So one Individual per Person at the DB level. See `schema/add_one_individual_per_person_constraint.sql`.
2. **API**
   - **Create Individual equity partner**: If a partner already exists for that Person (`InvestorRepId`), returns **409** with message and `existingEquityPartnerId`.
   - **Update equity partner**: Setting `InvestorRepId` to a Person already used by another Individual returns **409**.
3. **Sync** – `npm run db:sync-individual-investors-to-contacts -- --apply` links Individual partners with no `InvestorRepId` to a Person by name (find or create), so they appear once in the contact book.
4. **Merging duplicates**
   - Duplicate **Person** rows (e.g. two “Ryan Nash”): `npm run db:fix-duplicate-ryan-nash -- --apply` (or a general merge-by-name script).
   - Duplicate **Individual EquityPartner** rows for the same person: run `schema/add_one_individual_per_person_constraint.sql` (merges then adds the unique index), or `npm run db:merge-duplicate-ryan-nash-equity -- --apply` to merge by name pattern.

## Contact book

**GET /api/core/contact-book** returns one list: all Persons (with flags IsInvestorRep, IsIndividualInvestor) plus any Individual equity partners that still have no `InvestorRepId` (so they still appear once). After sync, every individual investor is linked to a Person and appears only via that Person row — no duplicate people.
