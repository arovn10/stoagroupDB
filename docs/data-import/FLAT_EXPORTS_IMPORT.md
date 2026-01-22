# Flat Exports Import Guide

This document describes how to seed the database using the normalized flat export CSV files.

## Overview

The `import-flat-exports.ts` script imports data from the normalized flat export CSV files in `stoa_flat_exports_csv/`. This is the recommended way to seed the database as it uses clean, normalized data structures.

## Import Order

The script imports data in the following order:

1. **Projects** (`projects.csv`) → `core.Project`
2. **Loans** (`loans.csv`) → `banking.Loan`
3. **DSCR Tests** (`dscr_tests.csv`) → `banking.DSCRTest`
4. **Liquidity Requirements** (`liquidity_requirements.csv`) → `banking.LiquidityRequirement`
5. **Occupancy Covenants** (`occupancy_covenants.csv`) → `banking.Covenant`
6. **Participations** (`raw_Banking_Dashboard_xlsx_Participants.csv`) → `banking.Participation`
7. **Guarantees** (`raw_Banking_Dashboard_xlsx_Contingent_Liabilities.csv`) → `banking.Guarantee`

## Usage

```bash
cd api
npm run db:import-flat-exports
```

## Data Mapping

### Projects (`projects.csv`)

- `ProjectName` → `ProjectName` (required, unique)
- `Location` → `Location`
- `City` → `City`
- `State` → `State`
- `Units` → `Units`
- `StageBucket` → `Stage` (mapped: "Liquidated" → "Liquidated", "Active Multifamily" → "Started", etc.)
- `Section` → Used to determine `Stage` if `StageBucket` is missing
- `Region` → Auto-determined from `State`/`Location` (Carolinas or Gulf Coast)
- `ProductType` → Auto-determined from project name (Heights, Prototype, Flats, Land, Other)

**Note:** Projects like "Pre-Construction", "Liquidated", "Plane Loan", "Tredge", and "Stoa Construction, LLC" are skipped as they are section headers, not actual projects.

### Loans (`loans.csv`)

- `ProjectName` → Links to `core.Project`
- `LoanType` → `LoanType`
- `ConstructionLender` → Creates/links to `core.Bank`, sets `LenderId`
- `ConstructionLoanAmount` → `LoanAmount`
- `ConstructionLoanClosingDate` → `LoanClosingDate`
- `ConstructionCompletionDate` → `ConstructionCompletionDate`
- `LeaseUpCompletedDate` → `LeaseUpCompletedDate`
- `ConstructionIOMaturity` → `IOMaturityDate`
- `FixedOrFloating` → `FixedOrFloating`
- `IndexName` → `IndexName`
- `Spread` → `Spread`
- `MiniPermMaturity` → `MiniPermMaturity`
- `MiniPermInterestRate` → `MiniPermInterestRate`
- `ConstructionPermPhaseMaturity` → `PermPhaseMaturity`
- `ConstructionPermPhaseInterestRate` → `PermPhaseInterestRate`
- `PermanentFinancingCloseDate` → `PermanentCloseDate`
- `PermanentFinancingLender` → Creates/links to `core.Bank` (for permanent loans)
- `PermanentFinancingLoanAmount` → `PermanentLoanAmount`
- `LoanPhase` → Auto-determined from `LoanType` (Land, Construction, Permanent)

**Note:** Loans are only imported if they have at least a `LoanAmount`, `LoanClosingDate`, or `LenderId`. Existing loan data will be completely replaced with CSV values.

### DSCR Tests (`dscr_tests.csv`)

- `ProjectName` → Links to `core.Project`
- `TestNumber` → `TestNumber` (1, 2, or 3)
- `TestDate` → `TestDate` (required)
- `ProjectedInterestRate` → `ProjectedInterestRate`
- `Requirement` → `Requirement`
- `ProjectedValue` → `ProjectedValue`

**Note:** Tests are only imported if they have a `TestDate`.

### Liquidity Requirements (`liquidity_requirements.csv`)

- `ProjectName` → Links to `core.Project`
- `LiquidityTotal` → `TotalAmount`
- `LiquidityLendingBank` → `LendingBankAmount`

**Note:** Requirements are only imported if they have at least `TotalAmount` or `LendingBankAmount`.

### Occupancy Covenants (`occupancy_covenants.csv`)

- `ProjectName` → Links to `core.Project`
- `OccupancyCovenantDate` → `CovenantDate`
- `OccupancyRequirement` → `Requirement`
- `ProjectedOccupancyPct` → `ProjectedValue`
- `CovenantType` → Always set to "Occupancy"

**Note:** Covenants are only imported if they have at least a `CovenantDate` or `Requirement`.

### Participations (`raw_Banking_Dashboard_xlsx_Participants.csv`)

This uses the raw CSV file structure:
- Parses project names from column 0 or 2
- Parses bank names, percentages, and exposure amounts
- Creates/links banks as needed
- Links to projects and loans

**Note:** The script handles the multi-column structure of the Participants CSV, where projects can appear in different columns.

### Guarantees (`raw_Banking_Dashboard_xlsx_Contingent_Liabilities.csv`)

This uses the raw CSV file structure:
- Parses project names from column 1 or 2
- Maps guarantee percentages and amounts for:
  - Stoa Holdings, LLC (columns 6-7)
  - Toby Easterly (columns 8-9)
  - Ryan Nash (columns 10-11)
  - Saun Sullivan (columns 12-13)
- Also imports covenant notes from the last column

**Note:** Guarantee percentages are converted from whole numbers (e.g., 1 = 100%) to decimals (1.0) for storage.

## Data Updates

The script uses `MERGE` statements (for participations and guarantees) and direct `UPDATE` statements (for other tables) to:
- Create new records if they don't exist
- **Override existing data** with CSV values (existing data is replaced, not merged)
- Avoid duplicate entries

**Important:** If a project already exists in the database, all its data will be overwritten with the values from the flat export CSV files. This ensures the database matches the source data exactly.

## Error Handling

- Projects that don't exist are skipped with a warning
- Banks are automatically created if they don't exist
- Invalid dates, amounts, or percentages are skipped
- Section headers and empty rows are automatically skipped

## Best Practices

1. **Run imports in order:** The script handles dependencies (projects → loans → other banking data), but ensure projects are imported first.

2. **Check for missing projects:** If you see warnings about missing projects, add them first using `npm run db:add-missing-projects` or manually.

3. **Validate after import:** Run `npm run db:validate-csv` to check for any discrepancies.

4. **Backup before bulk imports:** Always backup your database before running bulk import operations.

## Troubleshooting

### "Project not found" warnings
- Add missing projects using `npm run db:add-missing-projects`
- Check project name spelling/spacing in CSV vs database

### "Invalid column name" errors
- Run `npm run db:fix-schema` to ensure schema is up to date
- Check that all required columns exist in the database

### Duplicate key errors
- The script should handle duplicates, but if you see these, check for data inconsistencies
- Ensure project names are unique in the CSV

### Date parsing issues
- Dates should be in ISO format (YYYY-MM-DD) or standard formats (MM/DD/YYYY)
- Invalid dates are skipped with a warning
