# Deal Pipeline Attachments – Backend

Backend behavior and fixes for deal pipeline file attachments (list, upload, download, delete).

---

## Upload flow (is it being uploaded correctly?)

- **When the API has Azure env vars set** (e.g. on Render: `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER`):
  - Multer uses **memory storage** so the controller gets `file.buffer`.
  - The controller builds a path `deal-pipeline/{dealPipelineId}/{uuid-filename}` and calls `uploadBufferToBlob(storagePath, file.buffer)`.
  - After upload, the backend verifies the blob exists in Azure; only then does it insert the attachment row with that same `StoragePath`.
  - So **any attachment created by an upload to that API** has its file in Azure at that path.
- **When the API does not have Azure set** (e.g. local dev without env vars):
  - Multer uses **disk storage**; the file is saved under `api/uploads/` and the DB gets a relative path like `deal-pipeline/81/uuid-file.pdf`.
  - That file is **not** in Azure. If you later download from an API that *does* use Azure (e.g. Render), it will look in Azure for that path and get "blob does not exist".

**So:** Uploads to Render are correct and go to Azure. The 404 you see is for attachment rows that were created by an environment that never uploaded to Azure (e.g. attach script run against a local API without Azure). Fix: run the attach scripts with `API_BASE_URL` pointing at your Render API so uploads go through Render and into the same Azure container Render uses for downloads.

---

## Endpoints

| Action   | Method | Path |
|----------|--------|------|
| List     | GET    | `/api/pipeline/deal-pipeline/:id/attachments` |
| Upload   | POST   | `/api/pipeline/deal-pipeline/:id/attachments` (multipart `file`, max 200MB) |
| Download | GET    | `/api/pipeline/deal-pipeline/attachments/:attachmentId/download` |
| Delete   | DELETE | `/api/pipeline/deal-pipeline/attachments/:attachmentId` |

---

## "crypto is not defined" on View/Download

**Symptom:** When a client calls the download endpoint (View or Download a file), the server responds with an error that includes **"crypto is not defined"**.

**Cause:** The server is using Node’s `crypto` (e.g. for hashing or signing) somewhere in the request chain without loading it. In Node there is **no global `crypto`** like in the browser; the built-in must be loaded explicitly.

**Fix (backend):** Ensure the Node.js `crypto` module is loaded before any code that serves or signs file URLs runs.

1. **At app startup (recommended):** In your server entry point (e.g. `server.ts` or `app.js`), load crypto first:
   - **CommonJS:** `require('crypto');`
   - **ESM / TypeScript:** `import 'crypto';`
   That way crypto is available for the whole process (including dependencies like the Azure Blob SDK).

2. **In the download handler file:** In the file that handles `GET /api/pipeline/deal-pipeline/attachments/:id/download`, also load crypto at the top:
   - **CommonJS:** `const crypto = require('crypto');`
   - **ESM / TypeScript:** `import crypto from 'crypto';`

Use `crypto` only after it has been required/imported. Once that’s in place, View/Download should stop returning "crypto is not defined".

**In this repo:** The server entry point (`api/src/server.ts`) has `import 'crypto'` at the top so the module is loaded at startup. The pipeline controller also has `import crypto from 'crypto'` where the download route is implemented.

---

## "The specified blob does not exist" (Azure Blob)

**Symptom:** When downloading a file, the server or Azure returns an error like **"The specified blob does not exist"** (RequestId, Time, etc.).

**Cause:** The API is configured to use Azure Blob Storage (`AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER` are set), but the file was never uploaded to the container. Common cases:

- The attachment row was created when the API or attach scripts were using **local disk** only (no Azure env vars). The DB has a `StoragePath`, but the blob at that path was never uploaded.
- The attach scripts (`db:attach-carolinas-files`, `db:attach-gulf-coast-files`) were run **without** `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER`, so files went to `api/uploads/` and the DB has paths; the API on Render then looks in Azure and the blob is missing.

**Fix:** Re-run the attach scripts **with** Azure env vars set (same as the API), so files are uploaded to the blob container:

1. In your local `.env` (or shell), set `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER` to the same values as on Render.
2. From `api/`, run:
   - `npm run db:attach-carolinas-files`
   - `npm run db:attach-gulf-coast-files`
3. The scripts will upload files to Azure Blob; existing attachment rows keep the same `StoragePath`, so re-running will create the missing blobs (or you may need to clear attachment rows and re-run if your scripts skip already-attached deals—check script behavior).

After the blobs exist in the container, download will succeed.

**In this repo:** The Azure helper (`api/src/config/azureBlob.ts`) catches "blob does not exist" from the SDK and returns `null`, so the API returns a 404 with a message that says to re-run the attach script with `AZURE_STORAGE_*` set to repopulate blobs.

---

## Frontend behavior when the error occurs

When the server returns "crypto is not defined", the app can show that message plus a short note that it’s a **server-side** error and the backend must require/import the Node.js `crypto` module. The same hint can be used for both View and Download.
