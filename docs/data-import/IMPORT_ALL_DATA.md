# Import All CSV Data

## 🎯 What This Does

The `import-all-csv-data.ts` script reads **ALL** your CSV files and imports **ALL** the data into the database:

1. **Banking Dashboard CSV** → Loans, DSCR Tests, Covenants, Liquidity Requirements
2. **Exposure CSV** → Bank exposure data (HQState, HoldLimit, PerDealLimit, Deposits)
3. **Participants CSV** → Participations (bank participation splits)
4. **Contingent Liabilities CSV** → Guarantees (Toby, Ryan, Saun) and Covenants
5. **Targeted Banks CSV** → Bank Targets (relationship and exposure data)

---

## 🚀 How to Run

```bash
cd api
npm run db:import-csv
```

This will:
- Read all CSV files from the `data/` folder
- Parse and import all data
- Create/update records in the database
- Show progress and counts

---

## 📋 What Gets Imported

### From Banking Dashboard CSV:
- ✅ **Loans** - All loan details (amounts, dates, rates, spreads)
- ✅ **DSCR Tests** - 1st, 2nd, 3rd test dates and requirements
- ✅ **Covenants** - Occupancy covenants
- ✅ **Liquidity Requirements** - Total and lending bank amounts

### From Exposure CSV:
- ✅ **Bank Updates** - HQState, HoldLimit, PerDealLimit, Deposits, Notes

### From Participants CSV:
- ✅ **Participations** - Bank participation percentages and exposure amounts
- ✅ **Paid Off Status** - Tracks if participation is paid off

### From Contingent Liabilities CSV:
- ✅ **Guarantees** - Personal guarantees for Toby, Ryan, Saun, Stoa Holdings
- ✅ **Covenants** - Additional covenant notes

### From Targeted Banks CSV:
- ✅ **Bank Targets** - Relationship data, exposure, contacts, comments
- ✅ **New Banks** - Creates banks if they don't exist

---

## ⚠️ Important Notes

1. **Safe to Run Multiple Times** - The script checks for existing records before inserting
2. **Requires Projects First** - Make sure projects exist (run `npm run db:sync-all` first)
3. **Requires Banks First** - Make sure banks exist (run `npm run db:sync-all` first)
4. **Requires People First** - Make sure people exist (Toby, Ryan, Saun)

---

## 🔍 Before Running

Make sure you have:
1. ✅ Projects synced: `npm run db:sync-all`
2. ✅ Database connection configured in `.env`
3. ✅ CSV files in `data/` folder

---

## 📊 Expected Results

After running, you should have:
- **~30-40 Loans** (from Banking Dashboard)
- **~50-80 Participations** (from Participants CSV)
- **~40-60 Guarantees** (from Contingent Liabilities)
- **~20-30 DSCR Tests** (from Banking Dashboard)
- **~10-20 Covenants** (from Banking Dashboard + Contingent Liabilities)
- **~15-20 Liquidity Requirements** (from Banking Dashboard)
- **~50-100 Bank Targets** (from Targeted Banks CSV)
- **All Banks Updated** with exposure data (from Exposure CSV)

---

## 🐛 Troubleshooting

### "Project not found" warnings
- Make sure project names in CSV match exactly with database
- Run `npm run db:sync-all` first to create all projects

### "Bank not found" warnings
- The script will create banks from Targeted Banks CSV
- For Exposure CSV, make sure banks exist first

### CSV parsing errors
- Check CSV file format (should be standard CSV with quotes)
- Make sure CSV files are in `data/` folder

---

## ✅ After Import

Verify the data:

```bash
# Check loans
npm run db:query "SELECT COUNT(*) as total FROM banking.Loan"

# Check participations
npm run db:query "SELECT COUNT(*) as total FROM banking.Participation"

# Check guarantees
npm run db:query "SELECT COUNT(*) as total FROM banking.Guarantee"

# Check DSCR tests
npm run db:query "SELECT COUNT(*) as total FROM banking.DSCRTest"

# Check covenants
npm run db:query "SELECT COUNT(*) as total FROM banking.Covenant"

# Check liquidity requirements
npm run db:query "SELECT COUNT(*) as total FROM banking.LiquidityRequirement"

# Check bank targets
npm run db:query "SELECT COUNT(*) as total FROM banking.BankTarget"
```

---

## 🎉 That's It!

Once you run `npm run db:import-csv`, **ALL** your CSV data will be in the database!
