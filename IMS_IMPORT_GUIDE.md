# IMS Data Import Guide

## 🎯 Purpose

This script imports IMS (Investment Management System) data into the banking tables, specifically focusing on equity commitments and investments.

## 📋 What Gets Imported

### From IMS Commitments File:
- **Equity Commitments** → `banking.EquityCommitment`
  - Project/Property name → Links to `core.Project`
  - Equity Partner → Creates/links to `core.EquityPartner`
  - Commitment amount
  - Funding date
  - Equity type (Pref, Common)
  - Interest rate
  - Lead pref group
  - Last dollar flag

### From IMS Investments File:
- **Investments** → `banking.EquityCommitment` (as commitments)
  - Project/Property name → Links to `core.Project`
  - Investor/Partner → Creates/links to `core.EquityPartner`
  - Investment amount
  - Investment date

## 🚀 How to Run

### Prerequisites

1. **Install dependencies:**
   ```bash
   cd api
   npm install
   ```
   This will install the `xlsx` package needed to read Excel files.

2. **Ensure projects exist:**
   The script needs projects to exist in `core.Project` first. Run:
   ```bash
   npm run db:seed
   ```
   Or ensure projects are already in the database.

### Run the Import

```bash
cd api
npm run db:import-ims
```

## 🔍 How It Works

1. **Reads Excel Files:**
   - Automatically finds IMS Excel files in `stoa_seed_csvs/IMSData/`
   - Looks for files containing "commitments" and "investments" in the filename

2. **Project Matching:**
   - Matches IMS project names to `core.Project.ProjectName`
   - Uses exact match first, then case-insensitive, then partial match
   - Logs warnings for projects that can't be matched

3. **Uniqueness Check:**
   - Checks if a commitment already exists before inserting
   - Uses ProjectId + EquityPartnerId + Amount (within $0.01 tolerance)
   - Updates existing records if found, creates new ones if not

4. **Equity Partner Creation:**
   - Automatically creates equity partners if they don't exist
   - Links commitments to existing or newly created partners

## 📊 Data Mapping

### IMS Commitments → banking.EquityCommitment

| IMS Column (flexible matching) | Database Field | Notes |
|--------------------------------|----------------|-------|
| Project/Property/Name | ProjectId | Links to core.Project |
| Partner/Investor/Equity | EquityPartnerId | Creates if doesn't exist |
| Amount/Commitment/Total | Amount | Parsed as decimal |
| Funding/Date/Funding Date | FundingDate | Parsed as date |
| Type/Equity Type | EquityType | Pref, Common, etc. |
| Rate/Interest/Interest Rate | InterestRate | Stored as string |
| Lead/Pref/Group | LeadPrefGroup | Stored as string |
| Last Dollar/LastDollar | LastDollar | Boolean flag |

### IMS Investments → banking.EquityCommitment

| IMS Column | Database Field | Notes |
|------------|----------------|-------|
| Project/Property/Name | ProjectId | Links to core.Project |
| Partner/Investor | EquityPartnerId | Creates if doesn't exist |
| Amount/Investment | Amount | Parsed as decimal |
| Date/Investment Date | FundingDate | Parsed as date |

## ⚠️ Important Notes

1. **Uniqueness:**
   - The script ensures no duplicate commitments are created
   - Uses ProjectId + EquityPartnerId + Amount (within tolerance) as uniqueness check
   - If a matching record exists, it updates it instead of creating a duplicate

2. **Project Matching:**
   - Project names must match (exactly, case-insensitive, or partially)
   - Projects that can't be matched are skipped with a warning
   - Check logs to see which projects couldn't be matched

3. **Excel Date Handling:**
   - Handles Excel date serial numbers
   - Handles various date formats (ISO, MM/DD/YYYY, etc.)
   - Converts to SQL DATE format (YYYY-MM-DD)

4. **Amount Parsing:**
   - Removes $ and commas
   - Handles null/empty/N/A values
   - Uses tolerance of $0.01 for uniqueness matching

5. **Safe to Run Multiple Times:**
   - The script checks for existing records before inserting
   - Can be run multiple times without creating duplicates
   - Updates existing records if they exist

## 📝 Example Output

```
🚀 Starting IMS Data Import...

📄 Reading: ims-commitments-export20260112-36-3dw8or.xlsx
📊 Importing Equity Commitments from IMS...
  ⚠️  Project not found: Some Project Name
  ✅ Created 25 equity commitments, updated 3, skipped 2

📄 Reading: ims-investments-export20260112-36-fsayxd.xlsx
📊 Importing Investments from IMS...
  ✅ Created 15 equity commitments from investments, skipped 5

✅ IMS data import completed!
```

## 🔧 Troubleshooting

### "Project not found" warnings
- Check that projects exist in `core.Project` table
- Verify project names match between IMS and database
- Project names are matched flexibly (exact, case-insensitive, partial)

### "No data rows found"
- Check that Excel files exist in `stoa_seed_csvs/IMSData/`
- Verify Excel files are not corrupted
- Check that files contain data (not just headers)

### "xlsx module not found"
- Run `npm install` in the `api` directory
- Ensure `xlsx` package is installed

### Duplicate data concerns
- The script checks for duplicates before inserting
- Uses ProjectId + EquityPartnerId + Amount as uniqueness key
- Existing records are updated, not duplicated

## 📁 File Structure

```
stoa_seed_csvs/
  └── IMSData/
      ├── ims-commitments-export*.xlsx      → Equity Commitments
      ├── ims-investments-export*.xlsx      → Investments
      └── ims-investments-and-distributions*.xlsx → Combined data
```

## 🎯 Next Steps

After importing IMS data:
1. Verify data in `banking.EquityCommitment` table
2. Check that all projects were matched correctly
3. Review equity partners created
4. Use Domo queries to visualize the data

---

*Last Updated: IMS Import Script v1.0*
