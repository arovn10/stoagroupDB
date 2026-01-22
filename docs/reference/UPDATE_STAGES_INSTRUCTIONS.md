# Update Project Stages and Financing Stages

## Overview
This document explains how to update project stages and financing stages based on the provided property lists.

## Changes Made

### 1. Schema Updates
- ✅ `FinancingStage` column added to `banking.Loan` table (via `schema/03_add_financing_stage.sql`)
- ✅ `Stage` field in `core.Project` updated to new values:
  - Old: `Started`, `Closed`
  - New: `Under Construction`, `Lease-Up`, `Liquidated`

### 2. Project Stage Mappings

#### Under Construction (7 properties):
- The Flats at Ransley
- The Flats at Crosspointe
- The Heights at Waterpointe
- The Heights at Materra
- The Heights at Inverness
- The Waters at Conway
- The Waters at Covington

#### Stabilized (6 properties):
- The Waters at Hammond
- The Waters at Millerville
- The Waters at Redstone
- The Waters at Settlers Trace
- The Waters at West Village
- The Waters at Blue Bonnet

#### Lease-Up (5 properties):
- The Waters at Crestview
- The Waters at MCgowin
- The Heights at Picardy
- The Waters at Freeport
- The Waters at Promenade

#### Liquidated/Sold (9 properties):
- Silver Oaks
- The Heights
- Sweetwater
- The Waters at Southpark
- Dawson Park
- The Waters at Manhattan
- The Waters at Ransley
- The Waters at Heritage
- The Flats at East Bay

### 3. Financing Stage Mappings

- **Permanent Loan**: Only "The Waters at Hammond"
- **Construction Loan**: All other non-liquidated properties
- **Liquidated**: All sold properties

## Steps to Update

### Step 1: Apply Schema Migration (if not already done)

Run the migration to add the `FinancingStage` column:

```bash
# Connect to your database and run:
sqlcmd -S <server> -d <database> -U <user> -P <password> -i schema/03_add_financing_stage.sql
```

Or use Azure Data Studio / SSMS to run the SQL file.

### Step 2: Run Safe Rescaffold (if schema changes needed)

If you need to ensure all schema changes are applied safely without deleting data:

```bash
cd api
npm run db:safe-rescaffold
```

**Note**: This will NOT delete any data - it only adds missing columns/tables.

### Step 3: Update Project Stages and Financing Stages

Run the update script:

```bash
cd api
npm run db:update-stages
```

This script will:
1. ✅ Verify the `FinancingStage` column exists
2. ✅ Update all project stages based on the mappings above
3. ✅ Update all loan financing stages:
   - Set "Liquidated" for sold properties
   - Set "Permanent Loan" for The Waters at Hammond
   - Set "Construction Loan" for all other non-liquidated properties

## Verification

After running the update script, verify the changes:

```sql
-- Check project stages
SELECT ProjectName, Stage 
FROM core.Project 
WHERE ProjectName IN (
  'The Flats at Ransley',
  'The Waters at Hammond',
  'The Waters at Crestview',
  'Silver Oaks'
)
ORDER BY Stage, ProjectName;

-- Check financing stages
SELECT p.ProjectName, l.FinancingStage, l.LoanPhase
FROM banking.Loan l
INNER JOIN core.Project p ON l.ProjectId = p.ProjectId
WHERE p.ProjectName IN (
  'The Flats at Ransley',
  'The Waters at Hammond',
  'The Waters at Crestview',
  'Silver Oaks'
)
ORDER BY p.ProjectName;
```

## Notes

- The update script will **NOT delete any data** - it only updates existing records
- If a project name doesn't match exactly, it will be skipped (check the script output)
- The script uses fuzzy matching - make sure project names match exactly as listed above
- All updates preserve existing data and only modify the `Stage` and `FinancingStage` fields

## Troubleshooting

### Project Not Found
If a project shows as "NOT FOUND", check:
1. The project name in the database may be slightly different
2. Run this query to see actual project names:
   ```sql
   SELECT ProjectName FROM core.Project ORDER BY ProjectName;
   ```

### FinancingStage Column Missing
If you get an error about `FinancingStage` not existing:
1. Run the migration: `schema/03_add_financing_stage.sql`
2. Or run: `npm run db:safe-rescaffold`

### No Loans Updated
If no loans are updated:
1. Check if loans exist for the projects:
   ```sql
   SELECT p.ProjectName, COUNT(l.LoanId) as LoanCount
   FROM core.Project p
   LEFT JOIN banking.Loan l ON p.ProjectId = l.ProjectId
   WHERE p.ProjectName IN ('The Waters at Hammond', 'The Flats at Ransley')
   GROUP BY p.ProjectName;
   ```
