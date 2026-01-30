# Deal Pipeline Seed Sources

All deal details for the pipeline are seeded from these two Site Tracking worksheets. They are the **canonical source** for deal pipeline data.

## Source files

| Region        | File path (relative to repo root) |
|--------------|------------------------------------|
| Carolinas + East GA | `data/Site Tracking Worksheet - Carolinas + East GA .csv` |
| Gulf Coast    | `data/Site Tracking Worksheet - Gulf Coast.csv` |

## CSV columns (deal details)

Both CSVs use the same logical columns; only the **city** column name differs:

- **Carolinas:** `City`
- **Gulf Coast:** `Place` (mapped to `core.Project.City` when seeding)

| CSV column              | Maps to DB |
|-------------------------|------------|
| Status                  | `core.Project.Stage` |
| Site                    | `core.Project.ProjectName` (unique per deal) |
| City / Place            | `core.Project.City` |
| State                   | `core.Project.State` |
| Metro Area              | Carolinas: not used (Region = "Carolinas"); Gulf: `core.Project.Region` |
| County                  | `pipeline.DealPipeline.County` |
| Zip Code                | `pipeline.DealPipeline.ZipCode` |
| Total Acreage           | `pipeline.DealPipeline.Acreage` |
| MF Acreage              | `pipeline.DealPipeline.MFAcreage` |
| Zoning                  | `pipeline.DealPipeline.Zoning` |
| Zoned?                  | `pipeline.DealPipeline.Zoned` |
| Units                   | `core.Project.Units`, `pipeline.DealPipeline.UnitCount` |
| Price                   | `pipeline.DealPipeline.LandPrice` (parsed); raw in Notes if not parseable |
| Listed / Unlisted       | `pipeline.DealPipeline.ListingStatus` |
| Date Added              | `pipeline.DealPipeline.StartDate` |
| Broker/Referral Source  | `pipeline.DealPipeline.BrokerReferralSource` |
| Rejected Reason         | `pipeline.DealPipeline.RejectedReason` |
| Comments                | `pipeline.DealPipeline.Notes` (with price raw if needed) |

Seeding also sets `pipeline.DealPipeline.SqFtPrice` when LandPrice and Acreage are both present (LandPrice / (Acreage × 43560)).

## How to seed

**Prerequisite:** Site-tracking columns must exist on `pipeline.DealPipeline`. If the DB was created from scratch with `01_create_schema.sql`, they are already there. Otherwise run:

```bash
cd api && npm run db:add-deal-pipeline-site-tracking-columns
```

Then seed from the CSVs:

```bash
cd api

# Carolinas + East GA (sets Region = "Carolinas" for all rows)
npm run db:seed-site-tracking-carolinas

# Gulf Coast (sets Region = Metro Area from CSV)
npm run db:seed-site-tracking-gulf-coast
```

Each script:

1. Reads the CSV and parses Status, Site, City/Place, State, County, Zip, acreages, zoning, units, price, listing status, date added, broker, rejected reason, comments.
2. Upserts `core.Project` (ProjectName = Site, City, State, Region, Units, Stage).
3. Inserts or updates `pipeline.DealPipeline` for that project with Acreage, LandPrice, SqFtPrice, StartDate, UnitCount, Notes, County, ZipCode, MFAcreage, Zoning, Zoned, ListingStatus, BrokerReferralSource, RejectedReason.

## Attaching files to deals

After seeding, you can attach files from the pipeline file folders to the corresponding deals **via the API**:

- **Carolinas:** `data/CAROLINASPIPELINEFILES` → `npm run db:attach-carolinas-files`
- **Gulf Coast:** `data/GULFCOASTPIPELINEFILES` → `npm run db:attach-gulf-coast-files`

The attach scripts **use the API** (they do not connect to the DB or Azure directly):

1. **GET** `/api/pipeline/deal-pipeline` to get deals (Carolinas script filters by `RegionName === 'Carolinas'`).
2. For each file that matches a deal (by filename rules in the script), **POST** the file to `/api/pipeline/deal-pipeline/:id/attachments` (multipart field `file`).

**Env for the scripts:** The scripts load **`api/.env`** then **repo root `.env`** (so the root `.env` can hold all secrets). Set:

- **`API_BASE_URL`** — Base URL of the API (default `http://localhost:3000`). Use your deployed URL (e.g. `https://your-app.onrender.com`) to attach files to the live API.
- **`API_TOKEN`** or **`JWT_TOKEN`** (optional) — Bearer token if the API requires auth for pipeline endpoints.

No DB or Azure env vars are needed in the scripts; the API handles storage (disk or Azure Blob).

Filename-to-deal mapping is defined in the attach scripts; unmatched files are reported and can be ignored or mapped later.

**Azure Blob (for the API):** Store **`AZURE_STORAGE_CONNECTION_STRING`** and **`AZURE_STORAGE_CONTAINER`** in the **API** environment (e.g. Render). The API will store uploaded files in Azure Blob when those are set. The attach scripts simply POST files to the API; the API does the rest.
