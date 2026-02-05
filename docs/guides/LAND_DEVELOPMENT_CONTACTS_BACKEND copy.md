# Land Development Contacts – Backend Guide

This guide describes the API and data model for **Land Development Contacts**: the same individuals as in **core.contacts**, listed with whatever info core has, with the option to add land-development–specific attributes (Type, Office Address, Date of Contact, Follow-up, etc.) or to create entirely new contacts that are written to core.contacts and then enhanced with land-dev attributes.

**Only individuals (people) are shown here—not entities (companies, organizations).** The backend must filter so that list/get and create/update apply only to individual contacts, never to entity contacts.

---

## 1. Overview

- **Individuals only.** The contact list is **core.contacts** restricted to **individuals** (people), not entities. Whatever core uses to distinguish individuals from entities (e.g. `ContactType = 'Individual'`, `IsEntity = 0`, or a separate individuals table)—use that so this API **only** returns and operates on individuals.
- **Land dev adds detail.** Land development tracks extra attributes per contact: Type (Land Owner, Developer, Broker), Office Address, Notes, City, State, Date of Contact, Follow-up Timeframe (days), and follow-up reminders. These are stored in a **land-dev extension** linked to core.contacts.
- **Land dev adds detail.** Land development tracks extra attributes per contact: Type (Land Owner, Developer, Broker), Office Address, Notes, City, State, Date of Contact, Follow-up Timeframe (days), and follow-up reminders. These are stored in a **land-dev extension** linked to core.contacts.
- **Two flows:**
  - **Edit / add land-dev info for an existing contact:** User picks someone from the list (from core) and adds or edits the land-dev–only fields. Backend creates or updates the extension row for that core contact.
  - **Create a new contact:** User creates a contact in Land Dev; backend creates the individual in **core.contacts** with only the fields core accepts (e.g. Name, Email, Phone), then creates the land-dev extension row with the rest. So new contacts are “sent up” to core with just core info; land-dev holds the extra attributes.

The API returns a **single merged shape** per contact (core fields + land-dev fields) so the frontend can list everyone and show land-dev details when present.

---

## 2. Data Model

### core.contacts (existing)

Use your existing core.contacts schema. At minimum it should have something like:

| Column   | Type   | Notes          |
|----------|--------|----------------|
| Id       | PK     | ContactId in APIs below |
| Name     | string | Required       |
| Email    | string | Optional       |
| Phone    | string | Optional       |
| …        | …      | Any other core columns |

You must be able to distinguish **individuals** from **entities** (e.g. `ContactType = 'Individual'` vs `'Entity'`, or `IsEntity` flag, or a scope/table for people only). **Land Development Contacts list and all endpoints must operate only on individuals**—exclude entities from list/get and ensure create only creates individuals.

### Land-development extension (linked to core.contacts)

One row per contact that has land-dev attributes. All land-dev–only fields live here.

| Column                   | Type        | Required | Notes |
|--------------------------|-------------|----------|--------|
| Id                       | PK, integer | Yes      | Optional; for extension row identity |
| ContactId                | int, FK     | Yes      | FK to core.contacts.Id (the individual) |
| OfficeAddress            | string      | No       | |
| Type                     | string      | No       | One of: `Land Owner`, `Developer`, `Broker` |
| Notes                    | string/text | No       | |
| City                     | string      | No       | |
| State                    | string      | No       | e.g. 2-letter |
| DateOfContact            | date        | No       | When they were first contacted |
| FollowUpTimeframeDays    | int         | No       | e.g. 180 for “follow up in 6 months” |
| CreatedAt                | datetime    | No       | |
| ModifiedAt               | datetime    | No       | |

**Computed (recommended to return in API):**

- **NextFollowUpDate** = `DateOfContact + FollowUpTimeframeDays` (null if either is null).
- **UpcomingFollowUp** = true when `NextFollowUpDate` is within the next N days (e.g. 14).

**List/Get response shape (merged):** Each item is the **individual** (core contact) with land-dev fields attached when present. Use **ContactId** (core.contacts.Id) as the primary id for all endpoints.

Example merged item:

- **ContactId** (required) – core.contacts.Id; use this in URLs and for send-reminder.
- **Name, Email, PhoneNumber** – from core.contacts (map your core column names as needed).
- **OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays** – from land-dev extension (null if no extension row).
- **NextFollowUpDate, UpcomingFollowUp** – computed as above.

---

## 3. API Endpoints

Base path suggestion: `/api/land-development/contacts` (or `/api/pipeline/land-development-contacts`).

All responses: `{ success: true, data: ... }` or `{ success: false, error: { message: "..." } }`.  
Use **ContactId** (core.contacts.Id) as the **id** in list items and in URL path parameters below.

### 3.1 List contacts (individuals only, from core + land-dev attributes)

**GET** `/api/land-development/contacts`

**Must return all individuals from core.contacts** so the Contacts view populates with everyone. Use a **LEFT JOIN** from core.contacts (individuals only) to the land-dev extension: every individual appears in the list. Those with no land-dev row have core fields (Name, Email, PhoneNumber) and null/empty for land-dev fields (OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays). Do **not** return only contacts that have a land-dev record—that would leave the list empty until someone adds land-dev info. Exclude entities (companies/organizations) only; include every individual.

**Query parameters (all optional):**

| Parameter     | Type    | Notes |
|---------------|---------|--------|
| type          | string  | Filter by Type: `Land Owner`, `Developer`, `Broker` (only contacts that have land-dev type) |
| city          | string  | Filter by City (partial match) |
| state         | string  | Filter by State (e.g. `LA`, `TX`) |
| upcomingOnly  | boolean | If true, return only contacts where NextFollowUpDate is within the next N days (e.g. 14) |
| q             | string  | Search in Name, Email, Notes |

**Response:**  
`{ success: true, data: [ { ContactId, Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays, NextFollowUpDate, UpcomingFollowUp, CreatedAt, ModifiedAt }, ... ] }`

- **ContactId** = core.contacts.Id (use this for get/update/delete/send-reminder).
- Include **NextFollowUpDate** and **UpcomingFollowUp** when possible.

---

### 3.2 Get one contact

**GET** `/api/land-development/contacts/:id`

**id** = ContactId (core.contacts.Id). Return that core contact merged with its land-dev extension row (if any).

**Response:**  
`{ success: true, data: { ContactId, Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays, NextFollowUpDate, UpcomingFollowUp, CreatedAt, ModifiedAt } }`  
**Errors:** 404 if core contact not found.

---

### 3.3 Create contact (new individual in core + land-dev attributes)

**POST** `/api/land-development/contacts`

**Body:**  
`{ "Name": "Jane Smith", "Email": "jane@example.com", "PhoneNumber": "555-1234", "OfficeAddress": "123 Main St", "Type": "Broker", "Notes": "...", "City": "Baton Rouge", "State": "LA", "DateOfContact": "2025-01-15", "FollowUpTimeframeDays": 180 }`

- **Name** required (for core); all others optional.
- **Backend:**  
  1. Create a row in **core.contacts** with only the fields core accepts (e.g. Name, Email, Phone / PhoneNumber), and ensure the new contact is stored as an **individual** (not an entity)—e.g. set `ContactType = 'Individual'` or equivalent.  
  2. Create a row in the **land-dev extension** with the new core ContactId and the land-dev fields (OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays).  
- **Type** (land-dev) should be one of: `Land Owner`, `Developer`, `Broker`.

**Response:**  
`{ success: true, data: { ContactId, Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays, NextFollowUpDate, UpcomingFollowUp, ... } }` (merged shape; **ContactId** = new core.contacts.Id).

---

### 3.4 Update contact (core and/or land-dev attributes)

**PUT** `/api/land-development/contacts/:id`

**id** = ContactId (core.contacts.Id).  
**Body:** Same fields as create; only send fields to update.  
- Update **core.contacts** for core fields (Name, Email, PhoneNumber).  
- Create or update the **land-dev extension** row for this ContactId with land-dev fields (OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays).

**Response:**  
`{ success: true, data: { ... } }` (merged shape).  
**Errors:** 404 if core contact not found.

---

### 3.5 Delete (remove land-dev attributes only; keep core contact)

**DELETE** `/api/land-development/contacts/:id`

**id** = ContactId.  
**Recommended behavior:** Delete only the **land-dev extension** row for this contact. The individual remains in core.contacts so they still appear in the list with core info only, and land-dev attributes can be re-added later.  
(If you need to delete the core contact as well, that can be a separate endpoint or an optional query flag.)

**Response:**  
`{ success: true, message: "Land development attributes removed" }`  
**Errors:** 404 if contact not found.

---

### 3.6 Send follow-up reminder email

**POST** `/api/land-development/contacts/send-reminder`

**Body:**  
`{ "contactId": 5 }` (core ContactId)  
or one-off:  
`{ "email": "someone@example.com", "message": "Optional custom message" }`  
or both:  
`{ "contactId": 5, "message": "Optional custom message" }`

- If **contactId** is provided, look up the **core contact** and send the reminder to that contact’s Email (and optionally include Name/context).
- If **email** is provided (and no contactId or contact has no email), send to that address.
- **message** is optional; include in the reminder body.
- Send the actual email via your mailer; use the same auth as the rest of the app (e.g. JWT).

**Response:**  
`{ success: true, message: "Reminder sent" }`  
**Errors:** 400 if neither contactId nor email provided, or contact not found; 500 on send failure.

**Frontend behavior:** The UI lets users search contacts, select one or multiple contacts, and/or enter one ad-hoc email. The frontend currently sends **one request per recipient** (repeated calls to this endpoint with `contactId` or `email` + optional `message`). No backend change is required for multi-select.

---

#### Optional: Batch send-reminder (same endpoint)

If you want to reduce round-trips, you may accept a **batch** body and send to all recipients in one request:

**Body (alternative):**  
`{ "contactIds": [5, 12, 3], "email": "other@example.com", "message": "Optional custom message" }`

- **contactIds** – array of core ContactIds; send one reminder per contact (to each contact’s Email).
- **email** – optional; one ad-hoc recipient not in the list.
- **message** – optional; same message for all.

**Response (batch):**  
`{ success: true, sent: 4, failed: [] }`  
or partial failure:  
`{ success: true, sent: 3, failed: [ { contactId: 12, error: "No email on file" } ] }`

If you implement batch, the api-client can expose e.g. `sendLandDevelopmentContactReminder(payload)` where `payload.contactIds` (array) is supported in addition to `payload.contactId` (single). The frontend can be updated to use batch when available.

---

### Email setup (for send-reminder)

For **POST send-reminder** to actually send emails, the backend must be configured with a mailer.

- **Render:** If the backend is deployed on Render, set these in the service **Environment** (Encrypted env vars for secrets):
  - `SMTP_HOST` – mail server hostname
  - `SMTP_PORT` – e.g. 587 (TLS) or 465 (SSL)
  - `SMTP_USER` – auth username
  - `SMTP_PASSWORD` – use an **Encrypted** env var for the password
  - `MAIL_FROM` – sender address (e.g. `noreply@yourdomain.com`)
- **Security:** Use TLS for SMTP (port 587 or 465). Never put credentials in the frontend or in repo. Require the same auth (e.g. JWT) for the send-reminder endpoint so only authenticated users can trigger emails.

If your app already has email (e.g. for notifications), reuse that mailer for send-reminder.

---

### Email templates (reminder & notifications)

Build HTML email templates so reminder and notification emails match the app’s look and stay secure.

- **Styled like app notifications:** Use the same visual language as the dashboard (e.g. STOA primary green `#7e8a6b`, white background, clear typography). Use **inline CSS** in the HTML email (many clients strip `<style>` blocks). Example structure:
  - Outer table or div with max-width ~600px, background `#ffffff`, border-radius 8px, border or shadow.
  - Header: logo or app name, background `#7e8a6b` (primary green), white text, padding.
  - Body: font family sans-serif, font-size 14–16px, color `#1f2937` (text primary), line-height 1.5.
  - Button/CTA: background `#7e8a6b`, color white, padding 10px 16px, border-radius 4px.
  - Footer: smaller text, color `#6b7280` (secondary).
- **Encrypted and secure:**
  - Send over **TLS** (SMTP over TLS); do not send credentials or tokens in the email body.
  - Do not include sensitive data (passwords, full tokens) in templates; use links with short-lived tokens if needed.
  - Sanitize any user-provided or contact data (e.g. `message`) before inserting into HTML to avoid injection.
- **Example reminder subject/body:** Subject like “Follow-up reminder: [Contact Name]”. Body: “You asked to follow up with [Name]. [Optional custom message].” Use the template wrapper above so it matches the app’s notification styling.

Store templates as server-side files or strings (e.g. Handlebars/Mustache with safe escaping); do not load templates from the client.

**Example HTML reminder (inline CSS, STOA styling):**

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:#7e8a6b;color:#ffffff;padding:16px 20px;font-size:18px;font-weight:600;">Deal Pipeline – Follow-up reminder</div>
    <div style="padding:20px;color:#1f2937;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 12px;">You asked to follow up with <strong>{{contactName}}</strong>.</p>
      {{#if message}}<p style="margin:0;color:#6b7280;">{{message}}</p>{{/if}}
    </div>
    <div style="padding:12px 20px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">Land Development · STOA Group</div>
  </div>
</body>
</html>
```

Replace `{{contactName}}` and `{{message}}` with escaped values. Use TLS for delivery; keep SMTP credentials in Render env (encrypted).

---

## 4. Frontend Usage (for API client)

- **List:** GET with optional `type`, `city`, `state`, `upcomingOnly`, `q`. Each item has **ContactId** (core id) and merged core + land-dev fields.
- **Create:** POST with core + land-dev fields; backend creates in core.contacts then in land-dev extension; response includes **ContactId**.
- **Get/Update/Delete/Send-reminder:** Use **ContactId** (core.contacts.Id) as the id in the URL.
- Frontend uses **ContactId** for all subsequent calls (get, update, delete, send-reminder). It can still support **LandDevelopmentContactId** in responses for backward compatibility, but the primary identifier is **ContactId**.

---

## 5. Summary

| Area              | Action |
|-------------------|--------|
| Individuals only | From **core.contacts**; list and all operations are **only for individuals** (people). **Exclude entities** (companies/organizations) from list/get; create only as individual. |
| **List = all individuals** | List endpoint must return **every** individual in core.contacts (LEFT JOIN extension). Do not return only contacts that have a land-dev row—the UI must populate with all individuals. |
| Land-dev details  | Stored in an **extension table** linked by **ContactId** (FK to core.contacts): Type, OfficeAddress, Notes, City, State, DateOfContact, FollowUpTimeframeDays. |
| List/Get          | Return merged shape (core + extension); use **ContactId** as id; include NextFollowUpDate and UpcomingFollowUp. |
| Create            | Insert into **core.contacts** (core fields only), then insert extension row; return merged with **ContactId**. |
| Update            | Update core.contacts and/or extension row by **ContactId**. |
| Delete            | Remove extension row only (keep core contact). |
| Send reminder     | Use **contactId** = core ContactId (or email for one-off). |

This keeps a single source of truth for individuals in core.contacts and adds land-development–specific detail without duplicating core data.

---

## 6. Backend implementation notes (this repo)

- **core.contacts** = **core.Person**; **ContactId** = **PersonId**. Individuals only (Person table holds only people).
- **Extension:** **pipeline.LandDevelopmentContactExtension** (ContactId FK → core.Person). Schema: `schema/add_land_development_contact_extension.sql`.
- **List/Get/Create/Update/Delete:** As in §3. Delete removes extension row only; response `"Land development attributes removed"`.
- **Send reminder:** Same endpoint for single and batch. Single: `{ contactId?, email?, message? }` → `{ success: true, message: "Reminder sent" }`. Batch: `{ contactIds: number[], email?, message? }` → `{ success: true, sent: number, failed: [{ contactId?, email?, error }] }`. STOA-styled HTML (inline CSS, escaped). SMTP: same env as land-dev (SMTP_HOST, MAIL_FROM, SMTP_PASS or SMTP_PASSWORD).
