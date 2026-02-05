# Backend Request: Admin Presence (Who’s Viewing the Dashboard)

**Audience:** Backend agent / backend team  
**Feature:** Allow admins to see if Michael or another admin is currently viewing the banking dashboard. Only visible to admins.

---

## 1. Overview

The banking dashboard frontend needs two endpoints so that **admins** can see who else is currently viewing the dashboard (e.g. “Only you viewing” vs “Also viewing: Michael, Jane”).

- **POST** – report presence (heartbeat). Called periodically by the client while an admin has the dashboard open.
- **GET** – return the list of admins who have reported presence recently (e.g. in the last 2 minutes).

The frontend already implements heartbeat (every 45s) and polling (every 30s) using **fetch** to these endpoints. It does **not** use the shared API client for presence, so no changes to the API client are required. The frontend will work without these endpoints (it will show “Only you viewing” when the backend is not implemented or returns an error).

---

## 2. Endpoints to Implement

Base path: **`/api/banking/presence`**

- All requests should require the same authentication as other banking endpoints (e.g. JWT in `Authorization: Bearer <token>`).
- Only authenticated **admin** users should be allowed to POST or GET (optional: you may allow any authenticated user and let the frontend restrict the UI to admins).

---

### 2.1 POST `/api/banking/presence` (heartbeat)

**Purpose:** Record that the current user (admin) is viewing the dashboard.

**Request:**

- **Method:** `POST`
- **Headers:** `Content-Type: application/json`, `Authorization: Bearer <JWT>`
- **Body (JSON):**
  - `userId` (optional) – string or number; from auth or client.
  - `userName` (optional) – display name (e.g. “Michael”).
  - `email` (optional) – user email.
  - `timestamp` (optional) – ISO string; server can use this or ignore and use server time.

**Example body:**

```json
{
  "userId": 1,
  "userName": "Michael",
  "email": "michael@example.com",
  "timestamp": "2026-01-27T20:00:00.000Z"
}
```

**Backend behavior:**

- Validate JWT and (optionally) that the user is an admin.
- Store or update a “presence” record keyed by user (e.g. by `userId` or email from JWT), with a **last-seen timestamp**.
- Use a short TTL (e.g. 2–3 minutes): if a user has not sent a heartbeat within that window, consider them “not viewing.”
- **Response:** e.g. `200` with `{ "success": true }` or `204 No Content`. Frontend ignores the body.

---

### 2.2 GET `/api/banking/presence` (list who’s viewing)

**Purpose:** Return the list of admins who have reported presence recently (within the TTL window).

**Request:**

- **Method:** `GET`
- **Headers:** `Authorization: Bearer <JWT>`

**Response (JSON):**

- Include all users who have a recent heartbeat (within the TTL), including the current user if you like; the frontend filters out the current user for display.
- Suggested shape:

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "userId": 1,
        "userName": "Michael",
        "email": "michael@example.com",
        "lastSeen": "2026-01-27T20:01:00.000Z"
      },
      {
        "userId": 2,
        "userName": "Jane",
        "email": "jane@example.com",
        "lastSeen": "2026-01-27T20:00:45.000Z"
      }
    ]
  }
}
```

- `users`: array of objects with at least:
  - `userId` (or `id` / `user_id`) – so the frontend can exclude the current user.
  - `userName` (or `username` / `name`) – display name for “Also viewing: Michael, Jane”.
  - `email` (optional) – for deduplication.
  - `lastSeen` (optional) – ISO timestamp of last heartbeat.

If no one is viewing, return `users: []`.

---

## 3. Implementation notes (backend)

- **Storage:** In-memory (e.g. a map or cache keyed by user id) is enough; no need for a database table unless you want persistence across restarts.
- **TTL:** e.g. 2–3 minutes. After that, drop the user from the list so GET does not return them.
- **Auth:** Reuse existing JWT validation and (if applicable) admin check used for other banking routes.
- **CORS:** Same as existing banking API if the dashboard is on a different origin.

---

## 4. Frontend (already done)

- When an admin is logged in, the dashboard shows a small pill in the header: **“Only you viewing”** or **“Also viewing: Michael, Jane”**.
- The pill is only visible to admins.
- The frontend calls:
  - **POST** `/api/banking/presence` every 45 seconds (heartbeat).
  - **GET** `/api/banking/presence` every 30 seconds and updates the pill.
- No changes were made to the API client; all presence calls use **fetch** directly.

Once the backend implements these two endpoints, the “who’s viewing” feature will work end-to-end for admins.

---

## 5. Implementation status

- **Backend:** Implemented. In-memory store (Map keyed by userId), TTL 2 minutes. POST/GET `/api/banking/presence` (auth). Uses req.user from JWT; body may override userName, email.
- **api-client:** Optional `API.reportPresence(payload)` and `API.getPresence()` added; frontend may continue using fetch directly.
