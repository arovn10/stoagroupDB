# Data Validation Summary

## Overview
This document summarizes the discrepancies found between CSV files and the database after running the validation script.

**Total Discrepancies Found: 101**

---

## 1. Banking Dashboard - Loan Data (61 discrepancies)

### Missing Projects (5)
These projects exist in the CSV but not in the database:
- Bauerle Rd Land, LLC
- 210 E Morris Ave, LLC  
- Amor Fati, LLC (2 entries - LA and MS)
- Icarus Development, LLC

### Projects Missing Loans (1)
- Tredge - Project exists but no loan record found

### Loan Amount & Date Mismatches (55)
Many projects show null values in CSV but have values in database. This suggests:
- CSV parsing may be reading wrong columns for some rows
- Some projects may have missing data in CSV that exists in DB

**Projects with Loan Amount/Date Issues:**
- The Waters at Hammond
- The Waters at Millerville
- The Waters at Redstone
- The Waters at Settlers Trace
- The Waters at West Village
- The Waters at Bluebonnet
- The Waters at Crestview
- The Heights at Picardy
- The Waters at McGowin
- The Waters at Freeport
- The Heights at Waterpointe
- The Waters at Promenade
- The Flats at Ransley
- The Heights at Materra
- The Waters at Crosspointe
- The Waters at Inverness
- The Waters at Conway (reading "38" instead of full amount)
- The Waters at Covington
- The Waters at Robinwood (reading "41" instead of full amount)
- The Waters at OWA
- The Waters at Greenville (reading "40" instead of full amount)
- The Waters at Oxford
- The Waters at Southpoint
- Silver Oaks
- The Heights
- Sweetwater
- The Waters at Southpark
- Dawson Park
- The Waters at Manhattan
- The Waters at Heritage
- The Waters at Ransley
- The Flats at East Bay

---

## 2. Participants Data (1 discrepancy)

### Missing Project
- The Heights at Inverness - Project not found (should be "The Waters at Inverness"?)

---

## 3. Contingent Liabilities - Guarantees (21 discrepancies)

### Guarantee Amount Mismatches
The CSV shows guarantee amounts as "100" (likely 100%) but the database stores dollar amounts. This is a data format mismatch:

**Projects with Guarantee Amount Issues:**
- The Waters at Ransley: CSV=100, DB=337
- The Waters at Heritage: CSV=100, DB=357
- The Waters at Redstone: CSV=100, DB=498
- The Waters at Settlers Trace: CSV=100, DB=698
- The Flats at East Bay: CSV=100, DB=509
- The Waters at West Village: CSV=100, DB=594
- The Waters at Bluebonnet: CSV=100, DB=750
- The Waters at Crestview: CSV=100, DB=875
- The Heights at Picardy: CSV=100, DB=838
- The Waters at McGowin: CSV=100, DB=985
- The Waters at Freeport: CSV=100, DB=50
- The Heights at Waterpointe: CSV=100, DB=269
- The Waters at Promenade: CSV=100, DB=281
- The Flats at Ransley: CSV=100, DB=338
- The Heights at Materra: CSV=100, DB=387
- The Waters at Crosspointe: CSV=100, DB=446
- The Waters at Inverness: CSV=100, DB=477
- The Waters at OWA: CSV=100, DB=996
- The Waters at Covington: CSV=100, DB=752
- The Waters at Oxford: CSV=100, DB=177
- The Waters at Southpoint: CSV=100, DB=57

**Note:** The CSV appears to store guarantee percentages (100%), while the database stores dollar amounts. This may be intentional or may need conversion logic.

---

## 4. Under Contract Data (11 discrepancies)

### Missing Projects (8)
These projects exist in CSV but not in database:
- The Waters at Bartlett
- Cahaba Valley Project
- Greenville Project
- Fort Walton Beach Project
- The Waters at New Bern
- Lake Murray
- The Waters at SweetBay
- The Waters at Fayetteville

### Price Mismatches (3)
The validation script is reading Units instead of Price for some projects:
- The Waters at Oxford: CSV=312 (Units), DB=5250000 (Price)
- The Waters at OWA: CSV=312 (Units), DB=2012472 (Price)
- The Waters at Southpoint: CSV=288 (Units), DB=7920000 (Price)

**Note:** This suggests the validation script is reading the wrong column (Units column instead of Price column).

---

## 5. Closed Properties Data (7 discrepancies)

### Missing Projects (7)
These projects exist in CSV but not in database:
- The Heights at Inverness (should be "The Waters at Inverness"?)
- Office (4 entries - likely not actual project names)
- Okaloosa Ophthalmology
- Office space

**Note:** "Office" entries may be placeholder rows or non-project entries that shouldn't be imported.

---

## Recommendations

### 1. Fix CSV Parsing Issues
- Review column mapping in validation script for Banking Dashboard
- Ensure correct column indices are used (especially for rows without Birth Order)
- Fix Under Contract price validation to read correct column

### 2. Data Format Standardization
- Clarify whether guarantee amounts should be stored as percentages or dollar amounts
- Update import script or database schema accordingly

### 3. Missing Projects
- Add missing projects to database:
  - Bauerle Rd Land, LLC
  - 210 E Morris Ave, LLC
  - Amor Fati, LLC (LA and MS)
  - Icarus Development, LLC
  - The Waters at Bartlett
  - Cahaba Valley Project
  - Greenville Project
  - Fort Walton Beach Project
  - The Waters at New Bern
  - Lake Murray
  - The Waters at SweetBay
  - The Waters at Fayetteville

### 4. Data Cleanup
- Review "Office" entries in Closed Properties CSV - may need to be filtered out
- Verify "The Heights at Inverness" vs "The Waters at Inverness" naming consistency

### 5. Re-run Import
After fixing the above issues, re-run the import script and validation to ensure all data is correctly synchronized.

---

## Next Steps

1. Review and fix validation script column mappings
2. Add missing projects to database
3. Clarify guarantee amount format (percentage vs dollar)
4. Re-run import script: `npm run db:import-csv`
5. Re-run validation: `npm run db:validate-csv`
6. Review remaining discrepancies

---

*Report generated: $(date)*
*Validation script: `api/scripts/validate-csv-data.ts`*
