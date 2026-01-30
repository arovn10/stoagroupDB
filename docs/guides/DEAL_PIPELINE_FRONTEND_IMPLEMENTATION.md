# Deal Pipeline Frontend Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the Deal Pipeline dashboard using the new database-backed API instead of Asana. The Deal Pipeline tracks land development deals from Prospective → Under Contract → Commercial Land - Listed → Under Construction → Lease-Up → Stabilized → Liquidated.

**Recent addition:** Deal pipeline **file attachments** — upload, list, download, and delete files per deal (e.g. LOIs, site plans, due diligence docs). See [Deal Pipeline Attachments (What Changed)](#deal-pipeline-attachments-what-changed) and [Implementing Attachments on the Frontend](#implementing-attachments-on-the-frontend).

## Architecture

### Data Flow
1. **Frontend Dashboard** → API calls to `/api/pipeline/deal-pipeline`
2. **API** → Queries `pipeline.DealPipeline` table (joins with `core.Project` for CORE data)
3. **Database** → Single source of truth for all deal data

### Key Concepts
- **CORE Data**: ProjectName, City, State, Region, Units, ProductType, Stage (stored in `core.Project`)
- **Deal Pipeline Data**: Bank, StartDate, UnitCount, PreConManager, Acreage, LandPrice, etc. (stored in `pipeline.DealPipeline`)
- **Stage Management**: Stage is stored in `core.Project.Stage` and controlled by Land Development team
- **One-to-One Relationship**: Each Project has exactly one DealPipeline record

## API Endpoints

### Base URL
```
https://stoagroupdb-ddre.onrender.com/api/pipeline/deal-pipeline
```

### Available Endpoints

#### GET All Deals
```javascript
GET /api/pipeline/deal-pipeline
```
Returns all deal pipeline records with CORE data joined.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "DealPipelineId": 1,
      "ProjectId": 1,
      "ProjectName": "The Heights at Picardy",
      "City": "Baton Rouge",
      "State": "LA",
      "Region": "Gulf Coast",
      "Units": 232,
      "ProductType": "Land",
      "Stage": "Prospective",
      "EstimatedConstructionStartDate": "2024-01-15",
      "Bank": "B1Bank",
      "StartDate": "2024-01-15",
      "UnitCount": 232,
      "PreConManagerId": 5,
      "PreConManagerName": "John Doe",
      "PreConManagerEmail": "john@example.com",
      "PreConManagerPhone": "555-1234",
      "ConstructionLoanClosingDate": "2024-02-01",
      "Notes": "Deal notes...",
      "Priority": "High",
      "Acreage": 10.5,
      "LandPrice": 5000000,
      "SqFtPrice": 10.95,
      "ExecutionDate": "2023-12-01",
      "DueDiligenceDate": "2024-01-15",
      "ClosingDate": "2024-02-01",
      "PurchasingEntity": "Stoa Holdings, LLC",
      "Cash": true,
      "OpportunityZone": false,
      "ClosingNotes": "Extension option available",
      "AsanaTaskGid": "1207745310135146",
      "AsanaProjectGid": "1207455912614114",
      "CreatedAt": "2024-01-01T00:00:00",
      "UpdatedAt": "2024-01-15T00:00:00"
    }
  ]
}
```

#### GET Deal by ID
```javascript
GET /api/pipeline/deal-pipeline/:id
```

#### GET Deal by Project ID
```javascript
GET /api/pipeline/deal-pipeline/project/:projectId
```

#### CREATE Deal
```javascript
POST /api/pipeline/deal-pipeline
Content-Type: application/json

{
  "ProjectId": 1,  // Required - must exist in core.Project
  "ProjectName": "The Heights at Picardy",  // Optional - updates CORE if provided
  "City": "Baton Rouge",  // Optional - updates CORE
  "State": "LA",  // Optional - updates CORE
  "Region": "Gulf Coast",  // Optional - updates CORE
  "Units": 232,  // Optional - updates CORE
  "ProductType": "Land",  // Optional - updates CORE (Heights, Prototype, Flats, Land, Other)
  "Stage": "Prospective",  // Optional - updates CORE (default: 'Prospective')
  "EstimatedConstructionStartDate": "2024-01-15",  // Optional - updates CORE
  "Bank": "B1Bank",
  "StartDate": "2024-01-15",
  "UnitCount": 232,  // Updates CORE.Units if Units not provided
  "PreConManagerId": 5,  // FK to core.PreConManager
  "ConstructionLoanClosingDate": "2024-02-01",
  "Notes": "Deal notes...",
  "Priority": "High",  // 'High', 'Medium', or 'Low'
  "Acreage": 10.5,
  "LandPrice": 5000000,
  "ExecutionDate": "2023-12-01",
  "DueDiligenceDate": "2024-01-15",
  "ClosingDate": "2024-02-01",
  "PurchasingEntity": "Stoa Holdings, LLC",
  "Cash": true,
  "OpportunityZone": false,
  "ClosingNotes": "Extension option available",
  "AsanaTaskGid": "1207745310135146",  // For sync tracking
  "AsanaProjectGid": "1207455912614114"  // For sync tracking
}
```

**Note:** `SqFtPrice` is automatically calculated as `LandPrice / (Acreage * 43560)`.

#### UPDATE Deal
```javascript
PUT /api/pipeline/deal-pipeline/:id
Content-Type: application/json

{
  // Same fields as CREATE, all optional
  "Stage": "Under Contract",
  "Bank": "Renasant Bank",
  "Priority": "Medium"
}
```

#### DELETE Deal
```javascript
DELETE /api/pipeline/deal-pipeline/:id
```

### Deal Pipeline Attachments (file uploads per deal)

Each deal can have multiple file attachments (e.g. LOIs, site plans, PDFs). The API stores metadata in `pipeline.DealPipelineAttachment` and files on disk (or configurable storage).

| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/pipeline/deal-pipeline/:id/attachments` | List attachments for deal `:id` |
| **POST** | `/api/pipeline/deal-pipeline/:id/attachments` | Upload file (multipart field **`file`**, max 200MB) |
| **GET** | `/api/pipeline/deal-pipeline/attachments/:attachmentId/download` | Download file by attachment id |
| **DELETE** | `/api/pipeline/deal-pipeline/attachments/:attachmentId` | Delete attachment (and file) |

- **List** returns: `DealPipelineAttachmentId`, `DealPipelineId`, `FileName`, `ContentType`, `FileSizeBytes`, `CreatedAt`.
- **Upload** accepts `multipart/form-data` with a single field named **`file`**; returns the created attachment row (including `DealPipelineAttachmentId`).
- **Download** returns the raw file stream (set `Content-Disposition: attachment`); use the URL in `<a download>` or fetch and create a blob URL if you need to pass auth headers.

## Using the API Client

The `api-client.js` file includes all Deal Pipeline functions:

```javascript
// Get all deals
const deals = await API.getAllDealPipelines();
console.log('All deals:', deals.data);

// Get deal by project ID
const deal = await API.getDealPipelineByProjectId(1);
console.log('Deal:', deal.data);

// Create a new deal
const newDeal = await API.createDealPipeline({
  ProjectId: 1,
  ProjectName: 'The Heights at Picardy',
  City: 'Baton Rouge',
  State: 'LA',
  Stage: 'Prospective',
  Bank: 'B1Bank',
  StartDate: '2024-01-15',
  UnitCount: 232,
  Priority: 'High',
  Acreage: 10.5,
  LandPrice: 5000000,
  Cash: true
});

// Update a deal
const updated = await API.updateDealPipeline(1, {
  Stage: 'Under Contract',
  Bank: 'Renasant Bank'
});

// Delete a deal
await API.deleteDealPipeline(1);
```

### API Client – Deal Pipeline Attachments (new)

The `api-client.js` file includes four new functions for deal pipeline file attachments:

```javascript
// List attachments for a deal
const list = await API.listDealPipelineAttachments(dealPipelineId);
// list.data = [{ DealPipelineAttachmentId, DealPipelineId, FileName, ContentType, FileSizeBytes, CreatedAt }, ...]

// Upload a file (e.g. from <input type="file">)
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const uploaded = await API.uploadDealPipelineAttachment(dealPipelineId, file);
// uploaded.data = { DealPipelineAttachmentId, DealPipelineId, FileName, ContentType, FileSizeBytes, CreatedAt }

// Get download URL (use in <a href="..." download> or open in new tab)
const url = API.getDealPipelineAttachmentDownloadUrl(attachmentId);

// Delete an attachment
await API.deleteDealPipelineAttachment(attachmentId);
```

See [Implementing Attachments on the Frontend](#implementing-attachments-on-the-frontend) for full UI and code examples.

## Frontend Implementation Steps

### Step 1: Replace Asana API Calls

**Before (Asana):**
```javascript
// Old Asana API call
const response = await fetch(`https://app.asana.com/api/1.0/projects/${projectGid}/tasks`, {
  headers: {
    'Authorization': `Bearer ${ASANA_TOKEN}`
  }
});
```

**After (Database API):**
```javascript
// New database API call
const response = await API.getAllDealPipelines();
const deals = response.data;
```

### Step 2: Update Data Structure

The API returns data in a different format than Asana. Update your data parsing:

**Before (Asana):**
```javascript
// Asana task structure
const deal = {
  name: task.name,
  stage: task.custom_fields.find(f => f.name === 'Stage')?.enum_value?.name,
  location: task.custom_fields.find(f => f.name === 'Location')?.enum_value?.name,
  bank: task.custom_fields.find(f => f.name === 'Bank')?.text_value,
  // ...
};
```

**After (Database API):**
```javascript
// Database API structure
const deal = {
  ProjectName: deal.ProjectName,
  Stage: deal.Stage,  // Already parsed from core.Project
  City: deal.City,
  State: deal.State,
  Region: deal.RegionName,  // From joined core.Region
  Bank: deal.Bank,
  // ...
};
```

### Step 3: Update Stage Filtering

Stages are now stored in `core.Project.Stage`:

```javascript
// Filter by stage
const filteredDeals = deals.filter(deal => {
  if (!stageFilter) return true;
  return deal.Stage === stageFilter;
});

// Available stages:
// - 'Prospective'
// - 'Under Contract'
// - 'Started'
// - 'Stabilized'
// - 'Closed'
// - 'Dead'
```

### Step 4: Update Location Filtering

Location is now split into City and State:

```javascript
// Filter by location (city)
const filteredDeals = deals.filter(deal => {
  if (!locationFilter) return true;
  return deal.City === locationFilter || 
         `${deal.City}, ${deal.State}` === locationFilter;
});

// Get unique locations for filter dropdown
const locations = [...new Set(
  deals
    .filter(d => d.City && d.State)
    .map(d => `${d.City}, ${d.State}`)
)];
```

### Step 5: Update Bank Filtering

Bank is stored as a text field:

```javascript
// Filter by bank
const filteredDeals = deals.filter(deal => {
  if (!bankFilter) return true;
  return deal.Bank === bankFilter;
});

// Get unique banks for filter dropdown
const banks = [...new Set(
  deals
    .filter(d => d.Bank)
    .map(d => d.Bank)
)];
```

### Step 6: Update Product Type Filtering

Product Type is stored in `core.Project.ProductType`:

```javascript
// Filter by product type
const filteredDeals = deals.filter(deal => {
  if (!productFilter) return true;
  return deal.ProductType === productFilter;
});

// Available product types:
// - 'Prototype'
// - 'Heights'
// - 'Flats'
// - 'Heights/Flats'
// - 'Other'
```

### Step 7: Update Date Sorting

Start Date is stored in `StartDate` field:

```javascript
// Sort by start date
deals.sort((a, b) => {
  const dateA = a.StartDate ? new Date(a.StartDate) : new Date(0);
  const dateB = b.StartDate ? new Date(b.StartDate) : new Date(0);
  return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
});
```

### Step 8: Update Timeline View

Group deals by quarter/year using `StartDate`:

```javascript
function groupDealsByTimeline(deals) {
  const grouped = {};
  
  deals.forEach(deal => {
    if (!deal.StartDate) return;
    
    const date = new Date(deal.StartDate);
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const key = `Q${quarter} ${year}`;
    
    if (!grouped[key]) {
      grouped[key] = [];
    }
    
    grouped[key].push(deal);
  });
  
  return grouped;
}
```

### Step 9: Update Deal Creation Form

When creating a new deal, you need to:

1. **Create Project first** (if it doesn't exist):
```javascript
// Check if project exists
const existingProject = await API.getProjectById(projectId);
if (!existingProject.success) {
  // Create project first
  const newProject = await API.createProject({
    ProjectName: formData.ProjectName,
    City: formData.City,
    State: formData.State,
    Region: formData.Region,
    Stage: 'Prospective'  // Default stage for new deals
  });
  projectId = newProject.data.ProjectId;
}
```

2. **Create DealPipeline record**:
```javascript
const deal = await API.createDealPipeline({
  ProjectId: projectId,
  ProjectName: formData.ProjectName,
  City: formData.City,
  State: formData.State,
  Region: formData.Region,
  Stage: 'Prospective',
  Bank: formData.Bank,
  StartDate: formData.StartDate,
  UnitCount: formData.UnitCount,
  Priority: formData.Priority,
  Acreage: formData.Acreage,
  LandPrice: formData.LandPrice,
  ExecutionDate: formData.ExecutionDate,
  DueDiligenceDate: formData.DueDiligenceDate,
  ClosingDate: formData.ClosingDate,
  PurchasingEntity: formData.PurchasingEntity,
  Cash: formData.Cash === 'Yes' || formData.Cash === true,
  OpportunityZone: formData.OpportunityZone === 'Yes' || formData.OpportunityZone === true,
  ClosingNotes: formData.ClosingNotes,
  Notes: formData.Notes
});
```

### Step 10: Update Deal Edit Form

When editing a deal:

```javascript
// Load existing deal
const deal = await API.getDealPipelineById(dealPipelineId);

// Populate form with deal data
formData.ProjectName = deal.data.ProjectName;
formData.City = deal.data.City;
formData.State = deal.data.State;
formData.Stage = deal.data.Stage;
formData.Bank = deal.data.Bank;
formData.StartDate = deal.data.StartDate;
// ... etc

// Update deal
const updated = await API.updateDealPipeline(dealPipelineId, {
  Stage: formData.Stage,
  Bank: formData.Bank,
  StartDate: formData.StartDate,
  // ... other fields
});
```

### Step 11: Update Pre-Con Manager Selection

Pre-Con Manager is now a separate datapoint in `core.PreConManager` (not tied to contacts):

```javascript
// Note: PreConManager CRUD endpoints would need to be created if you want to manage them via API
// For now, PreConManagerId references core.PreConManager.PreConManagerId

// When creating/updating deal
const deal = await API.createDealPipeline({
  // ...
  PreConManagerId: selectedPreConManagerId  // PreConManagerId from core.PreConManager table
});
```

### Step 12: Handle Priority Field

Priority is now a constrained field:

```javascript
// Priority dropdown options
const priorityOptions = ['High', 'Medium', 'Low'];

// Validate priority
if (priority && !priorityOptions.includes(priority)) {
  throw new Error('Priority must be High, Medium, or Low');
}
```

### Step 13: Update Unit Summary View

Unit summary by location/state:

```javascript
function calculateUnitSummary(deals) {
  const summary = {
    byLocation: {},
    byState: {},
    total: 0
  };
  
  deals.forEach(deal => {
    const units = deal.Units || deal.UnitCount || 0;
    const location = deal.City ? `${deal.City}, ${deal.State}` : 'Unknown';
    const state = deal.State || 'Unknown';
    
    // By location
    if (!summary.byLocation[location]) {
      summary.byLocation[location] = { units: 0, deals: 0 };
    }
    summary.byLocation[location].units += units;
    summary.byLocation[location].deals++;
    
    // By state
    if (!summary.byState[state]) {
      summary.byState[state] = { units: 0, deals: 0 };
    }
    summary.byState[state].units += units;
    summary.byState[state].deals++;
    
    summary.total += units;
  });
  
  return summary;
}
```

### Step 14: Update Map View

If you're using a map view, use City/State for coordinates:

```javascript
// Get coordinates for city/state (you may need a geocoding service)
async function getCoordinates(city, state) {
  // Use a geocoding API or your own coordinate database
  const response = await fetch(`https://geocoding-api.com/search?city=${city}&state=${state}`);
  const data = await response.json();
  return { lat: data.latitude, lng: data.longitude };
}

// Add markers for each deal
deals.forEach(async (deal) => {
  if (deal.City && deal.State) {
    const coords = await getCoordinates(deal.City, deal.State);
    map.addMarker({
      lat: coords.lat,
      lng: coords.lng,
      title: deal.ProjectName,
      stage: deal.Stage,
      units: deal.Units || deal.UnitCount
    });
  }
});
```

## Data Migration from Asana

To migrate existing Asana data:

1. **Run the import script**:
```bash
cd api
npm run db:import-asana-deal-pipeline
```

2. **Verify data**:
```javascript
const deals = await API.getAllDealPipelines();
console.log(`Imported ${deals.data.length} deals`);
```

3. **Check for missing data**:
```javascript
// Find deals without required fields
const incompleteDeals = deals.data.filter(d => 
  !d.ProjectName || !d.Stage
);
console.log('Incomplete deals:', incompleteDeals);
```

## Common Patterns

### Loading All Deals on Page Load

```javascript
async function loadDeals() {
  try {
    setLoading(true);
    const response = await API.getAllDealPipelines();
    setDeals(response.data);
    setFilteredDeals(response.data);
  } catch (error) {
    console.error('Error loading deals:', error);
    showError('Failed to load deals');
  } finally {
    setLoading(false);
  }
}

// Call on component mount
useEffect(() => {
  loadDeals();
}, []);
```

### Filtering and Sorting

```javascript
function applyFilters(deals, filters) {
  let filtered = [...deals];
  
  // Stage filter
  if (filters.stage) {
    filtered = filtered.filter(d => d.Stage === filters.stage);
  }
  
  // Location filter
  if (filters.location) {
    filtered = filtered.filter(d => 
      `${d.City}, ${d.State}` === filters.location
    );
  }
  
  // Bank filter
  if (filters.bank) {
    filtered = filtered.filter(d => d.Bank === filters.bank);
  }
  
  // Product type filter
  if (filters.productType) {
    filtered = filtered.filter(d => d.ProductType === filters.productType);
  }
  
  // Search filter
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(d =>
      d.ProjectName.toLowerCase().includes(searchLower) ||
      (d.Notes && d.Notes.toLowerCase().includes(searchLower))
    );
  }
  
  // Sort
  filtered.sort((a, b) => {
    switch (filters.sortBy) {
      case 'name':
        return a.ProjectName.localeCompare(b.ProjectName);
      case 'stage':
        return a.Stage.localeCompare(b.Stage);
      case 'units':
        return (b.Units || 0) - (a.Units || 0);
      case 'date':
        const dateA = a.StartDate ? new Date(a.StartDate) : new Date(0);
        const dateB = b.StartDate ? new Date(b.StartDate) : new Date(0);
        return filters.sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      default:
        return 0;
    }
  });
  
  return filtered;
}
```

### Real-time Updates

If you want real-time updates, you can poll the API:

```javascript
// Poll every 30 seconds
useEffect(() => {
  const interval = setInterval(() => {
    loadDeals();
  }, 30000);
  
  return () => clearInterval(interval);
}, []);
```

Or use WebSockets if your backend supports it.

## Error Handling

Handle common API errors:

```javascript
try {
  const deal = await API.createDealPipeline(data);
} catch (error) {
  if (error.response?.status === 400) {
    // Validation error
    const message = error.response.data.error?.message || 'Invalid data';
    showError(message);
  } else if (error.response?.status === 404) {
    // Not found
    showError('Deal not found');
  } else if (error.response?.status === 409) {
    // Conflict (deal already exists for project)
    showError('A deal pipeline record already exists for this project');
  } else {
    // Other error
    showError('An error occurred. Please try again.');
  }
}
```

## Testing

Test your implementation:

1. **Load all deals**:
```javascript
const deals = await API.getAllDealPipelines();
console.assert(deals.success === true);
console.assert(Array.isArray(deals.data));
```

2. **Create a test deal**:
```javascript
const testDeal = await API.createDealPipeline({
  ProjectId: 1,
  ProjectName: 'Test Deal',
  Stage: 'Prospective',
  Bank: 'Test Bank',
  Priority: 'High'
});
console.assert(testDeal.success === true);
```

3. **Update the deal**:
```javascript
const updated = await API.updateDealPipeline(testDeal.data.DealPipelineId, {
  Stage: 'Under Contract'
});
console.assert(updated.success === true);
console.assert(updated.data.Stage === 'Under Contract');
```

4. **Delete the deal**:
```javascript
const deleted = await API.deleteDealPipeline(testDeal.data.DealPipelineId);
console.assert(deleted.success === true);
```

---

## Deal Pipeline Attachments (What Changed)

### Backend / API

- **New table:** `pipeline.DealPipelineAttachment` — stores metadata per file (DealPipelineId, FileName, StoragePath, ContentType, FileSizeBytes, CreatedAt). Files are stored on disk under a configurable `UPLOAD_DIR` (default `api/uploads/deal-pipeline/{dealPipelineId}/`).
- **New endpoints:** List attachments for a deal, upload (multipart `file`), download by attachment id, delete attachment (and file).
- **Migration:** Existing DBs need `schema/add_deal_pipeline_attachments.sql` run once. New DBs get the table from `01_create_schema.sql`.

### api-client.js Changes

**File:** `api-client.js` (repo root). Four new functions were added and attached to the global `API` object:

| Function | Purpose |
|----------|---------|
| `API.listDealPipelineAttachments(dealPipelineId)` | GET list of attachments for a deal |
| `API.uploadDealPipelineAttachment(dealPipelineId, file)` | POST file (FormData, field `file`); returns created attachment row |
| `API.getDealPipelineAttachmentDownloadUrl(attachmentId)` | Returns full URL for the download endpoint (for `<a download>` or new tab) |
| `API.deleteDealPipelineAttachment(attachmentId)` | DELETE attachment and file |

- **Upload** uses `FormData` and does not set `Content-Type` (browser sets `multipart/form-data` with boundary). Max file size is 200MB (enforced by server).
- **Download:** If your API is public, use `getDealPipelineAttachmentDownloadUrl(attachmentId)` as `href` for a link. If the API requires auth, use `fetch(url, { headers: { Authorization: 'Bearer ' + token } })`, then `response.blob()`, then `URL.createObjectURL(blob)` for a temporary download link.

---

## Implementing Attachments on the Frontend

### 1. Ensure api-client.js is up to date

- Pull the latest `api-client.js` that includes `listDealPipelineAttachments`, `uploadDealPipelineAttachment`, `getDealPipelineAttachmentDownloadUrl`, and `deleteDealPipelineAttachment`.
- If you copy-paste the client, add the four functions and their assignments to the `API` object (see the “API Client – Deal Pipeline Attachments” section above).

### 2. Deal detail / edit view: show attachments

- When showing a single deal (e.g. by `DealPipelineId`), call `API.listDealPipelineAttachments(dealPipelineId)` and store the result in state (e.g. `attachments`).
- Render a list of attachments: file name, size, date, and actions (download, delete).

Example (conceptual):

```javascript
// Load attachments when deal is selected
const [attachments, setAttachments] = useState([]);

useEffect(() => {
  if (!dealPipelineId) return;
  API.listDealPipelineAttachments(dealPipelineId)
    .then((res) => setAttachments(res.data || []))
    .catch((err) => console.error('Failed to load attachments', err));
}, [dealPipelineId]);
```

```html
<ul>
  {attachments.map((a) => (
    <li key={a.DealPipelineAttachmentId}>
      <a href={API.getDealPipelineAttachmentDownloadUrl(a.DealPipelineAttachmentId)} download>
        {a.FileName}
      </a>
      <span>{(a.FileSizeBytes / 1024).toFixed(1)} KB</span>
      <button onClick={() => handleDeleteAttachment(a.DealPipelineAttachmentId)}>Delete</button>
    </li>
  ))}
</ul>
```

### 3. Upload control

- Add a file input (and optionally a “Upload” button) on the deal detail/edit view.
- On submit, call `API.uploadDealPipelineAttachment(dealPipelineId, file)` with the selected `File`. Do not set `Content-Type`; the client uses `FormData` and the browser sets it.

Example:

```javascript
function handleUpload(dealPipelineId, file) {
  if (!file) return;
  API.uploadDealPipelineAttachment(dealPipelineId, file)
    .then((res) => {
      setAttachments((prev) => [res.data, ...prev]);
      // clear file input
    })
    .catch((err) => alert(err.message || 'Upload failed'));
}
```

```html
<input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(dealPipelineId, f); }} />
```

- Optionally: restrict allowed types (e.g. PDF, images) and show a max size message (e.g. “Max 200MB”) to match server limits.

### 4. Download with auth (if required)

If the download endpoint requires authentication, do not use the raw URL in `href` (no header). Instead, fetch with the token and create a blob URL:

```javascript
async function downloadAttachmentWithAuth(attachmentId) {
  const url = API.getDealPipelineAttachmentDownloadUrl(attachmentId);
  const token = API.getAuthToken?.() || localStorage.getItem('authToken');
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = 'attachment'; // optional: use attachment FileName from list
  a.click();
  URL.revokeObjectURL(objectUrl);
}
```

Use the attachment’s `FileName` from the list response for `a.download` if you have it.

### 5. Delete attachment

- From the list, call `API.deleteDealPipelineAttachment(attachmentId)` and remove the item from local state (or refetch the list).

Example:

```javascript
function handleDeleteAttachment(attachmentId) {
  if (!confirm('Delete this file?')) return;
  API.deleteDealPipelineAttachment(attachmentId)
    .then(() => setAttachments((prev) => prev.filter((a) => a.DealPipelineAttachmentId !== attachmentId)))
    .catch((err) => alert(err.message || 'Delete failed'));
}
```

### 6. Error handling

- **Upload:** 400 = no file or invalid deal id; 404 = deal not found; 413 = file too large (server limit 200MB).
- **List/Download/Delete:** 404 = deal or attachment not found.
- Surface these in the UI (e.g. toast or inline message) and refresh the attachment list after upload/delete.

### 7. Optional: show attachment count on deal cards

- When listing deals, you can optionally fetch attachment counts per deal (e.g. by calling `listDealPipelineAttachments` for each deal or by adding a future “count” endpoint). For now, the attachment list is loaded only when the user opens a deal.

---

## Next Steps

1. **Update your frontend** to use the new API endpoints (and attachments as above).
2. **Test thoroughly** with real data (including file upload/download/delete).
3. **Migrate existing Asana data** using the import script (if applicable).
4. **Update documentation** for your team.
5. **Set up monitoring** for API errors.

## Support

If you encounter issues:
1. Check the API response for error messages
2. Verify your data matches the expected format
3. Check that required fields are provided
4. Review the API documentation in `api-client.js`
