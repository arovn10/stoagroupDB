# Leasing API endpoints and frontend mapping

## Snapshot storage (database table)

The dashboard snapshot is stored in the database so the UI can load instantly instead of rebuilding from raw data every time.

- **Table:** `leasing.DashboardSnapshot`
- **Columns (must match exactly for writes to succeed):**
  - `Id` (int, NOT NULL, PK) — single row, use value `1`
  - `Payload` (nvarchar(max), NULL) — JSON; app stores gzip+base64 with `gz:` prefix
  - `BuiltAt` (datetime2, NOT NULL) — when the snapshot was built
- If you see a row with all NULLs in SSMS, the API may be using a different database (check `api/.env` connection string), or the table may have been created with different column types. The app uses UPDATE-then-INSERT and verifies the row after write; check API logs for `[leasing] DashboardSnapshot verify: row missing or Payload NULL`.
- **Written by:**
  - **After sync (primary):** `POST /api/leasing/sync-from-domo` calls `rebuildDashboardSnapshot()` when any dataset was synced. The cron should run sync-check → sync-from-domo; the snapshot is built at the end of sync, not on deploy.
  - `getDashboard` when it builds from raw (then upserts snapshot before returning)
  - `rebuildDashboardSnapshot()` — also callable via POST `/api/leasing/rebuild-snapshot` (manual or cron).
  - **On server startup:** only if **`RUN_LEASING_SNAPSHOT_ON_STARTUP=true`** (default: no snapshot on deploy).
- **Read by:** `getDashboard` — serves from this table when a row exists; otherwise builds from raw and saves

**Memory and OOM (e.g. Render 2GB):** Building the snapshot loads all raw leasing tables and can exceed 2GB. Snapshot is built at the **end of sync-from-domo** (cron), not on deploy. Set **`RUN_LEASING_SNAPSHOT_ON_STARTUP=true`** only if you need a snapshot on every deploy; otherwise the first GET `/api/leasing/dashboard` will build and save one on demand, or run POST `/api/leasing/rebuild-snapshot` manually. Snapshot is stored as the full API response body so serving from snapshot does not parse the payload again.

---

## All leasing routes

| Method | Path | Frontend use | Notes |
|--------|------|--------------|--------|
| GET | `/api/leasing/aggregates/available` | No | List available aggregate types |
| GET | `/api/leasing/aggregates` | No | Aggregates with query params |
| **GET** | **`/api/leasing/dashboard`** | **Yes (primary)** | **App load.** Returns `{ success, dashboard }` with `dashboard.rows` and related structures. Served from snapshot when present. |
| POST | `/api/leasing/rebuild-snapshot` | No | Cron/manual; rebuilds snapshot and upserts to `leasing.DashboardSnapshot` |
| **POST** | **`/api/leasing/sync`** | **Optional** | Only when app uses Domo data: push leasing/MMRData to API (fire-and-forget) |
| GET | `/api/leasing/sync-check` | No | Admin/sync |
| GET | `/api/leasing/sync-health` | No | Admin/sync |
| GET | `/api/leasing/domo-columns` | No | Admin/sync |
| POST | `/api/leasing/sync-add-alias` | No | Admin/sync |
| POST | `/api/leasing/sync-from-domo` | No | Admin/sync |
| POST | `/api/leasing/wipe` | No | Admin; wipe leasing data |
| GET | `/api/leasing/datasets/:dataset` | No | List dataset rows (e.g. leasing, mmrdata) |
| GET | `/api/leasing/datasets/:dataset/:id` | No | Get one row by id |
| POST | `/api/leasing/datasets/leasing` | No | Create leasing row |
| PUT | `/api/leasing/datasets/leasing/:id` | No | Update leasing row |
| DELETE | `/api/leasing/datasets/leasing/:id` | No | Delete leasing row |

---

## Frontend behavior vs backend

- **Backend-only flow (current):** The Leasing Analytics Hub expects `window.__LV_AGGREGATION_API__`. It calls **GET /api/leasing/dashboard** once on load. Response must be `{ success: true, dashboard: { rows: [...], unitmixStruct, pricingByPlan, ... } }`. All charts/tables use this payload; no Domo fetches.
- **Optional:** If the app were to load from Domo first, it would call **POST /api/leasing/sync** to push data; that path is not used when the app loads from the backend dashboard.
- **Same functionality:** The backend `buildDashboardFromRaw()` (and thus the snapshot payload) is built to match what the frontend previously computed from Domo (rows, unitmix, pricing, recents, portfolio details, etc.). Serving from snapshot preserves that behavior with faster response time.

---

## How to test

Run:

```bash
node scripts/test-leasing-endpoints.js [baseUrl]
```

Example: `node scripts/test-leasing-endpoints.js https://stoagroupdb-ddre.onrender.com`

- All listed endpoints are requested; status and a short detail (e.g. dashboard rows count, `fromSnapshot`) are printed.
- Snapshot is confirmed implicitly: after a rebuild or first dashboard build, GET dashboard should return quickly and can include `_meta.fromSnapshot: true` when served from `leasing.DashboardSnapshot`.
