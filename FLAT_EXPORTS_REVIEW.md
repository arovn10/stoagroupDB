# Flat Exports CSV Review

## Overview
Reviewed all CSV files in `stoa_flat_exports_csv/` directory for data quality issues.

---

## ✅ Files with No Issues

1. **dscr_tests.csv** - 32 rows, clean data
2. **liquidity_requirements.csv** - 19 rows, clean data
3. **occupancy_covenants.csv** - 1 row, clean data
4. **raw_Banking_Dashboard_xlsx_Exposure.csv** - 55 rows, clean data
5. **raw_Portfolio_Dashboard_xlsm_Cashflow.csv** - Clean data

---

## ⚠️ Files with Issues

### 1. **projects.csv** (41 rows)
**Issues:**
- ❌ **34 rows with inconsistent column count** (expected 9 columns, found varying)
- ❌ **7 projects in CSV but not in database:**
  - Bauerle Rd Land (DB has "Bauerle Rd Land, LLC")
  - 210 E Morris Ave (DB has "210 E Morris Ave, LLC")
  - Amor Fati (DB has "Amor Fati, LLC")
  - Icarus Development (DB has "Icarus Development, LLC")
  - Stoa Construction (DB has "Stoa Construction, LLC")
  - Plane Loan (not a project)
  - Tredge (not a project)

- ❌ **13 projects in database but not in CSV:**
  - 210 E Morris Ave, LLC
  - Amor Fati, LLC
  - Bauerle Rd Land, LLC
  - Cahaba Valley Project
  - Fort Walton Beach Project
  - Greenville Project
  - Lake Murray
  - The Heights at Inverness
  - The Waters at Bartlett
  - The Waters at Fayetteville
  - The Waters at New Bern
  - The Waters at SweetBay
  - Icarus Development, LLC

**Root Cause:** Name mismatches (", LLC" suffix) and missing projects

---

### 2. **loans.csv** (42 rows)
**Issues:**
- ❌ **5 rows with invalid loan amounts** (non-numeric values)
- ❌ **6 rows with inconsistent column count** (expected 21 columns)
- ❌ **9 loans for projects not found in database:**
  - Bauerle Rd Land (should be "Bauerle Rd Land, LLC")
  - 210 E Morris Ave (should be "210 E Morris Ave, LLC")
  - Amor Fati (should be "Amor Fati, LLC")
  - Icarus Development (should be "Icarus Development, LLC")
  - Stoa Construction (should be "Stoa Construction, LLC")
  - Pre-Construction (section header, not a project)
  - Liquidated (section header, not a project)
  - Plane Loan (not a project)
  - Tredge (project exists but no loan)

**Root Cause:** Same name mismatch issues as projects.csv

---

### 3. **bank_capacity_notes.csv** (13 rows)
**Issues:**
- ❌ **3 rows with inconsistent column count** (expected 4 columns)

**Impact:** Some bank notes may be truncated or misaligned

---

### 4. **Raw Banking Dashboard Files**

#### **raw_Banking_Dashboard_xlsx_Banking_Dashboard.csv** (79 rows)
- ❌ **13 duplicate rows**
- ❌ **38 rows with inconsistent column count** (expected 40 columns)

#### **raw_Banking_Dashboard_xlsx_Contingent_Liabilities.csv** (38 rows)
- ❌ **4 duplicate rows**
- ❌ **2 rows with inconsistent column count** (expected 16 columns)

#### **raw_Banking_Dashboard_xlsx_Master_Plan.csv** (110 rows)
- ❌ **7 duplicate rows**

#### **raw_Banking_Dashboard_xlsx_Participants.csv** (84 rows)
- ❌ **15 duplicate rows**

#### **raw_Banking_Dashboard_xlsx_Targeted_Banks.csv** (194 rows)
- ❌ **3 duplicate rows**
- ❌ **53 rows with inconsistent column count** (expected 14 columns)

---

### 5. **Raw Portfolio Dashboard Files**

#### **raw_Portfolio_Dashboard_xlsm_Dashboard.csv** (62 rows)
- ❌ **4 duplicate rows**
- ❌ **39 rows with inconsistent column count** (expected 52 columns)

#### **raw_Portfolio_Dashboard_xlsm_HUD_Rate_Stress_Test.csv** (72 rows)
- ❌ **9 duplicate rows**

#### **raw_Portfolio_Dashboard_xlsm_Pref_Investor_Version.csv** (57 rows)
- ❌ **5 duplicate rows**
- ❌ **10 rows with inconsistent column count** (expected 8 columns)

#### **raw_Portfolio_Dashboard_xlsm_Property_Metrics.csv** (47 rows)
- ❌ **4 duplicate rows**
- ❌ **23 rows with inconsistent column count** (expected 29 columns)

---

## 🔍 Key Findings

### 1. **Name Standardization Issue**
The flat exports use project names without ", LLC" suffix, but the database stores them with the suffix. This causes:
- Projects not matching between CSV and database
- Loans not linking to projects
- Data sync issues

**Solution:** Standardize naming convention - either:
- Update CSV exports to include ", LLC" suffix
- Update database to remove ", LLC" suffix
- Add name normalization logic in import/export scripts

### 2. **Column Count Inconsistencies**
Many files have rows with varying column counts, likely due to:
- Quoted fields containing commas (e.g., "Hammond, LA")
- Multi-line fields
- CSV parsing issues

**Solution:** Improve CSV parsing to handle quoted fields and multi-line values correctly

### 3. **Duplicate Rows**
Raw export files contain duplicate rows, which may be:
- Intentional (same data in multiple sections)
- Export artifacts
- Data quality issues

**Solution:** Review duplicates to determine if they're legitimate or should be deduplicated

### 4. **Invalid Data Types**
Some loan amounts are non-numeric, likely due to:
- Text values like "N/A" or "-"
- Formatted numbers with special characters
- Empty values

**Solution:** Add data cleaning/normalization before import

---

## 📊 Summary Statistics

| File Type | Total Files | Files with Issues | Clean Files |
|-----------|-------------|-------------------|-------------|
| **Normalized** (projects, loans, etc.) | 6 | 3 | 3 |
| **Raw Exports** | 11 | 10 | 1 |
| **Total** | 17 | 13 | 4 |

---

## 🎯 Recommendations

### High Priority
1. **Fix name standardization** - Resolve ", LLC" suffix mismatches
2. **Fix CSV parsing** - Handle quoted fields and multi-line values correctly
3. **Clean invalid loan amounts** - Convert text values to NULL or proper numbers

### Medium Priority
4. **Review duplicates** - Determine if duplicates are intentional
5. **Add data validation** - Validate data types and required fields before export

### Low Priority
6. **Standardize export format** - Ensure consistent column counts
7. **Add export metadata** - Include export date, version, source info

---

## 🔧 Next Steps

1. **Create normalization script** to handle name variations
2. **Improve CSV parser** to handle quoted fields correctly
3. **Add data validation** before import/export
4. **Review duplicate rows** to determine if they're legitimate
5. **Update import scripts** to handle name variations

---

*Review completed: $(date)*
*Review script: `api/scripts/review-flat-exports.ts`*
