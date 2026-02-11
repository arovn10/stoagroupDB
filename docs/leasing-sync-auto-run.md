# Auto-run Domo → Backend Leasing Sync

Sync can run automatically in two ways: **on a schedule** or **when Domo data is updated** (triggered by Domo).

**Check-then-sync (recommended for cron):** To avoid pulling large data when nothing changed, use the **sync-check** endpoint first. Every 15 minutes: call `GET /api/leasing/sync-check`; if the response has `"changes": false`, exit immediately; if `"changes": true`, then call `POST /api/leasing/sync-from-domo` to update. The API compares Domo dataset metadata (row count) to the last sync; if they match, no full sync is needed.

---

## Option 1: Run on a schedule (recommended)

Run the sync at a fixed interval (e.g. every hour). No Domo configuration required.

### A. Render Cron Job

1. In Render, create a **Background Worker** or **Cron Job** for the same repo.
2. **Build command:** same as API (e.g. `cd api && npm install && npm run build`).
3. **Start command:**  
   `cd api && node -e "require('dotenv').config({path:process.env.ENV_FILE_PATH||'.env'}); fetch(process.env.API_BASE_URL+'/api/leasing/sync-from-domo',{method:'POST',headers:{'Content-Type':'application/json','X-Sync-Secret':process.env.LEASING_SYNC_WEBHOOK_SECRET||''}}).then(r=>r.json()).then(console.log).catch(console.error)"`  
   Or use a small script that `curl`s the endpoint (see below).
4. **Schedule:** e.g. `0 * * * *` (every hour) in Render’s cron UI.
5. Set the same env vars as the API (including `API_BASE_URL`, `DOMO_*`, `LEASING_SYNC_WEBHOOK_SECRET` if you use it). For cron, `API_BASE_URL` should be the **public URL of your API** (e.g. `https://your-api.onrender.com`).

**Simpler:** use a one-line cron that calls your API (so the API does the Domo fetch):

- **Start command:**  
  `curl -X POST "${API_BASE_URL}/api/leasing/sync-from-domo" -H "X-Sync-Secret: ${LEASING_SYNC_WEBHOOK_SECRET}"`
- Run that on a schedule. Your API must have `DOMO_CLIENT_ID`, `DOMO_CLIENT_SECRET`, and all `DOMO_DATASET_*` env vars set.

### B. GitHub Actions

Add a workflow that runs on a schedule and calls the sync endpoint:

```yaml
# .github/workflows/leasing-sync.yml
name: Leasing sync from Domo
on:
  schedule:
    - cron: '0 * * * *'   # every hour
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger sync
        run: |
          curl -sS -X POST "${{ secrets.API_BASE_URL }}/api/leasing/sync-from-domo" \
            -H "X-Sync-Secret: ${{ secrets.LEASING_SYNC_WEBHOOK_SECRET }}" \
            -H "Content-Type: application/json"
```

In the repo **Settings → Secrets and variables → Actions**, add:

- `API_BASE_URL` = your API URL (e.g. `https://your-api.onrender.com`)
- `LEASING_SYNC_WEBHOOK_SECRET` = same value as `LEASING_SYNC_WEBHOOK_SECRET` on the API (optional but recommended)

### C. Every 15 minutes: check then sync (RealPage / Domo data)

Use the **sync-check** endpoint so the job exits immediately when there are no changes; only when Domo data has changed does it run the full sync.

**Script (recommended):** From the repo root, with `API_BASE_URL` and optionally `LEASING_SYNC_WEBHOOK_SECRET` in `.env` or the environment:

```bash
chmod +x scripts/cron-leasing-sync.sh
./scripts/cron-leasing-sync.sh
```

**Crontab (every 15 min):**

```bash
# crontab -e
*/15 * * * * /path/to/stoagroupDB/scripts/cron-leasing-sync.sh
```

The script calls `GET /api/leasing/sync-check` first; if the response does not contain `"changes": true`, it exits without calling the sync. If changes are detected (Domo row count differs from last sync, or a dataset has never been synced), it then calls `POST /api/leasing/sync-from-domo` to update the backend.

**Note:** Sync-check uses Domo’s dataset metadata (GET /v1/datasets/{id}) to compare row count to the last sync. If your Domo API does not return a row count in metadata, the check may always report no changes after the first sync. In that case, run `POST /api/leasing/sync-from-domo` on a schedule instead; the backend still skips writing when the data hash is unchanged.

**Alternative: call sync every time (no check):**

```bash
0 * * * * curl -sS -X POST "https://YOUR_API_URL/api/leasing/sync-from-domo" -H "X-Sync-Secret: YOUR_SECRET"
```

Or run the Python script on a schedule (script pulls from Domo and POSTs to `/api/leasing/sync`):

```bash
0 * * * * cd /path/to/stoagroupDB && .venv/bin/python scripts/domo-to-backend-sync.py
```

---

## Option 2: Run when Domo data is updated (Domo-triggered)

Have Domo call your API whenever a dataset (or a key dataset) is updated.

### 1. Protect the endpoint (recommended)

Set on the API (e.g. in Render env):

- `LEASING_SYNC_WEBHOOK_SECRET` = a long random string (e.g. from `openssl rand -hex 24`).

Requests must send that value in the **X-Sync-Secret** header (or in JSON body as `secret`). If the header/body doesn’t match, the API returns 401.

### 2. Trigger from Domo

**Option A – Dataset Alert (webhook when data changes)**

1. In Domo, open a **dataset** that drives the others (e.g. “Leasing” or “Portfolio Unit Details”).
2. **Alerts → New Alert**.
3. Trigger: e.g. “Data is updated” or “Any row is added”.
4. Action: **Webhook** (or “Send to URL”).
5. URL: `https://YOUR_API_URL/api/leasing/sync-from-domo`
6. Method: **POST**.
7. Headers:  
   - `Content-Type: application/json`  
   - `X-Sync-Secret: YOUR_LEASING_SYNC_WEBHOOK_SECRET`

Note: The alert fires when *that* dataset updates. The API then fetches **all** configured leasing datasets (via `DOMO_DATASET_*`) and syncs them. So one alert is enough; you don’t need an alert per dataset.

**Option B – Workflow**

If your Domo plan supports Workflows, create a workflow that runs when a dataset is updated and its first step is “Call URL” to:

`POST https://YOUR_API_URL/api/leasing/sync-from-domo`  
with the same `X-Sync-Secret` header.

### 3. API environment

The API must have:

- `DOMO_CLIENT_ID`
- `DOMO_CLIENT_SECRET`
- `DOMO_DATASET_LEASING`, `DOMO_DATASET_PUD`, etc. (all dataset IDs you want to sync)
- Optionally `LEASING_SYNC_WEBHOOK_SECRET` (if you use the secret)

Then whenever Domo calls the URL, the API will fetch from Domo and run the sync.

---

## Where to change request timeout (fix 15s / "request failed to complete in 15000ms")

The API needs enough time to accept and process large sync bodies (e.g. pricing ~24k rows, PUD ~224k rows). **Change the timeout on the host or reverse proxy**, not only in the client script:

1. **Render**  
   Dashboard → your **Web Service** → **Settings** → **Advanced** → set **Request timeout** (e.g. **300** seconds). Save and redeploy.

2. **Azure App Service**  
   Portal → your App Service → **Configuration** → **General settings** → **Request time-out** (e.g. **300**). Save.

3. **Other (nginx, load balancer)**  
   Increase the upstream read/request timeout (e.g. `proxy_read_timeout 300s`) for the API.

The Node server is also set to allow long-lived requests (see `api/src/server.ts`). If you still see 15s errors after increasing the host timeout, confirm no proxy in between is enforcing a lower limit.

---

## Troubleshooting

- **"Timeout: Request failed to complete in 15000ms"** (or similar) on **pricing** or **portfolioUnitDetails**: The script uses a 15‑minute client timeout; a **15s limit is usually from the host or reverse proxy**. Increase the **request timeout** as above (at least 300s) for `/api/leasing/sync` and `/api/leasing/sync-from-domo`.
- **413 "request entity too large"**: Increase the API body size limit (e.g. `JSON_BODY_LIMIT` / Express `express.json({ limit })`); the repo default is 300mb.
- **"skipped" for a dataset**: The backend skips when it already synced that dataset today with the same data hash. That’s expected; run again another day or after Domo data changes to sync.

---

## Summary

| Method | When it runs | Domo config | Where it runs |
|--------|----------------|------------|----------------|
| **Render / GitHub / cron** | On a schedule (e.g. hourly) | None | Scheduler calls API `/sync-from-domo` or runs Python script |
| **Domo Alert / Workflow** | When a dataset is updated | Alert or Workflow → webhook to your API | API (fetch from Domo + sync) |

Use **Option 1** for simple, predictable sync. Use **Option 2** if you want the backend to update soon after Domo data changes, without polling.
