# RealPage FTP to Azure SQL Database Setup Guide

## Overview

Azure SQL Database doesn't support FTP directly. You need an FTP server that receives files from RealPage, then processes them into your database.

## Architecture

```
RealPage → FTP Server → Azure Blob Storage → Import Script → Azure SQL Database
```

---

## Recommended Solution: Azure Files + FTP Server

### Step 1: Create Azure Storage Account

1. Go to [Azure Portal](https://portal.azure.com)
2. Create Storage Account:
   - **Name:** `stoagrouprealpage` (or your choice)
   - **Performance:** Standard
   - **Redundancy:** LRS
   - **Region:** Same as your SQL Database (likely East US or West US)

### Step 2: Create Azure File Share

1. In your Storage Account, go to **File shares**
2. Click **+ File share**
3. Name: `realpage-exports`
4. Quota: 100 GB (or as needed)

### Step 3: Set Up FTP Server

You have two options:

#### Option A: Azure VM with FTP Server (More Control)

1. **Create Azure VM:**
   - Windows Server or Linux
   - Small size (B1s or B2s is fine)
   - Same region as Storage Account

2. **Install FTP Server:**
   - **Windows:** IIS FTP Server
   - **Linux:** vsftpd or FileZilla Server

3. **Mount Azure File Share:**
   - Map the Azure File Share as a network drive on the VM
   - Configure FTP to save files to that mapped drive

#### Option B: Use Azure App Service with FTP (Simpler)

1. **Create Azure App Service:**
   - Go to Azure Portal → App Services → Create
   - Choose **Windows** or **Linux**
   - **Pricing Tier:** Basic (B1) is fine

2. **Enable FTP:**
   - Azure App Services have built-in FTP
   - Go to **Deployment Center** → **FTPS credentials**
   - Note the FTP hostname and credentials

3. **Configure RealPage:**
   - **Server URL:** `[your-app-name].ftp.azurewebsites.net` or `[your-app-name].scm.azurewebsites.net`
   - **User Name:** `[app-name]\$[app-name]`
   - **Password:** (from Deployment Center → FTPS credentials)

---

## Step 4: Create Import Script

Create a script that:
1. Monitors Azure File Share or Blob Storage for new files
2. Downloads and parses RealPage export files
3. Imports data into your Azure SQL Database

### Example: Azure Function with Blob Trigger

```typescript
// This would be an Azure Function that triggers when files are uploaded
import { BlobServiceClient } from '@azure/storage-blob';
import sql from 'mssql';

export async function processRealPageExport(context: any, blob: any) {
  // 1. Parse the RealPage file (CSV, Excel, etc.)
  // 2. Import to Azure SQL Database
  // 3. Move processed file to archive folder
}
```

---

## Step 5: Configure RealPage FTP Settings

Based on your image, configure RealPage with:

### If Using Azure App Service FTP:
- **FTP Connection Name:** `STOA Group Database`
- **Server URL:** `[your-app-name].ftp.azurewebsites.net`
- **Location Path:** `/site/wwwroot/realpage-exports/`
- **User Name:** `[app-name]\$[app-name]`
- **Authentication Type:** `Password`
- **Password:** (from Azure Portal → Deployment Center → FTPS credentials)

### If Using Azure VM FTP:
- **Server URL:** `[vm-public-ip]` or `[vm-dns-name].cloudapp.azure.com`
- **Location Path:** `/realpage-exports/`
- **User Name:** `[ftp-username]`
- **Password:** `[ftp-password]`

---

## Alternative: Direct API Integration (If RealPage Supports It)

If RealPage has API access:

1. **Create API Endpoint in Your API:**
   ```typescript
   // POST /api/import/realpage
   router.post('/import/realpage', async (req, res) => {
     // Receive RealPage data
     // Import directly to database
   });
   ```

2. **Configure RealPage Webhook/API:**
   - Point RealPage to: `https://stoagroupdb-ddre.onrender.com/api/import/realpage`
   - No FTP needed!

---

## Quick Setup: Azure App Service FTP (Easiest)

### 1. Create App Service:
```bash
# Using Azure CLI (or use Portal)
az webapp create \
  --resource-group [your-resource-group] \
  --plan [your-app-service-plan] \
  --name stoagroup-realpage-ftp \
  --runtime "node:18-lts"
```

### 2. Get FTP Credentials:
- Azure Portal → Your App Service → **Deployment Center**
- Click **FTPS credentials**
- Copy the **FTPS endpoint** and **username/password**

### 3. Configure RealPage:
- **Server URL:** `stoagroup-realpage-ftp.ftp.azurewebsites.net`
- **User Name:** `stoagroup-realpage-ftp\$stoagroup-realpage-ftp`
- **Password:** (from Deployment Center)

### 4. Create Import Script:
- Azure Function that monitors the App Service file system
- Or scheduled script that checks for new files and imports them

---

## What You Need from Azure:

1. **Storage Account** (for file storage)
   - OR **App Service** (has built-in FTP)
   
2. **FTP Server** (if not using App Service)
   - Azure VM with FTP server
   - OR third-party FTP service

3. **Import Script** (to process files)
   - Azure Function (serverless)
   - OR scheduled task on your API server

---

## Next Steps:

1. **Choose your approach:**
   - ✅ **Easiest:** Azure App Service with FTP
   - ✅ **Most Flexible:** Azure VM with FTP + Azure Files
   - ✅ **Best:** RealPage API → Your API endpoint (if available)

2. **I can help you:**
   - Set up Azure App Service FTP
   - Create the import script for RealPage file formats
   - Set up Azure Function to auto-process files
   - Configure RealPage FTP settings once you have the server details

Which approach would you like to use?
