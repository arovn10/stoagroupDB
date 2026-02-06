# Asana Writeback: Update Asana When Dashboard/Database Changes

Yes — you can update the associated Asana task when something is updated in the dashboard or database. This guide describes how it works and what you need to implement it.

---

## Current Setup

- **Import (Asana → DB):** `npm run db:import-asana-deal-pipeline` fetches tasks from the Asana Deal Pipeline project and creates/updates `core.Project` and `pipeline.DealPipeline`.
- **Link stored in DB:** `pipeline.DealPipeline` has **`AsanaTaskGid`** (and optionally **`AsanaProjectGid`**). When a deal is imported from Asana, this GID is set, so we know which Asana task corresponds to which deal.

So whenever a deal has **`AsanaTaskGid`** set, we can find the associated deal in Asana and update it.

---

## How Writeback Would Work

1. **Trigger:** A user (or process) updates a deal in the dashboard or via the API — e.g. they change **Stage**, **Bank**, **Unit Count**, **Start Date**, **Pre-Con Manager**, or other fields that exist in both the DB and Asana.
2. **Lookup:** Load the deal (e.g. from `pipeline.DealPipeline` by `ProjectId` or `DealPipelineId`). If **`AsanaTaskGid`** is null, skip writeback (no linked Asana task).
3. **Map fields:** Translate the updated DB fields into Asana’s format (see below).
4. **Call Asana:** `PUT https://app.asana.com/api/1.0/tasks/{task_gid}` with a JSON body containing only the fields you want to update (e.g. `name`, `notes`, `due_on`, **`custom_fields`**).
5. **Custom fields:** In the request body, custom fields are sent as **`custom_field_gid: value`** pairs. For **enum** fields (e.g. Stage), the value must be the **enum option GID**, not the display string (e.g. `"Closed"`). For **text** it’s a string; for **number** a number; for **date** an object like `{ "date": "YYYY-MM-DD" }`.

Reference: [Asana API – Update a task](https://developers.asana.com/reference/updatetask). The `asana-api-reference.js` file in `deal pipeline-FOR REFERENCE DO NOT EDIT/` already documents `tasks.update(taskGid, data)` for this.

---

## What You Need to Implement Writeback

### 1. Asana token and permissions

- Same **Personal Access Token** (or OAuth) used for import, with **write** access (e.g. `tasks:write`).
- Token in `.env`: `ASANA_ACCESS_TOKEN=...` (see ASANA_IMPORT_SETUP.md).

### 2. Custom field GIDs

- Each Asana custom field (Stage, Bank, Unit Count, Start Date, Location, Product Type, Pre-Con Manager, etc.) has a **custom field GID**.
- Each **enum** option (e.g. “Closed”, “Prospective”) has an **enum option GID**.
- You need a way to go from “update Stage to Closed” to “set custom_field_gid_xyz to enum_option_gid_abc”.

**Ways to get GIDs:**

- **Option A – One-time export:** Use the Asana API to fetch the Deal Pipeline project’s custom field settings and enum options, then store a small config (e.g. JSON or DB table) that maps:
  - custom field **name** → **custom_field_gid**
  - (custom_field_gid, option **name**) → **enum_option_gid**
- **Option B – At runtime:** When doing writeback, call:
  - `GET /projects/{project_gid}/custom_field_settings` (or the task’s custom_fields from `GET /tasks/{task_gid}`) to get custom field GIDs and enum option GIDs, then resolve “Stage” → “Closed” to the right enum option GID and send it in the update.

### 3. Where to run the writeback

- **Option A – API hook:** When the API updates a project or deal pipeline (e.g. PATCH/PUT that touches Stage, Bank, etc.), after saving to the DB, if the deal has `AsanaTaskGid`, call an internal “sync to Asana” helper that builds the `PUT /tasks/{task_gid}` payload and sends it.
- **Option B – Background/scheduled job:** A job that finds deals updated since last run (e.g. `UpdatedAt` or a “dirty” flag), and for each with `AsanaTaskGid` pushes the current DB values to Asana.
- **Option C – Explicit “Sync to Asana” button:** The dashboard has a button that calls an API endpoint which performs the same PUT to Asana for the current deal (no automatic trigger).

### 4. Field mapping (DB → Asana)

Use the same logical mapping as the import script, in reverse, for example:

| DB (Project / DealPipeline) | Asana custom field (name) | Asana type |
|-----------------------------|---------------------------|------------|
| Stage                       | Stage                     | enum       |
| Bank                        | Bank                      | text       |
| UnitCount / Units           | Unit Count                | number     |
| StartDate / EstimatedConstructionStartDate | Start Date | date  |
| Location (City, State)      | Location                  | text/enum  |
| ProductType                 | Product Type              | multi_enum |
| Pre-Con Manager (name)      | Pre-Con Manager           | people     |
| ConstructionLoanClosingDate | Construction Loan Closing | date       |
| Notes                       | task.notes                | n/a        |

Name and other task-level fields can be updated via `name`, `notes`, `due_on` on the task; the rest go into `custom_fields` with the correct GIDs and value formats.

---

## Minimal Implementation Sketch

1. **Config/cache:** Build a small mapping (e.g. from `GET /projects/{project_gid}/custom_field_settings` and enum options) from **field name** and **option name** to **custom_field_gid** and **enum_option_gid**.
2. **Helper (e.g. in API or a script):** `syncDealToAsana(dealPipelineId)` that:
   - Loads `pipeline.DealPipeline` (and linked `core.Project`) by id.
   - If `AsanaTaskGid` is null, return.
   - Builds a `data` object: `{ name?, notes?, due_on?, custom_fields: { [custom_field_gid]: value } }` using the mapping and current DB values.
   - Sends `PUT /tasks/{AsanaTaskGid}` with `data`.
3. **Trigger:** Call that helper from your update endpoint (Option A), from a cron job (Option B), or from a “Sync to Asana” endpoint (Option C).

---

## Summary

- **Yes:** When the dashboard/database updates a deal that has **`AsanaTaskGid`** set, you can find the associated deal in Asana and update that task (and its custom fields) via **`PUT /tasks/{task_gid}`**.
- **Requirements:** Token with write access, mapping from DB fields to Asana custom field GIDs and (for enums) enum option GIDs, and a place to run the writeback (API hook, job, or button).
- **Reference:** `deal pipeline-FOR REFERENCE DO NOT EDIT/asana-api-reference.js` documents the tasks and custom_fields endpoints; the import script in `api/scripts/import-asana-deal-pipeline.ts` shows the DB ↔ Asana field mapping in the import direction.

If you want to proceed, the next step is to add a small “Asana writeback” module (e.g. in the API or scripts) that implements the mapping and `PUT /tasks/{task_gid}` call, then wire it to your chosen trigger (hook, job, or button).
