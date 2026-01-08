# Missing Fields Analysis

## ✅ What's Already Covered

Most of your data is already in the database! Here's what's covered:

### Banking Dashboard Data ✅
- **Loans** - All fields covered (Birth Order, Borrower, Loan Type, Amounts, Dates, Rates, Spreads, etc.)
- **DSCR Tests** - All 3 tests covered (Test Date, Projected Interest Rate, Requirement, Projected Value)
- **Covenants** - Occupancy covenants covered (Date, Requirement, Projected Value)
- **Liquidity Requirements** - Total and Lending Bank amounts covered
- **Permanent Financing** - Close Date, Lender, Loan Amount covered

### Participants Data ✅
- **Participations** - All fields covered (Bank, Percentage, Exposure, Paid Off)

### Contingent Liabilities ✅
- **Guarantees** - All fields covered (Person, Guarantee %, Guarantee $)
- **Covenants** - Additional covenant details covered

### Targeted Banks ✅
- **BankTarget** table covers: Assets, City, State, Exposure, Contact, Comments

---

## ❌ Missing Fields

### 1. Bank Exposure Data (Missing from `core.Bank` table)

The **Exposure CSV** has these fields that are NOT in the `core.Bank` table:

| Field | Current Status | Needed? |
|-------|---------------|---------|
| **HQ State** | ❌ Missing | ✅ Yes (might be same as State, but could be different) |
| **# of Projects** | ❌ Missing | ⚠️ Calculated (can compute from Participations/Loans) |
| **Total Exposure** | ❌ Missing | ⚠️ Calculated (can compute from Participations) |
| **Hold Limit** | ❌ Missing | ✅ Yes (bank's maximum exposure limit) |
| **per Deal Limit** | ❌ Missing | ✅ Yes (bank's limit per individual deal) |
| **Deposits** | ❌ Missing | ✅ Yes (deposit amount with bank) |
| **Deposit/Loan** | ❌ Missing | ⚠️ Calculated (Deposits / Total Exposure) |

**Recommendation:** Add these fields to `core.Bank` table:
- `HQState` (NVARCHAR(50) NULL) - Headquarters state
- `HoldLimit` (DECIMAL(18,2) NULL) - Maximum total exposure limit
- `PerDealLimit` (DECIMAL(18,2) NULL) - Maximum exposure per deal
- `Deposits` (DECIMAL(18,2) NULL) - Deposit amount with bank

**Note:** `# of Projects` and `Total Exposure` can be calculated from existing data (Participations table), and `Deposit/Loan` is a calculated ratio.

---

## 📋 Summary

### Missing Fields Count: **4 fields** in `core.Bank` table

1. `HQState` - Headquarters state
2. `HoldLimit` - Maximum total exposure limit
3. `PerDealLimit` - Maximum exposure per deal  
4. `Deposits` - Deposit amount with bank

### Calculated Fields (Don't Need to Store):
- `# of Projects` - Can calculate: `COUNT(DISTINCT ProjectId) FROM banking.Participation WHERE BankId = X`
- `Total Exposure` - Can calculate: `SUM(ExposureAmount) FROM banking.Participation WHERE BankId = X`
- `Deposit/Loan` - Can calculate: `Deposits / Total Exposure`

---

## 🔧 Next Steps

Would you like me to:
1. Create a migration script to add these 4 fields to the `core.Bank` table?
2. Update the API controllers to support these new fields?
3. Update the API client documentation?

Let me know and I'll add them!
