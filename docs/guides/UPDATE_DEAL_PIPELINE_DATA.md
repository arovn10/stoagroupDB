# Update Deal Pipeline Data Guide

## Overview

This guide explains how to validate and update DealPipeline data for projects that are "Under Contract".

## Step 1: Validate Existing Data

Before updating, check which projects exist and compare current vs expected data:

```bash
cd api
npm run db:run-migration ../schema/validate_deal_pipeline_data.sql
```

This will show:
- Which projects exist in the database
- Which projects have DealPipeline records
- Current vs expected values for all fields

## Step 2: Update Deal Pipeline Data

After validation, update all DealPipeline records with the provided data:

```bash
cd api
npm run db:run-migration ../schema/update_deal_pipeline_data.sql
```

This script will:
- ✅ Update `core.Project` fields: City, State, Region, Units, Stage (set to "Under Contract")
- ✅ Update `pipeline.DealPipeline` fields: Acreage, LandPrice, SqFtPrice, ExecutionDate, DueDiligenceDate, ClosingDate, PurchasingEntity, Cash, OpportunityZone, ClosingNotes
- ✅ Create DealPipeline records if they don't exist
- ✅ Parse Location (e.g., "Foley, AL") into City and State
- ✅ Set Stage to "Under Contract" for all deals

## What Gets Updated

### Core.Project Updates:
- `City` - Parsed from Location
- `State` - Parsed from Location  
- `Region` - Gulf Coast or Carolinas
- `Units` - From provided data
- `Stage` - Set to "Under Contract"

### Pipeline.DealPipeline Updates:
- `Acreage` - From provided data
- `LandPrice` - From Price field
- `SqFtPrice` - From provided data
- `ExecutionDate` - From Execution Date
- `DueDiligenceDate` - From Due Diligence
- `ClosingDate` - From Closing
- `PurchasingEntity` - From provided data
- `Cash` - FALSE for all deals
- `OpportunityZone` - TRUE/FALSE from provided data
- `ClosingNotes` - From Extension Option / Closing Notes

## Safety

- ✅ **NO DATA DELETION** - Only updates existing records or creates new ones
- ✅ **Idempotent** - Safe to run multiple times
- ✅ **Transaction-based** - Rolls back on error
- ✅ **Validation first** - Shows what will be updated before updating

## Projects Included

1. The Waters at OWA
2. The Waters at Southpoint
3. The Waters at Bartlett
4. Cahaba Valley Project
5. Greenville Project
6. Fort Walton Beach Project
7. The Waters at New Bern
8. Lake Murray
9. The Waters at SweetBay
10. The Waters at Fayetteville
11. The Flats at Niceville

## Verification

After running the update, verify the data:

```sql
SELECT 
    p.ProjectName,
    p.City,
    p.State,
    p.Region,
    p.Units,
    p.Stage,
    dp.Acreage,
    dp.LandPrice,
    dp.SqFtPrice,
    dp.ExecutionDate,
    dp.DueDiligenceDate,
    dp.ClosingDate,
    dp.PurchasingEntity,
    dp.Cash,
    dp.OpportunityZone,
    dp.ClosingNotes
FROM pipeline.DealPipeline dp
INNER JOIN core.Project p ON dp.ProjectId = p.ProjectId
WHERE p.Stage = 'Under Contract'
ORDER BY p.ProjectName;
```
