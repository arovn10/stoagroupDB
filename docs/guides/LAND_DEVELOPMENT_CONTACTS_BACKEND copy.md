# Land Development Contacts – Backend Guide

This guide describes the API and data model for **Land Development Contacts**: the same individuals as in **core.contacts**, listed with whatever info core has, with the option to add land-development–specific attributes (Type, Office Address, Date of Contact, Follow-up, etc.) or to create entirely new contacts that are written to core.contacts and then enhanced with land-dev attributes.

---

## 1. Overview

- **Individuals = core.contacts.** The contact list is **core.contacts**: all individuals, with whatever fields core already stores (e.g. Name, Email, Phone).
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

(Exact column names can differ; the API response should expose a consistent shape, e.g. Name, Email, PhoneNumber.)

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

### 3.1 List contacts (individuals from core + land-dev attributes)

**GET** `/api/land-development/contacts`

Returns **all individuals from core.contacts**, left-joined with the land-dev extension so each item has core fields plus land-dev fields when present.

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
  1. Create a row in **core.contacts** with only the fields core accepts (e.g. Name, Email, Phone / PhoneNumber).  
  2. Create a row in the **land-dev extension** with the new core ContactId and the land-dev fields (OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays).  
- **Type** should be one of: `Land Owner`, `Developer`, `Broker`.

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
| Individuals       | From **core.contacts**; list shows everyone with whatever info core has. |
| Land-dev details  | Stored in an **extension table** linked by **ContactId** (FK to core.contacts): Type, OfficeAddress, Notes, City, State, DateOfContact, FollowUpTimeframeDays. |
| List/Get          | Return merged shape (core + extension); use **ContactId** as id; include NextFollowUpDate and UpcomingFollowUp. |
| Create            | Insert into **core.contacts** (core fields only), then insert extension row; return merged with **ContactId**. |
| Update            | Update core.contacts and/or extension row by **ContactId**. |
| Delete            | Remove extension row only (keep core contact). |
| Send reminder     | Use **contactId** = core ContactId (or email for one-off). |

This keeps a single source of truth for individuals in core.contacts and adds land-development–specific detail without duplicating core data.

---

## 6. Backend implementation notes (this repo)

- **core.contacts** in this guide is implemented as **core.Person**. **ContactId** in the API is **core.Person.PersonId**.
- Core fields are mapped as: Name ← FullName, Email ← Email, PhoneNumber ← Phone.
- The extension table is **pipeline.LandDevelopmentContactExtension** (ContactId PK/FK → core.Person.PersonId). Schema: `schema/add_land_development_contact_extension.sql`. The legacy standalone table **pipeline.LandDevelopmentContact** is dropped by that script if it exists.
- List: `core.Person` LEFT JOIN `pipeline.LandDevelopmentContactExtension`; create: insert Person then extension; update: both (upsert extension); delete: extension row only. Send-reminder resolves email from Person by ContactId (PersonId).
