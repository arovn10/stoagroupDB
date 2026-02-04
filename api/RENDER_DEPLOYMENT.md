# Deploying to Render

Render is a great choice for hosting your API! It's simple, reliable, and has a free tier.

---

## 🚀 Quick Deployment Steps

### Step 1: Prepare Your Code

Make sure your code is in a Git repository (GitHub, GitLab, or Bitbucket).

### Step 2: Create a Render Account

1. Go to [render.com](https://render.com)
2. Sign up (free account works fine)
3. Connect your Git provider (GitHub, GitLab, etc.)

### Step 3: Create a New Web Service

1. In Render dashboard, click **"New +"** button (top right)
2. **Select "Web Service"** (the one with the globe icon)
   - ⚠️ **NOT** Static Sites
   - ⚠️ **NOT** Postgres (that's for databases)
   - ✅ **YES** Web Services (for APIs/backends)
3. Connect your repository (GitHub, GitLab, etc.)
4. Select the repository with your API code

### Step 4: Configure the Service

**Settings:**

- **Name:** `stoagroup-api` (or whatever you prefer)
- **Region:** Choose closest to your Azure database (e.g., `Oregon (US West)` or `Ohio (US East)`)
- **Branch:** `main` (or your default branch)
- **Root Directory:** `api` (if your API code is in the `api` folder)
- **Runtime:** `Node` ⚠️ **IMPORTANT: Select "Node" not "Docker"**
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Plan:** Free (or paid if you need more resources)

**⚠️ Important:** Make sure you select **"Node"** as the Runtime, NOT "Docker". If you see a Docker option, choose Node instead. The Dockerfile is available if you want to use Docker later, but native Node.js is simpler.

### Step 5: Set Environment Variables

In the Render dashboard, go to **Environment** (or **Environment Variables**) and add:

```
DB_SERVER=stoagroupdb.database.windows.net
DB_DATABASE=stoagroupDB
DB_USER=arovner
DB_PASSWORD=your_actual_password_here
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
NODE_ENV=production
CORS_ORIGINS=*

# Auth: JWT signing key (required for login / Domo SSO)
JWT_SECRET=your-strong-random-secret-here
JWT_EXPIRES_IN=24h
```

**Deal pipeline attachments (Azure Blob):**  
Store the Azure Storage key in Render’s Environment — **do not put it in code.** Set:
```
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=deal-pipeline-attachments
```
Get the connection string from Azure Portal → your Storage Account → **Access keys** → “Connection string”. Without these, attachments use local disk (and are lost on redeploy).

**Land Development reminder emails (SMTP / Office 365):**  
To enable "Send reminder" for Land Development Contacts, set in Render Environment:
```
SMTP_HOST=outlook.office365.com
SMTP_PORT=587
MAIL_FROM=domo@stoagroup.com
SMTP_USER=domo@stoagroup.com
SMTP_PASS=your-app-password-here
```
Use the actual mailbox password or an app password for `SMTP_PASS`. Do not commit passwords to Git.

**Important:** 
- Replace `your_actual_password_here` with your real database password.
- Replace `your-strong-random-secret-here` with a long random string (e.g. from `openssl rand -base64 32`). **Store the JWT secret only in Render’s Environment** — never in code or Git.
- For production, restrict `CORS_ORIGINS` to your Domo URL if needed.

### Step 6: Deploy

1. Click **"Create Web Service"**
2. Render will automatically:
   - Clone your repo
   - Install dependencies
   - Build your TypeScript
   - Start your server

### Step 7: Get Your API URL

Once deployed, Render will give you a URL like:
```
https://stoagroup-api.onrender.com
```

**That's your API URL!** Use this in Domo instead of `localhost:3000`.

---

## 📋 Migrations to run on production

After deploying code that uses **Latitude/Longitude** on deal pipeline, the production database must have those columns. Run this **once** on the same DB your Render API uses (e.g. Azure Portal → Query editor, or SSMS):

```sql
-- schema/add_deal_pipeline_latitude_longitude.sql
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'pipeline' AND TABLE_NAME = 'DealPipeline' AND COLUMN_NAME = 'Latitude')
  ALTER TABLE pipeline.DealPipeline ADD Latitude DECIMAL(18,8) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'pipeline' AND TABLE_NAME = 'DealPipeline' AND COLUMN_NAME = 'Longitude')
  ALTER TABLE pipeline.DealPipeline ADD Longitude DECIMAL(18,8) NULL;
```

Until this is run, the API will return **Invalid column name 'Longitude'** (or 'Latitude') when loading deal pipelines.

---

## 🔧 Configuration Details

### Build Command
```bash
npm install && npm run build
```

### Start Command
```bash
npm start
```

### Root Directory
- If your API code is in the root: leave blank
- If your API code is in `api/` folder: set to `api`

---

## 🔒 Security Notes

### For Production:

1. **Restrict CORS:**
   ```
   CORS_ORIGINS=https://your-domo-instance.domo.com
   ```

2. **Use Render's Environment Variables:**
   - Never commit passwords to Git
   - Always use Render's environment variables section

3. **Enable HTTPS:**
   - Render provides HTTPS automatically
   - Your API will be at `https://your-app.onrender.com`

---

## 🆓 Free Tier Limitations

Render's free tier:
- ✅ Always on (doesn't sleep)
- ✅ HTTPS included
- ✅ Custom domain support
- ⚠️ Slower cold starts (first request after inactivity)
- ⚠️ Limited to 750 hours/month (usually enough)

**For production use:** Consider the $7/month Starter plan for better performance.

---

## 🧪 Testing Your Deployed API

Once deployed, test it:

```bash
# Health check
curl https://your-app.onrender.com/health

# API documentation
curl https://your-app.onrender.com/api
```

Or open in browser:
- `https://your-app.onrender.com/health`
- `https://your-app.onrender.com/api`

---

## 🔄 Updating Your API

Render automatically redeploys when you push to your connected branch:

1. Make changes to your code
2. Commit and push to Git
3. Render automatically detects changes and redeploys
4. Your API updates in a few minutes

---

## 🐛 Troubleshooting

### "Dockerfile not found" Error
**Solution:** Make sure you selected **"Node"** as the Runtime, NOT "Docker". 
- Go to your service settings in Render
- Change Runtime from "Docker" to "Node"
- Save and redeploy

If you want to use Docker instead:
- Make sure the Dockerfile is in the `api/` folder (already created)
- Select "Docker" as Runtime
- Render will automatically use the Dockerfile

### Build Fails
- Check that `package.json` has correct build script
- Verify TypeScript compiles locally first: `npm run build`
- Check Render logs for specific errors
- Make sure Root Directory is set to `api` if your code is in that folder

### API Not Connecting to Database
- Verify environment variables are set correctly
- Check Azure SQL Database firewall allows Render's IPs
- You may need to add Render's IP range to Azure firewall (or allow all Azure services)

### CORS Errors
- Make sure `CORS_ORIGINS` includes your Domo URL
- Or set to `*` for testing (not recommended for production)

---

## 📋 Checklist

Before deploying:
- [ ] Code is in a Git repository
- [ ] `.env` file is NOT committed (use Render env vars instead)
- [ ] `JWT_SECRET` and DB credentials set in Render **Environment** (not in code)
- [ ] `npm run build` works locally
- [ ] `npm start` works locally
- [ ] You know your database password

After deploying:
- [ ] Health check works: `https://your-app.onrender.com/health`
- [ ] API docs load: `https://your-app.onrender.com/api`
- [ ] Test a POST request
- [ ] Update Domo to use the new API URL

---

## 🎯 Next Steps

Once deployed:
1. Test your API URL
2. Update Domo DataFlows to use: `https://your-app.onrender.com/api/...`
3. Test making edits through Domo
4. Monitor Render dashboard for any issues

---

## 💡 Pro Tips

1. **Custom Domain:** Render lets you add a custom domain (e.g., `api.stoagroup.com`)
2. **Auto-Deploy:** Only deploys from your main branch (or branch you specify)
3. **Logs:** View real-time logs in Render dashboard
4. **Metrics:** Monitor requests, response times, and errors

---

## 🔗 Useful Links

- [Render Documentation](https://render.com/docs)
- [Node.js on Render](https://render.com/docs/node)
- [Environment Variables on Render](https://render.com/docs/environment-variables)
