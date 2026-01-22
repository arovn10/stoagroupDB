# Azure App Service FTP Setup for RealPage

## Step-by-Step Guide

### Step 1: Create App Service

1. **In Azure Portal, click "+ Create"** (top left of App Services page)

2. **Fill in the Basics tab:**
   - **Subscription:** Azure subscription 1
   - **Resource Group:** `stoagroup` (same as your storage account)
   - **Name:** `stoagroup-realpage-ftp` (must be globally unique)
   - **Publish:** Code
   - **Runtime stack:** Node.js 18 LTS (or 20 LTS)
   - **Operating System:** Linux (cheaper) or Windows
   - **Region:** West US 2 (same as your storage account)
   - **App Service Plan:** 
     - Click "Create new" if you don't have one
     - Name: `stoagroup-app-plan`
     - Pricing tier: **Basic B1** ($13/month) or **Free F1** (for testing)
     - Click "OK"

3. **Click "Review + create"** then **"Create"**

4. **Wait for deployment** (2-3 minutes)

---

### Step 2: Enable FTP Authentication

**IMPORTANT:** FTP authentication is disabled by default. You must enable it first!

1. **Go to your App Service** (click on it from the App Services list)

2. **Enable FTP:**
   - Left sidebar → **Configuration**
   - Click **"General settings"** tab
   - Scroll down to **"FTP state"**
   - Change from **"Disabled"** to **"AllAllowed"** or **"FtpsOnly"** (recommended)
   - Click **"Save"** at the top
   - Wait for the changes to apply (30 seconds)

---

### Step 3: Get FTP Credentials

Once FTP is enabled:

1. **Go to Deployment Center:**
   - Left sidebar → **Deployment Center**
   - Or search for "Deployment Center" in the search bar

2. **Get FTPS Credentials:**
   - Click **"FTPS credentials"** tab
   - You'll see:
     - **FTPS endpoint:** `ftps://waws-prod-yt1-083.ftp.azurewebsites.windows.net/site/wwwroot`
       - **Note:** For RealPage, use just the hostname: `waws-prod-yt1-083.ftp.azurewebsites.windows.net`
     - **Username:** (shown in the Application-scope section)
     - **Password:** (click the copy icon to copy the password)

3. **Copy these credentials** - you'll need them for RealPage

---

### Step 4: Configure RealPage FTP Settings

In RealPage, use these settings:

- **FTP Connection Name:** `STOA Group Database`
- **Server URL:** `stoagroup-realpage-ftp.ftp.azurewebsites.net`
- **Location Path:** `/site/wwwroot/realpage-exports/`
- **User Name:** `stoagroup-realpage-ftp\$stoagroup-realpage-ftp`
- **Authentication Type:** `Password`
- **Password:** (the password from Azure Portal)

**Note:** RealPage will upload files to `/site/wwwroot/realpage-exports/` on your App Service.

---

### Step 5: Create Import Script

You have two options:

#### Option A: Azure Function (Recommended - Automatic)

Create an Azure Function that:
- Monitors the App Service file system
- Triggers when new files arrive
- Imports data to your Azure SQL Database

#### Option B: Scheduled Script (Simpler)

Create a script that runs on a schedule:
- Checks for new files in the App Service
- Downloads and processes them
- Imports to database

---

### Step 6: Connect App Service to Azure File Share (Optional)

To store files in your Azure File Share instead of App Service storage:

1. **In App Service → Configuration:**
   - Go to **Configuration** → **Path mappings**
   - Click **"+ New mount"**
   - **Name:** `realpage-exports`
   - **Type:** Azure Files
   - **Storage account:** `stoagrouprealpage`
   - **File share:** `realpage-exports`
   - **Mount path:** `/realpage-exports`
   - Click **OK** and **Save**

2. **Update RealPage Location Path:**
   - Change to: `/realpage-exports/`

---

## Quick Start Commands

### Using Azure CLI:

```bash
# Create App Service Plan
az appservice plan create \
  --name stoagroup-app-plan \
  --resource-group stoagroup \
  --sku B1 \
  --is-linux

# Create App Service
az webapp create \
  --name stoagroup-realpage-ftp \
  --resource-group stoagroup \
  --plan stoagroup-app-plan \
  --runtime "NODE:18-lts"

# Get FTP credentials
az webapp deployment list-publishing-credentials \
  --name stoagroup-realpage-ftp \
  --resource-group stoagroup
```

---

## Next Steps After Setup

1. ✅ **Test FTP Connection:**
   - Use FileZilla or similar FTP client
   - Connect using the credentials from Step 2
   - Upload a test file

2. ✅ **Create Import Script:**
   - I can help create a script to process RealPage files
   - Script will read files from App Service or File Share
   - Import data into your Azure SQL Database

3. ✅ **Set Up Automation:**
   - Azure Function (triggers on file upload)
   - OR Scheduled task (runs every X minutes/hours)

---

## Important Notes

- **FTP vs FTPS:** Azure App Service uses **FTPS** (secure FTP) on port 21
- **File Storage:** Files uploaded via FTP are stored in `/site/wwwroot/` by default
- **Cost:** Basic B1 plan is ~$13/month, Free F1 is free but has limitations
- **File Size Limits:** Check your App Service plan limits

---

## Need Help?

I can help you:
1. Create the App Service via Azure Portal
2. Set up the import script for RealPage file formats
3. Configure automatic file processing
4. Connect App Service to your Azure File Share

Let me know when you've created the App Service and I'll help with the next steps!
