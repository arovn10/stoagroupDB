# Asana Upcoming Tasks – Backend Guide

This guide describes the API for **Asana tasks with due dates**, matched to deals by **project name**. The frontend uses this in the **Upcoming Dates** view so users can see both deal dates and Asana task due dates in one list (view-only; links open Asana).

---

## 1. Overview

- **Purpose:** Return Asana tasks grouped by project so the frontend can:
  - Match Asana **project name** to deal **name** (e.g. "Settlers Trace" ↔ "The Waters at Settlers Trace").
  - Merge these tasks with deal-based upcoming dates and show them in Upcoming Dates.
  - Show an "Open in Asana" link (task permalink) for each task row.
  - In deal detail, compare **database start date** to the task’s **Asana custom field "Start Date"** (not the task’s due date).
- **View-only (read):** Read-only Asana API for listing; remedy endpoints may update the task’s custom Start Date or the database.
- **Matching:** Backend returns project name with each task; frontend does name matching to deals (normalize, trim, optional contains logic).
- **Start date vs due date:** The app treats "Asana start date" as the task’s **custom field "Start Date"** only. The task’s **due date** (`due_on`) must not be used as the start date. If the custom Start Date is empty, the app shows "Asana has no start date" and offers to fill it, even when the task has a due date.

---

## 2. Asana API Usage (Backend)

The backend must call Asana with a **Personal Access Token (PAT)** or OAuth token (server-side only; never expose in frontend).

1. **Workspace:** Use a configured workspace GID (e.g. from env `ASANA_WORKSPACE_GID`), or allow the client to pass `workspace` as a query param.
2. **List projects in workspace:**  
   `GET https://app.asana.com/api/1.0/workspaces/{workspace_gid}/projects`  
   Optional: `opt_fields=name,gid` to limit response size.
3. **Tasks per project:** For each project (or a subset to avoid rate limits), call:  
   `GET https://app.asana.com/api/1.0/projects/{project_gid}/tasks`  
   Query params:
   - `opt_fields=name,due_on,permalink_url,gid,custom_fields` (and fetch the custom field for "Start Date" — see Asana custom fields API).
   - **Include tasks with and without a custom Start Date.** The frontend uses only the **custom field "Start Date"** for "Asana start date"; it never uses `due_on` as start date. If that custom field is empty, the app shows "Asana has no start date" and offers to fill it (even when the task has a due date).
   - Optional: filter by `completed_since=now` to exclude completed. For "upcoming" filtering, filter in code by due or start as needed; still return all tasks so the deal-detail discrepancy flow can see them.
4. **Rate limits:** Asana allows 150 requests/minute; consider caching project list and task list for 1–5 minutes.

---

## 3. API Endpoint

**Suggested path:** `GET /api/asana/upcoming-tasks`

**Query parameters (all optional):**

| Param       | Type   | Description |
|------------|--------|-------------|
| workspace  | string | Asana workspace GID. If omitted, backend uses default from env. |
| daysAhead  | number | Include tasks with due_on in the next N days (default e.g. 90). |

**Response shape:**

```json
{
  "success": true,
  "data": [
    {
      "projectGid": "1234567890",
      "projectName": "Settlers Trace",
      "tasks": [
        {
          "gid": "9876543210",
          "name": "Submit permits",
          "due_on": "2025-03-15",
          "start_date": "2025-03-01",
          "permalink_url": "https://app.asana.com/0/123/9876543210"
        }
      ]
    }
  ]
}
```

- **projectName** is used by the frontend to match to deal name (e.g. deal "The Waters at Settlers Trace" ↔ project "Settlers Trace").
- **due_on:** YYYY-MM-DD string (Asana format), or **null** when the task has no due date. Used for display/filtering only; **not** used as "Asana start date" in the deal-detail comparison.
- **start_date:** YYYY-MM-DD string from the task’s **Asana custom field "Start Date"**, or **null** when that field is empty. The frontend uses **only** this for "Asana start date" (match vs discrepancy and "Override database date with Asana date"). If `start_date` is null, the app shows "Asana has no start date" and offers to fill from the database, regardless of `due_on`.
- **permalink_url:** So the frontend can show "Open in Asana" / "View deal in Asana" and open the task in a new tab.

If the backend cannot reach Asana (token missing, network error, rate limit), return:

```json
{
  "success": false,
  "error": { "message": "Asana unavailable" }
}
```

The frontend will then show only deal-based upcoming dates and will not break.

---

## 4. Environment (Backend)

- **ASANA_ACCESS_TOKEN** or **ASANA_PAT:** Required for Asana API calls (or OAuth: CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN).
- **ASANA_WORKSPACE_GID** (optional): Default workspace when the client does not send `workspace`.
- **ASANA_START_DATE_CUSTOM_FIELD_GID** (optional): When set, the remedy endpoint updates the task’s custom field "Start Date" to the given date instead of `due_on`. Required for "Asana start date" to reflect the custom field.

---

## 5. Frontend Usage

- **Upcoming Dates table:** Shows only internal (database) deal start dates. No Asana rows in the table.
- **Deal detail:** When a deal is opened, the frontend calls `API.getAsanaUpcomingTasks({ daysAhead: 365 })`, finds a task whose name matches the deal name (same matching logic as above), then uses **only** the task's **start_date** (custom field) for "Asana start date" — never `due_on`:
  - **If the task has no `start_date` (custom field empty):** Shows “Asana has no start date for this project” and offers “Fill start date in Asana with database date” (admin only), plus "View deal in Asana". This applies even when the task has a due date (e.g. “The Flats at Cahaba Valley”).
  - **If the task has `start_date` and it matches the database:** Shows “Database and Asana start dates match” and “View deal in Asana”.
  - **If the task has `start_date` and it differs from the database:** Shows the discrepancy and (admin only) override buttons plus “View deal in Asana”.

---

## 6. Remedy Endpoints (Admin Only)

When the deal detail shows a start-date discrepancy, admins can correct it. The frontend calls:

1. **Override Asana date with database date** (and **Fill start date in Asana with database date** when Asana has no start date)  
   - The frontend calls: `API.updateAsanaTaskDueDate(taskGid, dateStr)` where `dateStr` is `YYYY-MM-DD` (the database start date).  
   - Backend: Set the Asana task’s **custom field "Start Date"** to that date. Do **not** use this to set `due_on`; the app intent is to sync the **Start Date** custom field. (Use Asana API to update the task’s custom field for "Start Date".) If the backend currently only updates `due_on`, it should be extended to update the custom Start Date field instead (or in addition), so that "Asana start date" in the app reflects the custom field.

2. **Override database date with Asana date**  
   - The frontend uses the existing `API.updateDealPipeline(dealPipelineId, { StartDate: asanaDate })` where `asanaDate` is the task’s **start_date** (custom field) string (`YYYY-MM-DD`), not the task’s due date.  
   - Backend: update the deal pipeline record’s Start Date (existing update endpoint).
