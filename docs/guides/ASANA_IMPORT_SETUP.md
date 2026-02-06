# Asana Import Setup Guide

## Quick Setup

The import script reads from the deal pipeline `.env` file. You need to add your Asana Personal Access Token.

### Step 1: Get Your Asana Personal Access Token

1. Go to https://app.asana.com/0/my-apps
2. Click "Create new token"
3. Give it a name (e.g., "Deal Pipeline Import")
4. Copy the token (format: `1/1234567890:abcdefghijklmnopqrstuvwxyz`)

### Step 2: Add Token to .env File

Add this line to your `.env` file in the root directory:

```bash
ASANA_ACCESS_TOKEN=1/your_token_here
```

Or add it to the deal pipeline `.env` file:
```
deal pipeline-FOR REFERENCE DO NOT EDIT/.env
```

**Current .env file has:**
```
CLIENT_ID=1212684155072492
CLIENT_SECRET=c61c02ba2cc473db153d9510f885bb4a
ASANA_API_BASE=https://app.asana.com/api/1.0
```

**Add:**
```
ASANA_ACCESS_TOKEN=your_personal_access_token_here
```

### Step 3: Run Import

```bash
cd api
npm run db:import-asana-deal-pipeline
```

## Environment Variables

The import script looks for these variables (in order):
1. `deal pipeline-FOR REFERENCE DO NOT EDIT/.env`
2. Root `.env` file
3. Current directory `.env`

**Required:**
- `ASANA_ACCESS_TOKEN` or `ASANA_PAT` - Your Personal Access Token

**Optional:**
- `ASANA_API_BASE` - API base URL (default: `https://app.asana.com/api/1.0`)
- `ASANA_PROJECT_GID` - Deal Pipeline project GID (default: `1207455912614114`). Used by **Upcoming Tasks API** and import scripts.
- `ASANA_WORKSPACE_GID` - Default workspace for Upcoming Tasks API when client does not send `workspace`.
- `ASANA_START_DATE_CUSTOM_FIELD_GID` - When set, remedy endpoint updates the task’s custom field "Start Date" (for deal-detail sync).
- `CLIENT_ID` - OAuth Client ID (used with CLIENT_SECRET + REFRESH_TOKEN for **Upcoming Tasks API** and precon-managers import)
- `CLIENT_SECRET` - OAuth Client Secret
- `REFRESH_TOKEN` or `ASANA_REFRESH_TOKEN` - OAuth refresh token (required for server-side OAuth; obtain once via authorization flow, then set in env)

## Getting an OAuth refresh token (optional)

If you want to use OAuth instead of a PAT (e.g. for the Upcoming Tasks API on Render):

1. In [Asana My Apps](https://app.asana.com/0/my-apps), open your app → **OAuth** tab. Add this **Redirect URL** exactly: `http://localhost:3456/callback`. (If Asana only allows https, use a tunnel like [ngrok](https://ngrok.com) and add the https URL.)
2. From the repo root or `api/` folder, run:
   ```bash
   cd api && node scripts/get-asana-refresh-token.js
   ```
3. Open the URL printed in the terminal in your browser. Log into Asana if needed and click **Allow**.
4. The script will print `REFRESH_TOKEN=...`. Add **REFRESH_TOKEN** (or **ASANA_REFRESH_TOKEN**) to Render’s Environment and redeploy.

Your `.env` (or Render) must have **CLIENT_ID** and **CLIENT_SECRET** set; the script reads them from the deal pipeline `.env` or repo root `.env`.

## Note on OAuth

The `.env` file has `CLIENT_ID` and `CLIENT_SECRET` for OAuth, but:
- **OAuth requires user authorization** (one-time flow above to get a refresh token)
- **Personal Access Token (PAT) is simpler** for most use cases
- The import scripts and Upcoming Tasks API accept either PAT or OAuth (PAT + refresh token)

## Troubleshooting

### Error: "No Asana access token available"
**Solution**: Add `ASANA_ACCESS_TOKEN` to your `.env` file

### Error: "401 Unauthorized"
**Solution**: Your token may be expired. Generate a new one at https://app.asana.com/0/my-apps

### Error: "403 Forbidden"
**Solution**: Your token doesn't have permission to access the Deal Pipeline project. Make sure you're using a token from an account that has access.

### Error: "429 Too Many Requests"
**Solution**: The script handles rate limiting automatically. It will wait and retry.
