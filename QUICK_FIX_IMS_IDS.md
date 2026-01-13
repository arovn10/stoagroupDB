# Quick Fix: Resolve IMS Investor IDs to Names

## 🎯 Problem

You're seeing IMS Investor Profile IDs (like `2660619`, `2661230`) displayed instead of investor names in your Domo dashboard.

## ✅ Quick Solution (3 Steps)

### Step 1: Add IMSInvestorProfileId Column to Database

Run the schema migration:

```bash
cd api
npm run db:query "$(cat ../schema/add_ims_investor_id.sql)"
```

Or manually execute:
```sql
ALTER TABLE core.EquityPartner
ADD IMSInvestorProfileId NVARCHAR(50) NULL;

CREATE INDEX IX_EquityPartner_IMSInvestorProfileId 
ON core.EquityPartner(IMSInvestorProfileId);
```

### Step 2: Populate IMS IDs from Mapping File

```bash
cd api
npm run db:populate-ims-ids
```

This script will:
- Read the IMS mapping file (`ims-mapping-ids-export*.xlsx`)
- Find partners with numeric names (IMS IDs)
- Update them with actual names from the mapping file
- Set the `IMSInvestorProfileId` field

### Step 3: Use API in Domo

**Option A: Use the API endpoint directly**

```javascript
// In Domo Custom Script
const imsId = row['Investor']; // e.g., '2660619'
const investor = await getEquityPartnerByIMSId(imsId);
const investorName = investor.success ? investor.data.PartnerName : imsId;
```

**Option B: Use the helper script (Recommended)**

Copy `domo-resolve-ims-ids.js` into your Domo Custom Script and modify the `INVESTOR_COLUMN` variable to match your column name.

---

## 🔧 API Endpoints Available

### Get Investor by IMS ID
```
GET /api/core/equity-partners/ims/:imsId
```

**Example:**
```javascript
const investor = await getEquityPartnerByIMSId('2660619');
// Returns: { success: true, data: { PartnerName: "Investor Name", ... } }
```

### Get All Equity Commitments (with resolved names)
```
GET /api/banking/equity-commitments
```

The API now includes an `InvestorName` field that attempts to resolve IMS IDs automatically.

---

## 📋 What Was Added

1. ✅ **Database Schema**: `IMSInvestorProfileId` column in `core.EquityPartner`
2. ✅ **API Endpoint**: `GET /api/core/equity-partners/ims/:imsId`
3. ✅ **Import Script Updates**: Now captures IMS IDs when importing
4. ✅ **Populate Script**: `populate-ims-ids.ts` to update existing data
5. ✅ **Domo Helper Script**: `domo-resolve-ims-ids.js` for easy use in Domo
6. ✅ **API Client Functions**: `getInvestorNameFromIMSId()` and `resolveInvestorName()`

---

## 🚀 Next Steps

1. **Run the schema migration** (Step 1 above)
2. **Populate IMS IDs** (Step 2 above)
3. **Update your Domo Custom Script** to use the resolution functions
4. **Future imports** will automatically capture IMS IDs

---

## 📝 Example: Fix Your Current Data

If you have data showing IDs like `2660619`, you can:

1. **Via API** (for a few records):
```javascript
const resolved = await resolveInvestorName('2660619');
console.log(resolved); // Returns actual name
```

2. **Via Database** (bulk update):
```sql
-- After running populate-ims-ids script, partners should be updated
SELECT PartnerName, IMSInvestorProfileId 
FROM core.EquityPartner 
WHERE IMSInvestorProfileId IS NOT NULL;
```

3. **Via Domo Script** (transform your dataset):
```javascript
// Copy domo-resolve-ims-ids.js into your Domo Custom Script
// Change INVESTOR_COLUMN to match your column name
// The script will automatically resolve all IDs
```

---

*Last Updated: Quick Fix Guide v1.0*
