# Run sync from Domo (fill Leasing, MMRData, UnitMix, Pricing, RecentRents)

The API can **pull** leasing datasets from Domo and write them to the DB. That’s **POST /api/leasing/sync-from-domo**. The API uses Domo’s API (with your credentials) to fetch each dataset, then writes in batches.

---

## 1. Set environment variables

The **API** (where sync-from-domo runs) must have these in `api/.env` or Render Environment:

**Required for Domo API access:**

- `DOMO_CLIENT_ID` — Domo API client ID  
- `DOMO_CLIENT_SECRET` — Domo API client secret  

**Dataset IDs (one per table you want to sync):**

| Env var | DB table |
|--------|----------|
| `DOMO_DATASET_LEASING` | leasing.Leasing |
| `DOMO_DATASET_MMR` | leasing.MMRData |
| `DOMO_DATASET_TRADEOUT` | leasing.UnitByUnitTradeout |
| `DOMO_DATASET_PUD` | leasing.PortfolioUnitDetails |
| `DOMO_DATASET_UNITS` | leasing.Units |
| `DOMO_DATASET_UNITMIX` | leasing.UnitMix |
| `DOMO_DATASET_PRICING` | leasing.Pricing |
| `DOMO_DATASET_RECENTRENTS` | leasing.RecentRents |

Set only the ones you use. If an env var is missing, that table is skipped.

**Optional:**

- `LEASING_SYNC_WEBHOOK_SECRET` — If set, requests must send header `X-Sync-Secret: <this value>`.

See `docs/env-leasing-sync-paste.txt` for a paste-ready template (replace placeholders).

---

## 2. Start the API

```bash
cd api && npm run build && npm start
```

(Or use your deployed API URL for step 3.)

---

## 3. Trigger the sync

**Option A – Script (from repo root):**

```bash
node scripts/run-leasing-sync-from-domo.js
```

Uses `API_BASE_URL` from `.env` (default `http://localhost:3000`). If `LEASING_SYNC_WEBHOOK_SECRET` is set, pass it:  
`LEASING_SYNC_SECRET=your_secret node scripts/run-leasing-sync-from-domo.js`

**Option B – curl (local API):**

```bash
curl -sS -X POST http://localhost:3000/api/leasing/sync-from-domo \
  -H "Content-Type: application/json" \
  -H "X-Sync-Secret: YOUR_SECRET"   # omit if LEASING_SYNC_WEBHOOK_SECRET is not set
```

**Option C – Sync only one table:**

```bash
curl -sS -X POST "http://localhost:3000/api/leasing/sync-from-domo?dataset=leasing" \
  -H "Content-Type: application/json" \
  -H "X-Sync-Secret: YOUR_SECRET"
```

Use `dataset=portfolioUnitDetails`, `dataset=mmrdata`, `unitmix`, `pricing`, `recentrents`, `units`, `unitbyunittradeout` for other tables.

**Option D – Force full sync (ignore “already synced today”):**

```bash
curl -sS -X POST "http://localhost:3000/api/leasing/sync-from-domo?force=true" \
  -H "Content-Type: application/json" \
  -H "X-Sync-Secret: YOUR_SECRET"
```

---

## 4. After sync

- Response lists `fetched`, `synced`, `skipped`, and any `errors`.
- The API **builds the dashboard snapshot at the end of sync** (so GET /api/leasing/dashboard serves from the new data). Snapshot is not built on deploy; cron (sync-from-domo) is the place it runs.
- Check row counts: `node scripts/leasing-db-inspect.js`

**Why fewer rows in the DB than in Domo?** Each leasing table has a **unique key**. Sync dedupes and upserts by that key, so you get **one row per key**. For example, `leasing.Leasing` uses **(Property, MonthOf)** — one row per property per month. If Domo sends 1101 rows but only 76 unique property+month combinations, the DB will have 76 rows. The log now shows both input count and rows written (e.g. `1101/1101 input → 76 rows written`).

---

## More

- **Check if Domo and DB differ (no write):** `GET /api/leasing/sync-check` — compares Domo dataset row count to current DB row count per table; returns `{ changes: true, details: [{ dataset, domoRows, dbRows, lastRows, hasChange }] }`. When `changes` is true, run sync-from-domo to add/update only (never delete).  
- **Wipe:** Sync never wipes automatically. To clear all leasing data you must call `POST /api/leasing/wipe` explicitly (same auth as sync). Use only when you need a full replace (e.g. repair); normal sync is upsert-only.  
- **Cron / Domo webhook:** see `docs/leasing-sync-auto-run.md`
