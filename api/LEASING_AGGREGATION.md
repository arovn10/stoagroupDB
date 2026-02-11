# Leasing aggregation API (million-row scaling, calculations on backend)

**Principle:** Authoritative and heavy calculations run on the backend; the frontend is visual-only and does light UI math (formatting, immediate feedback) only.

## Million-row scaling

The Leasing Analytics Hub (and other clients) can pull pre-aggregated metrics from this API instead of loading millions of raw rows from Domo. That keeps the app fast and avoids browser memory limits.

## Endpoints

- **GET /api/leasing/aggregates/available** – Returns `{ success, available, source }`. When `available` is true, the app may call the aggregates endpoint.
- **GET /api/leasing/aggregates?asOf=YYYY-MM-DD** – Returns `{ success, data: { leasingSummary?, tradeoutSummary?, pudSummary? }, _meta? }`.
- **GET /api/leasing/dashboard?asOf=YYYY-MM-DD** – **Preferred.** Returns one full pre-computed dashboard payload from the DB. When the app gets `dashboard.rows` with length > 0, it uses this and skips all Domo fetch and client-side build/calculate.
- **POST /api/leasing/sync** – Accepts Domo dataset payloads; stores in DB. Sync is allowed **once per calendar day per dataset**, or **once more the same day if the payload hash changed** (data changed in Domo). Body: `{ leasing?, MMRData?, unitbyunittradeout?, portfolioUnitDetails?, units?, unitmix?, pricing?, recentrents? }` (arrays of row objects).
- **GET /api/leasing/datasets/:dataset** – List all rows for a dataset (`leasing`, `mmrdata`, `unitbyunittradeout`, `portfoliounitdetails`, `units`, `unitmix`, `pricing`, `recentrents`).
- **GET /api/leasing/datasets/:dataset/:id** – Get one row by id.
- **POST /api/leasing/datasets/leasing** – Create one leasing row. **PUT /api/leasing/datasets/leasing/:id** and **DELETE /api/leasing/datasets/leasing/:id** for update/delete.

## Response shape (for implementers)

- **leasingSummary**: `Array<{ property, units, leasesNeeded, 7DayLeasingVelocity?, 28DayLeasingVelocity?, monthOf? }>` – one row per property (or per property+month). Match Leasing dataset alias column names.
- **tradeoutSummary**: Array of tradeout metrics by property/month (e.g. newLeases, renewalLeases, tradeoutPct). Shape can match what the app derives from tradeout dataset or from PUD.
- **pudSummary**: `{ lastBatchRun?, byProperty: { [property]: { lastReportDate, unitCount } } }` – for “last updated” and lightweight PUD metadata without sending full unit rows.

## Wiring the data source

1. Set **LEASING_AGGREGATION_SOURCE** in env (e.g. `domo`, `warehouse`) so `getAggregatesAvailable` returns `available: true`.
2. In `api/src/controllers/leasingController.ts`, implement the aggregation logic in `getAggregates`:
   - Option A: Call Domo’s API from the server (server-side `domo.get` or equivalent) with high limits, then aggregate in Node and return the small payload.
   - Option B: Read from a data warehouse or ETL output (e.g. pre-aggregated tables) and return that.
3. Return the same response shape as in the controller so the Leasing app can consume it when `window.__LV_AGGREGATION_API__` is set to this API’s base URL.

## Leasing app configuration

In the app (e.g. before load or in Domo app config), set:

- `window.__LV_AGGREGATION_API__ = 'https://your-api-host.com'`  
  so the app calls `GET /api/leasing/aggregates/available` and `GET /api/leasing/aggregates`.  
  When the API returns non-empty `leasingSummary` or `tradeoutSummary`, the app sets `window.__LV_USE_AGGREGATES__`.  
  Future app versions can branch on that to skip or reduce raw Domo pulls.

## See also

- `api/src/controllers/leasingController.ts` – stub implementation and response contract.
- Leasing Analytics Hub README – “Million-row scaling and backend aggregation”.
