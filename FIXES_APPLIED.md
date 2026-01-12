# Data Validation Fixes Applied

## Issues Fixed

### 1. Loan Import Script (`import-all-csv-data.ts`)
**Problem:** Script was only importing loans when BOTH `loanAmount` AND `loanClosingDate` were present, resulting in 0 loans processed.

**Fix:** 
- Changed condition to process loans if ANY loan data exists (amount, date, lender, or loan type)
- Used `COALESCE` in UPDATE statement to preserve existing DB values when CSV has NULL
- Now allows updating partial data without overwriting existing values with NULL

**Impact:** Loans will now be imported/updated even if CSV is missing some fields.

---

### 2. Loan Validation Script (`validate-csv-data.ts`)
**Problem:** Script was flagging discrepancies when CSV had NULL values but DB had data, even though CSV might legitimately be missing that data.

**Fix:**
- Only validate fields when CSV actually has data (check if column exists and is not empty)
- Skip validation for NULL/empty CSV values instead of flagging as errors

**Impact:** Validation will only report real mismatches, not missing CSV data.

---

### 3. Contingent Liabilities Validation
**Problem:** Script was reading column 6 (Stoa Holdings guarantee amount) instead of column 8 (Toby's guarantee amount).

**Fix:**
- Changed to read column 8 for Toby's guarantee dollar amount
- Column mapping: Column 7 = Toby's %, Column 8 = Toby's $

**Impact:** Guarantee amount validation will now compare correct values.

---

### 4. Under Contract Validation
**Problem:** Script was correctly reading column 6, but needed better error handling.

**Fix:**
- Added check to ensure column exists before reading
- Added comment clarifying column structure

**Impact:** More robust validation that won't crash on malformed rows.

---

## Remaining Issues

### Missing Projects
These projects exist in CSV but not in database (need to be added):
- Bauerle Rd Land, LLC
- 210 E Morris Ave, LLC
- Amor Fati, LLC (LA and MS entries)
- Icarus Development, LLC
- The Waters at Bartlett
- Cahaba Valley Project
- Greenville Project
- Fort Walton Beach Project
- The Waters at New Bern
- Lake Murray
- The Waters at SweetBay
- The Waters at Fayetteville
- The Heights at Inverness (or should be "The Waters at Inverness"?)

### Database Schema
The `core.Bank` table doesn't have these columns that the Exposure CSV tries to import:
- `HQState`
- `HoldLimit`
- `PerDealLimit`
- `Deposits`

**Options:**
1. Add these columns to the schema
2. Store this data in `banking.BankTarget` table instead
3. Skip importing this data

---

## Next Steps

1. **Re-run import:** `npm run db:import-csv`
   - Should now import loans even with partial data
   
2. **Re-run validation:** `npm run db:validate-csv`
   - Should show fewer false positives
   - Will only report real data mismatches

3. **Add missing projects** to database before re-importing

4. **Decide on Bank exposure columns** - add to schema or use alternative storage

---

## Testing

After applying fixes, you should see:
- More loans imported (not 0)
- Fewer false discrepancy reports
- Correct guarantee amount comparisons
- More accurate price validations

Run the validation script again to see the improved results!
