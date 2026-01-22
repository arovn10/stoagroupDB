# Domo API Integration Guide

## 🎯 Using the Render API from Domo

Your API is live at: **https://stoagroupdb.onrender.com**

Use the `api-client.js` file in Domo Custom Scripts to create and update data.

---

## 📋 Available Endpoints for Data Modification

### Core Entities

**Projects:**
- `POST /api/core/projects` - Create project
- `PUT /api/core/projects/:id` - Update project

**Banks:**
- `POST /api/core/banks` - Create bank
- `PUT /api/core/banks/:id` - Update bank

**Persons:**
- `POST /api/core/persons` - Create person
- `PUT /api/core/persons/:id` - Update person

**Equity Partners:**
- `POST /api/core/equity-partners` - Create equity partner
- `PUT /api/core/equity-partners/:id` - Update equity partner

### Banking

**Loans:**
- `POST /api/banking/loans` - Create loan
- `PUT /api/banking/loans/:id` - Update loan

**Participations:**
- `POST /api/banking/participations` - Create participation
- `PUT /api/banking/participations/:id` - Update participation

**Guarantees:**
- `POST /api/banking/guarantees` - Create guarantee
- `PUT /api/banking/guarantees/:id` - Update guarantee

**DSCR Tests:**
- `POST /api/banking/dscr-tests` - Create DSCR test
- `PUT /api/banking/dscr-tests/:id` - Update DSCR test

**Covenants:**
- `POST /api/banking/covenants` - Create covenant
- `PUT /api/banking/covenants/:id` - Update covenant

**Liquidity Requirements:**
- `POST /api/banking/liquidity-requirements` - Create liquidity requirement
- `PUT /api/banking/liquidity-requirements/:id` - Update liquidity requirement

**Bank Targets:**
- `POST /api/banking/bank-targets` - Create bank target
- `PUT /api/banking/bank-targets/:id` - Update bank target

**Equity Commitments:**
- `POST /api/banking/equity-commitments` - Create equity commitment
- `PUT /api/banking/equity-commitments/:id` - Update equity commitment

### Pipeline

**Under Contracts:**
- `POST /api/pipeline/under-contracts` - Create under contract
- `PUT /api/pipeline/under-contracts/:id` - Update under contract

**Commercial Listed:**
- `POST /api/pipeline/commercial-listed` - Create commercial listed
- `PUT /api/pipeline/commercial-listed/:id` - Update commercial listed

**Commercial Acreage:**
- `POST /api/pipeline/commercial-acreage` - Create commercial acreage
- `PUT /api/pipeline/commercial-acreage/:id` - Update commercial acreage

**Closed Properties:**
- `POST /api/pipeline/closed-properties` - Create closed property
- `PUT /api/pipeline/closed-properties/:id` - Update closed property

---

## 💻 Domo Custom Script Example

```javascript
// Copy api-client.js functions here, then use:

// Example: Update a loan amount
const result = await updateLoan(1, {
  LoanAmount: 50000000
});

// Example: Create a new participation
const participation = await createParticipation({
  ProjectId: 4,
  LoanId: 4,
  BankId: 4,
  ParticipationPercent: "32.0%",
  ExposureAmount: 15998489,
  PaidOff: false
});

// Example: Update a guarantee
await updateGuarantee(1, {
  GuaranteePercent: 50,
  GuaranteeAmount: 22849
});
```

---

## 📝 Common Use Cases

### Update Loan Details
```javascript
await updateLoan(loanId, {
  LoanAmount: newAmount,
  Spread: "0.75%",
  IOMaturityDate: "2025-12-31"
});
```

### Add a Participation
```javascript
await createParticipation({
  ProjectId: projectId,
  LoanId: loanId,
  BankId: bankId,
  ParticipationPercent: "25.0%",
  ExposureAmount: 5000000,
  PaidOff: false
});
```

### Update DSCR Test
```javascript
await updateDSCRTest(testId, {
  ProjectedValue: "1.25",
  TestDate: "2025-12-31"
});
```

### Add a Guarantee
```javascript
await createGuarantee({
  ProjectId: projectId,
  PersonId: personId, // 1=Toby, 2=Ryan, 3=Saun
  GuaranteePercent: 100,
  GuaranteeAmount: 50000
});
```

---

## 🔗 API Client File

See `api-client.js` for all available functions. Copy the entire file into your Domo Custom Script.

---

**All endpoints use: https://stoagroupdb.onrender.com**
