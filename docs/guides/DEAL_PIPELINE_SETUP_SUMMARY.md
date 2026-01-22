# Deal Pipeline Migration - Setup Summary

## What Was Built

### 1. Database Schema
- **Table**: `pipeline.DealPipeline`
- **File**: `schema/create_deal_pipeline_table.sql`
- **Fields**: All Asana tracking fields + Land Development specific fields
- **Relationships**: 
  - Links to `core.Project` via `ProjectId` (one-to-one)
  - Links to `core.PreConManager` via `PreConManagerId` (for Pre-Con Manager)

### 2. API Endpoints
- **GET** `/api/pipeline/deal-pipeline` - Get all deals
- **GET** `/api/pipeline/deal-pipeline/:id` - Get deal by ID
- **GET** `/api/pipeline/deal-pipeline/project/:projectId` - Get deal by Project ID
- **POST** `/api/pipeline/deal-pipeline` - Create new deal
- **PUT** `/api/pipeline/deal-pipeline/:id` - Update deal
- **DELETE** `/api/pipeline/deal-pipeline/:id` - Delete deal

### 3. API Client Functions
All functions added to `api-client.js`:
- `getAllDealPipelines()`
- `getDealPipelineById(id)`
- `getDealPipelineByProjectId(projectId)`
- `createDealPipeline(data)`
- `updateDealPipeline(id, data)`
- `deleteDealPipeline(id)`

### 4. Asana Import Script
- **File**: `api/scripts/import-asana-deal-pipeline.ts`
- **Command**: `npm run db:import-asana-deal-pipeline`
- **Functionality**: 
  - Fetches all tasks from Asana Deal Pipeline project
  - Parses custom fields and notes
  - Creates/updates Projects in `core.Project`
  - Creates/updates DealPipeline records
  - Handles rate limiting and errors gracefully

### 5. Frontend Implementation Guide
- **File**: `docs/guides/DEAL_PIPELINE_FRONTEND_IMPLEMENTATION.md`
- **Contents**: Complete step-by-step guide for frontend implementation

## Setup Steps

### Step 1: Run Database Migration
```bash
cd api
npm run db:run-migration ../schema/create_deal_pipeline_table.sql
```

### Step 2: Configure Asana Import (Optional)
Add to `.env` file:
```
ASANA_ACCESS_TOKEN=your_asana_token_here
ASANA_PROJECT_GID=1207455912614114
```

### Step 3: Import Existing Asana Data (Optional)
```bash
cd api
npm run db:import-asana-deal-pipeline
```

### Step 4: Build and Deploy API
```bash
cd api
npm run build
# Deploy to your hosting platform
```

### Step 5: Update Frontend
Follow the guide in `docs/guides/DEAL_PIPELINE_FRONTEND_IMPLEMENTATION.md`

## Data Fields

### CORE Fields (stored in `core.Project`)
- ProjectName
- City
- State
- Region
- Units
- ProductType
- Stage (Prospective, Under Contract, Commercial Land - Listed, Under Construction, Lease-Up, Stabilized, Liquidated, Dead, HoldCo)
- EstimatedConstructionStartDate

### Deal Pipeline Fields (stored in `pipeline.DealPipeline`)
- Bank (text)
- StartDate (date)
- UnitCount (number - also updates CORE.Units)
- PreConManagerId (FK to core.PreConManager)
- ConstructionLoanClosingDate (date)
- Notes (text)
- Priority (High, Medium, Low)
- Acreage (decimal)
- LandPrice (decimal)
- SqFtPrice (decimal - auto-calculated)
- ExecutionDate (date)
- DueDiligenceDate (date)
- ClosingDate (date)
- PurchasingEntity (text)
- Cash (boolean)
- OpportunityZone (boolean)
- ClosingNotes (text)
- AsanaTaskGid (for sync tracking)
- AsanaProjectGid (for sync tracking)

## Key Features

1. **Automatic Calculations**: SqFtPrice is automatically calculated from LandPrice and Acreage
2. **CORE Integration**: Updates core.Project fields when DealPipeline is created/updated
3. **Stage Management**: Stage is stored in core.Project.Stage (controlled by Land Development)
4. **One-to-One Relationship**: Each Project has exactly one DealPipeline record
5. **Pre-Con Manager**: Links to core.Person table for contact information

## Testing

Test the API endpoints:
```javascript
// Get all deals
const deals = await API.getAllDealPipelines();
console.log('Deals:', deals.data);

// Create a test deal
const testDeal = await API.createDealPipeline({
  ProjectId: 1,
  ProjectName: 'Test Deal',
  Stage: 'Prospective',
  Bank: 'Test Bank'
});
```

## Next Steps

1. ✅ Database schema created
2. ✅ API endpoints implemented
3. ✅ API client updated
4. ✅ Import script created
5. ✅ Frontend guide written
6. ⏳ Run database migration
7. ⏳ Import Asana data (optional)
8. ⏳ Deploy API
9. ⏳ Update frontend dashboard
10. ⏳ Test end-to-end

## Files Changed

- `schema/create_deal_pipeline_table.sql` - New table schema
- `api/src/controllers/pipelineController.ts` - Added Deal Pipeline controllers
- `api/src/routes/pipelineRoutes.ts` - Added Deal Pipeline routes
- `api/src/server.ts` - Added Deal Pipeline to API docs
- `api/scripts/import-asana-deal-pipeline.ts` - New import script
- `api/package.json` - Added import script command
- `api-client.js` - Added Deal Pipeline functions
- `docs/guides/DEAL_PIPELINE_FRONTEND_IMPLEMENTATION.md` - Frontend guide
- `docs/guides/DEAL_PIPELINE_SETUP_SUMMARY.md` - This file
