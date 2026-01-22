# Update Commercial Land - Listed Projects

## Overview

This guide explains how to update specific projects to the "Commercial Land - Listed" stage.

## Projects to Update

The following projects should be set to "Commercial Land - Listed" stage:

1. **Mirage Ave. Crestview, FL 32536**
2. **Remaining Freeport Retail**
3. **Remaining Hammond Land**
4. **Starbucks**

## How to Update

Run the SQL script to update all projects:

```bash
cd api
npm run db:run-migration ../schema/update_commercial_land_listed_stage.sql
```

## What the Script Does

1. **Validates** which projects exist in the database
2. **Updates** the `Stage` field in `core.Project` to "Commercial Land - Listed"
3. **Shows** a summary of updated projects
4. **Warns** if any projects are not found

## Verification

After running the script, verify the updates:

```sql
SELECT 
    ProjectName,
    City,
    State,
    Region,
    Stage,
    UpdatedAt
FROM core.Project
WHERE ProjectName IN (
    'Mirage Ave. Crestview, FL 32536',
    'Remaining Freeport Retail',
    'Remaining Hammond Land',
    'Starbucks'
)
ORDER BY ProjectName;
```

All projects should show `Stage = 'Commercial Land - Listed'`.
