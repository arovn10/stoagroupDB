# Backend Instructions: Domo SSO Endpoint

The Deal Pipeline dashboard can sign users in automatically when they're already logged into Domo, so they don't need a second login. To enable this, the backend must add a **Domo SSO** endpoint that accepts the current Domo user and returns the same JWT used for normal login.

---

## 1. Add the endpoint

| Property | Value |
|----------|--------|
| **Method** | `POST` |
| **Path** | `/api/auth/domo` |
| **Content-Type** | `application/json` |

---

## 2. Request body

The front end sends a JSON body with the user's email (required) and optionally name:

```json
{
  "email": "user@company.com",
  "name": "Jane Smith"
}
```

| Field   | Type   | Required | Description |
|---------|--------|----------|-------------|
| `email` | string | **Yes** | User email (used to look up `auth.[User]`). Domo users must be in the allowed list. |
| `name`  | string | No      | Display name from Domo profile, if available. |
| `userId` | string | No     | Domo user ID (from `domo.env.userId`). Ignored for lookup; can be sent for logging. |

**Recognized admin users (Deal Pipeline / Domo SSO):** `bbrinson@stoagroup.com`, `hspring@stoagroup.com`, `arovner@stoagroup.com`, `mmurray@stoagroup.com`, `jsnodgrass@stoagroup.com`, `twharton@stoagroup.com`. Ensure these exist in `auth.[User]` via `npm run db:seed-auth-users`.

---

## 3. Response format

**Success:** Return the **same shape** as your existing `POST /api/auth/login` response so the front end can store the token and user the same way.

```json
{
  "success": true,
  "data": {
    "token": "<JWT string>",
    "user": {
      "userId": 123,
      "username": "user@company.com",
      "email": "user@company.com",
      "fullName": "Jane Smith"
    }
  }
}
```

- `data.token` — JWT that you already use for `Authorization: Bearer <token>` (same as login).
- `data.user` — User object in the **exact** format as `/api/auth/login`: `userId`, `username`, `email`, `fullName` (backend uses `fullName`, not `name`). This lets the dashboard set `currentUser` and show the same UI as after a normal login.

**Failure:** Return your usual error shape, e.g.:

```json
{
  "success": false,
  "error": {
    "message": "User not authorized for Deal Pipeline"
  }
}
```

Use a normal error HTTP status (e.g. 401 or 403) so the front end can treat it as “Domo SSO failed” and fall back to the login form.

---

## 4. Backend logic (recommended)

1. **Identify the user**
   - Prefer **email** if present and you have users keyed by email (e.g. look up by `email`).
   - Otherwise use **userId** (Domo user ID) if you store or map Domo user IDs to your users.
   - If you don’t have the user (e.g. unknown email / unknown Domo ID), return 401/403 and `success: false`.

2. **Trust model**
   - The request comes from your front end running inside Domo; the front end gets `userId` (and optionally `email`/`name`) from Domo’s environment/API. There is no separate Domo token in the request.
   - So you are **trusting** that the caller is your app in Domo. To keep this safe:
     - Only accept this endpoint over HTTPS.
     - If your app is only ever loaded from Domo (e.g. Domo-hosted custom app), same-origin / Domo embedding already restricts who can call your API; you can treat “we’re in Domo” as established by your front end and trust the passed-in `userId`/`email` for that context.
   - Optional hardening (if you need it later): require a shared secret or signed payload from the front end and verify it on the backend before issuing a token.

3. **Issue the same JWT as login**
   - Once you’ve resolved the user (by email or Domo `userId`), create the **same JWT** you use for `/api/auth/login` (same claims, same secret, same expiry).
   - Return it in `data.token` and the user object in `data.user`, as in the success response above.

4. **User creation (optional)**
   - If you want first-time Domo users to get access without a pre-existing account, you can create a user record on first Domo SSO (using `userId`/`email`/`name`) and then issue the JWT. Only do this if that matches your security and product rules.
   - Current `auth.[User]` table: `UserId`, `Username`, `PasswordHash`, `Email`, `FullName`, `IsActive`, `CreatedAt`, `LastLoginAt`. There is no `DomoUserId` column; lookup by **email** (or add a `DomoUserId` column and index if you want to key by Domo ID).

---

## 5. Summary checklist

- [ ] Add `POST /api/auth/domo`.
- [ ] Accept JSON body with `userId` (required), `email` (optional), `name` (optional).
- [ ] Resolve user by email or Domo `userId` (and create user if desired).
- [ ] Return `{ success: true, data: { token: "<JWT>", user: { ... } } }` in the same format as login.
- [ ] Return `{ success: false, error: { message: "..." } }` with 401/403 when the user is not allowed.
- [ ] Use the same JWT signing/validation as `/api/auth/login` and `/api/auth/verify`.

Once this is in place, the Deal Pipeline dashboard will use Domo SSO when available and avoid a second login.

---

## 6. Backend alignment (this codebase)

| Item | Location |
|------|----------|
| Auth routes | `api/src/routes/authRoutes.ts` — add `router.post('/domo', authController.domoSso);` |
| Auth controller | `api/src/controllers/authController.ts` — add `domoSso` handler; reuse same JWT `jwt.sign({ userId, username, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })` and same success shape as `login`. |
| User lookup | `auth.[User]` by `Email` (or by Username if you treat Domo email as username). Table has no `DomoUserId` unless you add it. |
| JWT config | Same `JWT_SECRET` and `JWT_EXPIRES_IN` as in `authController.ts` (used by `login` and `authMiddleware`). |
