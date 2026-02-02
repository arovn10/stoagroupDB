# Backend Guide: Banking Files (Stoa Group Banking Dashboard)

This document describes what the **backend** must implement so the Banking Dashboard can support **Banking Files**: per-project file uploads that are **separate from Deal Pipeline attachments**.

- **Deal Pipeline files** = managed in the Deal Pipeline app (Land Development); keyed by `DealPipelineId`.
- **Banking Files** = managed in the Banking Dashboard; keyed by **Project ID** (same as `ProjectId` / `Row` in the banking context). Used for loan agreements, amendments, banking-only documents.

---

## 1. API Endpoints

Base path for banking files: **`/api/banking`**. All endpoints should require authentication (same as existing banking/project APIs).

### 1.1 List banking files for a project

- **Method:** `GET`
- **Path:** `/api/banking/projects/:projectId/files`
- **Path param:** `projectId` (number) = Project ID (ProjectId / Row).
- **Response (200):**
  ```json
  {
    "success": true,
    "data": [
      {
        "BankingFileId": 1,
        "ProjectId": 123,
        "FileName": "Loan_Agreement.pdf",
        "ContentType": "application/pdf",
        "FileSizeBytes": 1048576,
        "CreatedAt": "2025-01-15T14:30:00Z"
      }
    ]
  }
  ```
- **Errors:** 401 Unauthorized, 403 Forbidden, 404 if project not found (optional; can return empty array).

### 1.2 Upload a banking file

- **Method:** `POST`
- **Path:** `/api/banking/projects/:projectId/files`
- **Path param:** `projectId` (number).
- **Body:** `multipart/form-data` with a single file; field name must be **`file`**.
- **File size limit:** Recommend 200MB (same as Deal Pipeline attachments).
- **Response (200/201):**
  ```json
  {
    "success": true,
    "data": {
      "BankingFileId": 2,
      "ProjectId": 123,
      "FileName": "Amendment_1.pdf",
      "ContentType": "application/pdf",
      "FileSizeBytes": 512000,
      "CreatedAt": "2025-01-20T10:00:00Z"
    }
  }
  ```
- **Errors:** 400 (bad request / invalid file), 401, 403, 404 (project not found), 413 (payload too large).

### 1.3 Download a banking file

- **Method:** `GET`
- **Path:** `/api/banking/files/:attachmentId/download`
- **Path param:** `attachmentId` (number) = `BankingFileId`.
- **Response:** Stream the file body with appropriate `Content-Type` and `Content-Disposition: attachment; filename="..."` (or inline if preferred).
- **Auth:** Require same auth as other banking endpoints (e.g. Bearer token). If the front end uses a direct link, ensure the backend supports auth via query param or cookie if needed.
- **Errors:** 401, 403, 404 (file not found).

### 1.4 Delete a banking file

- **Method:** `DELETE`
- **Path:** `/api/banking/files/:attachmentId`
- **Path param:** `attachmentId` (number) = `BankingFileId`.
- **Response (200):**
  ```json
  {
    "success": true,
    "message": "File deleted"
  }
  ```
- **Side effect:** Remove the file record and the stored file (e.g. from disk or blob storage).
- **Errors:** 401, 403, 404.

---

## 2. Database (suggested)

Create a table **BankingFile** (or equivalent) separate from Deal Pipeline attachments:

| Column           | Type        | Notes                                      |
|------------------|-------------|--------------------------------------------|
| BankingFileId    | PK, int     | Identity / auto-increment                  |
| ProjectId        | int, FK     | References Project (same as banking Row)   |
| FileName         | nvarchar    | Original file name                         |
| ContentType      | nvarchar    | MIME type                                  |
| FileSizeBytes    | bigint      | File size                                  |
| StoragePath      | nvarchar    | Server path or blob key for file storage   |
| CreatedAt        | datetime2   | UTC                                        |
| CreatedByUserId  | int, nullable | Optional audit                            |

- **Unique constraint:** None required on (ProjectId, FileName) unless you want to prevent duplicate names per project.
- **Index:** `ProjectId` for fast list-by-project queries.
- **Cascade:** On delete of Project, optionally cascade delete BankingFile rows (or restrict and require cleanup in app).

---

## 3. File storage

- Store the actual file in a secure location (e.g. disk path or blob storage) and save the reference in `StoragePath`.
- Restrict access: only allow download when the user is authenticated and (if you enforce project-level access) has access to that project.
- Reuse the same pattern as Deal Pipeline attachments if you already have one (e.g. same blob container with a different prefix, or a separate folder per feature).

---

## 4. Front-end usage

- **List:** `API.listBankingFiles(projectId)` → GET `/api/banking/projects/:projectId/files`
- **Upload:** `API.uploadBankingFile(projectId, file)` → POST multipart to `/api/banking/projects/:projectId/files`
- **Download:** Link to `API.getBankingFileDownloadUrl(attachmentId)` → GET `/api/banking/files/:attachmentId/download` (browser must send auth if required; see note below).
- **Delete:** `API.deleteBankingFile(attachmentId)` → DELETE `/api/banking/files/:attachmentId`

If download is auth-protected and the front end opens the URL in a new tab, ensure cookies or a short-lived token are used so the browser can send auth. Alternatively, the front end can fetch the blob with `Authorization` and then create an object URL for download.

---

## 5. Summary checklist for backend

- [x] Implement `GET /api/banking/projects/:projectId/files` (list).
- [x] Implement `POST /api/banking/projects/:projectId/files` (upload, multipart, field name `file`).
- [x] Implement `GET /api/banking/files/:attachmentId/download` (stream file; set Content-Disposition).
- [x] Implement `DELETE /api/banking/files/:attachmentId` (delete record and file).
- [x] Add BankingFile table (or equivalent) and link to ProjectId.
- [x] Enforce authentication (and optionally authorization by project) on all four endpoints.
- [x] Decide auth strategy for download (Bearer token; front end fetches with Authorization and can use blob URL).

Once these are in place, the Banking Dashboard’s “Banking Files” tab will work without further front-end changes.
