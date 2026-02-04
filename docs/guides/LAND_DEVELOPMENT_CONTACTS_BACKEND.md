# Land Development Contacts – Backend Guide

This guide describes the API and data model for **Land Development Contacts**: a contact book for field use (e.g. driving around to look at land) with land-development–specific attributes, follow-up date tracking, and reminder emails.

---

## 1. Overview

- **Purpose:** Store and pull up contacts (Land Owner, Developer, Broker) with full details; track date of contact and follow-up timeframe; alert when follow-ups are due; send reminder emails (to a contact or to an ad-hoc email address).
- **Relationship to core:** You may have `core.contacts` already. Land development needs extra attributes (Type, Office Address, Date of Contact, Follow Up Timeframe, etc.). Options:
  - **Option A:** New table `LandDevelopmentContact` with all fields (and optional `ContactId` FK to `core.contacts` if you want to link).
  - **Option B:** Extend `core.contacts` with land-development columns and a “land dev” scope, or a separate `LandDevelopmentContact` that references `core.contacts` for Name/Email/Phone and adds the rest.

Either way, the API described below should return the same shape so the frontend works.

---

## 2. Data Model

### LandDevelopmentContact (table or view)

| Column                 | Type        | Required | Notes |
|------------------------|-------------|----------|--------|
| LandDevelopmentContactId | PK, integer | Yes      | Auto-increment |
| Name                   | string      | Yes      | Full name |
| Email                  | string      | No       | |
| PhoneNumber            | string      | No       | |
| OfficeAddress          | string      | No       | |
| Type                   | string      | No       | One of: `Land Owner`, `Developer`, `Broker` |
| Notes                  | string/text | No       | |
| City                   | string      | No       | |
| State                  | string      | No       | e.g. 2-letter |
| DateOfContact          | date        | No       | When they were first contacted |
| FollowUpTimeframeDays  | int         | No       | e.g. 180 for “follow up in 6 months” |
| CreatedAt              | datetime    | No       | |
| ModifiedAt             | datetime    | No       | |

**Computed (recommended to return in API):**

- **NextFollowUpDate** = `DateOfContact + FollowUpTimeframeDays` (null if either is null).
- **UpcomingFollowUp** = boolean or flag: true when `NextFollowUpDate` is within the next N days (e.g. 14). Backend can compute this for list responses so the frontend can show “due soon” alerts.

---

## 3. API Endpoints

Base path suggestion: `/api/land-development/contacts` (or `/api/pipeline/land-development-contacts`).

All responses: `{ success: true, data: ... }` or `{ success: false, error: { message: "..." } }`.

### 3.1 List contacts

**GET** `/api/land-development/contacts`

**Query parameters (all optional):**

| Parameter     | Type   | Notes |
|---------------|--------|--------|
| type          | string | Filter by Type: `Land Owner`, `Developer`, `Broker` |
| city          | string | Filter by City (partial match) |
| state         | string | Filter by State (e.g. `LA`, `TX`) |
| upcomingOnly  | boolean | If true, return only contacts where NextFollowUpDate is within the next N days (e.g. 14) |
| q             | string | Search in Name, Email, Notes (optional) |

**Response:**  
`{ success: true, data: [ { LandDevelopmentContactId, Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays, NextFollowUpDate, UpcomingFollowUp, CreatedAt, ModifiedAt }, ... ] }`

- Include **NextFollowUpDate** (computed) and **UpcomingFollowUp** (computed) in each item when possible.

---

### 3.2 Get one contact

**GET** `/api/land-development/contacts/:id`

**Response:**  
`{ success: true, data: { LandDevelopmentContactId, Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays, NextFollowUpDate, UpcomingFollowUp, CreatedAt, ModifiedAt } }`  
**Errors:** 404 if not found.

---

### 3.3 Create contact

**POST** `/api/land-development/contacts`

**Body:**  
`{ "Name": "Jane Smith", "Email": "jane@example.com", "PhoneNumber": "555-1234", "OfficeAddress": "123 Main St", "Type": "Broker", "Notes": "...", "City": "Baton Rouge", "State": "LA", "DateOfContact": "2025-01-15", "FollowUpTimeframeDays": 180 }`

- **Name** required; all others optional.
- **Type** should be one of: `Land Owner`, `Developer`, `Broker` (reject or normalize others if needed).

**Response:**  
`{ success: true, data: { LandDevelopmentContactId, Name, ... } }` (full created row with computed fields).

---

### 3.4 Update contact

**PUT** `/api/land-development/contacts/:id`

**Body:** Same fields as create; only send fields to update.

**Response:**  
`{ success: true, data: { ... } }`  
**Errors:** 404 if not found.

---

### 3.5 Delete contact

**DELETE** `/api/land-development/contacts/:id`

**Response:**  
`{ success: true, message: "Contact deleted" }`  
**Errors:** 404 if not found.

---

### 3.6 Send follow-up reminder email

**POST** `/api/land-development/contacts/send-reminder`

**Body:**  
`{ "contactId": 5 }`  
or for a one-off reminder to a non-contact:  
`{ "email": "someone@example.com", "message": "Optional custom message" }`  
or both (prefer contact’s email if contactId is set):  
`{ "contactId": 5, "message": "Optional custom message" }`

- If **contactId** is provided, look up the contact and send the reminder email to that contact’s Email (and optionally include their name/context in the email).
- If **email** is provided (and no contactId or contact has no email), send to that email address.
- **message** is optional; if provided, include it in the reminder body.
- Backend should send an actual email (e.g. “Reminder: follow up with [Name]” or “You asked to follow up with [email]”) using your mailer. Auth: require the same auth as the rest of the app (e.g. JWT).

**Response:**  
`{ success: true, message: "Reminder sent" }`  
**Errors:** 400 if neither contactId nor email provided, or contact not found; 500 on send failure.

---

## 4. Frontend Usage (for API client)

The frontend will:

- Call **GET list** with optional `type`, `city`, `state`, `upcomingOnly`, `q`.
- Use **NextFollowUpDate** and **UpcomingFollowUp** to show “Follow-up due soon” alerts and badges.
- **Create/Update** with the fields above; **Delete** by id.
- Call **POST send-reminder** with either `contactId` or `email` (and optional `message`) when the user clicks “Send reminder” for a contact or enters an ad-hoc email.

Ensure the API client can pass auth (e.g. `Authorization: Bearer <token>`) for all of these if your app uses auth.

---

## 5. Summary

| Area              | Action |
|-------------------|--------|
| Table / schema    | LandDevelopmentContact (or extend core.contacts) with Name, Email, PhoneNumber, OfficeAddress, Type, Notes, City, State, DateOfContact, FollowUpTimeframeDays |
| List/Get          | Return items with NextFollowUpDate and UpcomingFollowUp when possible |
| Create/Update/Delete | Standard CRUD; Type one of Land Owner, Developer, Broker |
| Send reminder     | POST send-reminder with contactId and/or email (and optional message); send email via your mailer |

All of this supports the “contact book on your phone” use case plus follow-up alerts and reminder emails (to a stored contact or to an arbitrary email).

---

## Backend implementation notes (done)

- **Table:** `pipeline.LandDevelopmentContact` created via `schema/add_land_development_contacts.sql`. Type constrained to `Land Owner`, `Developer`, `Broker`.
- **API base path:** `/api/land-development/contacts`. List supports query params: `type`, `city`, `state`, `upcomingOnly` (boolean), `q` (search Name, Email, Notes). All list/get responses include computed **NextFollowUpDate** (DateOfContact + FollowUpTimeframeDays) and **UpcomingFollowUp** (true when next follow-up is within 14 days).
- **Send reminder:** `POST /api/land-development/contacts/send-reminder` (auth required). Body: `contactId`, `email`, `message` (all optional but at least contactId or email required for a valid recipient). Uses nodemailer. For **Office 365 / Outlook**: set **SMTP_HOST**=outlook.office365.com, **SMTP_PORT**=587, **MAIL_FROM** and **SMTP_USER** to the sending address, **SMTP_PASS** to the mailbox or app password (e.g. in Render Environment). Returns 503 if email is not configured.
- **api-client:** `getAllLandDevelopmentContacts(params)`, `getLandDevelopmentContactById(id)`, `createLandDevelopmentContact(data)`, `updateLandDevelopmentContact(id, data)`, `deleteLandDevelopmentContact(id)`, `sendLandDevelopmentReminder(data)`.
