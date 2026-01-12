# Complete API CRUD Reference

## ✅ All CRUD Operations Available

Every data point in the database now has full CRUD (Create, Read, Update, Delete) operations available via REST API.

---

## 📋 Core Schema (`/api/core`)

### Projects
- **GET** `/api/core/projects` - Get all projects
- **GET** `/api/core/projects/:id` - Get project by ID
- **POST** `/api/core/projects` - Create new project
- **PUT** `/api/core/projects/:id` - Update project
- **DELETE** `/api/core/projects/:id` - Delete project

### Banks
- **GET** `/api/core/banks` - Get all banks
- **GET** `/api/core/banks/:id` - Get bank by ID
- **POST** `/api/core/banks` - Create new bank
- **PUT** `/api/core/banks/:id` - Update bank
- **DELETE** `/api/core/banks/:id` - Delete bank

### Persons
- **GET** `/api/core/persons` - Get all persons
- **GET** `/api/core/persons/:id` - Get person by ID
- **POST** `/api/core/persons` - Create new person
- **PUT** `/api/core/persons/:id` - Update person
- **DELETE** `/api/core/persons/:id` - Delete person

### Equity Partners
- **GET** `/api/core/equity-partners` - Get all equity partners
- **GET** `/api/core/equity-partners/:id` - Get equity partner by ID
- **POST** `/api/core/equity-partners` - Create new equity partner
- **PUT** `/api/core/equity-partners/:id` - Update equity partner
- **DELETE** `/api/core/equity-partners/:id` - Delete equity partner

---

## 🏦 Banking Schema (`/api/banking`)

### Loans
- **GET** `/api/banking/loans` - Get all loans
- **GET** `/api/banking/loans/:id` - Get loan by ID
- **GET** `/api/banking/loans/project/:projectId` - Get loans by project
- **POST** `/api/banking/loans` - Create new loan
- **PUT** `/api/banking/loans/:id` - Update loan
- **PUT** `/api/banking/loans/project/:projectId` - Update loan by project (convenience)
- **DELETE** `/api/banking/loans/:id` - Delete loan

### DSCR Tests
- **GET** `/api/banking/dscr-tests` - Get all DSCR tests
- **GET** `/api/banking/dscr-tests/:id` - Get DSCR test by ID
- **GET** `/api/banking/dscr-tests/project/:projectId` - Get DSCR tests by project
- **POST** `/api/banking/dscr-tests` - Create new DSCR test
- **PUT** `/api/banking/dscr-tests/:id` - Update DSCR test
- **DELETE** `/api/banking/dscr-tests/:id` - Delete DSCR test

### Participations
- **GET** `/api/banking/participations` - Get all participations
- **GET** `/api/banking/participations/:id` - Get participation by ID
- **GET** `/api/banking/participations/project/:projectId` - Get participations by project
- **POST** `/api/banking/participations` - Create new participation
- **POST** `/api/banking/participations/project/:projectId` - Create participation by project (convenience)
- **PUT** `/api/banking/participations/:id` - Update participation
- **DELETE** `/api/banking/participations/:id` - Delete participation

### Guarantees
- **GET** `/api/banking/guarantees` - Get all guarantees
- **GET** `/api/banking/guarantees/:id` - Get guarantee by ID
- **GET** `/api/banking/guarantees/project/:projectId` - Get guarantees by project
- **POST** `/api/banking/guarantees` - Create new guarantee
- **POST** `/api/banking/guarantees/project/:projectId` - Create guarantee by project (convenience)
- **PUT** `/api/banking/guarantees/:id` - Update guarantee
- **DELETE** `/api/banking/guarantees/:id` - Delete guarantee

### Covenants
- **GET** `/api/banking/covenants` - Get all covenants
- **GET** `/api/banking/covenants/:id` - Get covenant by ID
- **GET** `/api/banking/covenants/project/:projectId` - Get covenants by project
- **POST** `/api/banking/covenants` - Create new covenant
- **POST** `/api/banking/covenants/project/:projectId` - Create covenant by project (convenience)
- **PUT** `/api/banking/covenants/:id` - Update covenant
- **DELETE** `/api/banking/covenants/:id` - Delete covenant

### Liquidity Requirements
- **GET** `/api/banking/liquidity-requirements` - Get all liquidity requirements
- **GET** `/api/banking/liquidity-requirements/:id` - Get liquidity requirement by ID
- **GET** `/api/banking/liquidity-requirements/project/:projectId` - Get liquidity requirements by project
- **POST** `/api/banking/liquidity-requirements` - Create new liquidity requirement
- **PUT** `/api/banking/liquidity-requirements/:id` - Update liquidity requirement
- **DELETE** `/api/banking/liquidity-requirements/:id` - Delete liquidity requirement

### Bank Targets
- **GET** `/api/banking/bank-targets` - Get all bank targets
- **GET** `/api/banking/bank-targets/:id` - Get bank target by ID
- **POST** `/api/banking/bank-targets` - Create new bank target
- **PUT** `/api/banking/bank-targets/:id` - Update bank target
- **DELETE** `/api/banking/bank-targets/:id` - Delete bank target

### Equity Commitments
- **GET** `/api/banking/equity-commitments` - Get all equity commitments
- **GET** `/api/banking/equity-commitments/:id` - Get equity commitment by ID
- **GET** `/api/banking/equity-commitments/project/:projectId` - Get equity commitments by project
- **POST** `/api/banking/equity-commitments` - Create new equity commitment
- **PUT** `/api/banking/equity-commitments/:id` - Update equity commitment
- **DELETE** `/api/banking/equity-commitments/:id` - Delete equity commitment

---

## 🏗️ Pipeline Schema (`/api/pipeline`)

### Under Contracts
- **GET** `/api/pipeline/under-contracts` - Get all under contract records
- **GET** `/api/pipeline/under-contracts/:id` - Get under contract by ID
- **POST** `/api/pipeline/under-contracts` - Create new under contract record
- **PUT** `/api/pipeline/under-contracts/:id` - Update under contract record
- **DELETE** `/api/pipeline/under-contracts/:id` - Delete under contract record

### Commercial Listed
- **GET** `/api/pipeline/commercial-listed` - Get all commercial listed records
- **GET** `/api/pipeline/commercial-listed/:id` - Get commercial listed by ID
- **POST** `/api/pipeline/commercial-listed` - Create new commercial listed record
- **PUT** `/api/pipeline/commercial-listed/:id` - Update commercial listed record
- **DELETE** `/api/pipeline/commercial-listed/:id` - Delete commercial listed record

### Commercial Acreage
- **GET** `/api/pipeline/commercial-acreage` - Get all commercial acreage records
- **GET** `/api/pipeline/commercial-acreage/:id` - Get commercial acreage by ID
- **POST** `/api/pipeline/commercial-acreage` - Create new commercial acreage record
- **PUT** `/api/pipeline/commercial-acreage/:id` - Update commercial acreage record
- **DELETE** `/api/pipeline/commercial-acreage/:id` - Delete commercial acreage record

### Closed Properties
- **GET** `/api/pipeline/closed-properties` - Get all closed property records
- **GET** `/api/pipeline/closed-properties/:id` - Get closed property by ID
- **POST** `/api/pipeline/closed-properties` - Create new closed property record
- **PUT** `/api/pipeline/closed-properties/:id` - Update closed property record
- **DELETE** `/api/pipeline/closed-properties/:id` - Delete closed property record

---

## 📊 Summary

### Total Endpoints by Operation:
- **GET (Read)**: 30+ endpoints
- **POST (Create)**: 16 endpoints
- **PUT (Update)**: 16 endpoints
- **DELETE (Delete)**: 16 endpoints

### Total Data Points with Full CRUD:
- **Core**: 4 tables (Projects, Banks, Persons, Equity Partners)
- **Banking**: 8 tables (Loans, DSCR Tests, Participations, Guarantees, Covenants, Liquidity Requirements, Bank Targets, Equity Commitments)
- **Pipeline**: 4 tables (Under Contracts, Commercial Listed, Commercial Acreage, Closed Properties)

**Total: 16 tables with complete CRUD operations**

---

## 🔍 API Documentation

Visit `/api` endpoint for interactive API documentation:
```
GET http://your-api-url/api
```

## ❤️ Health Check

Check API and database connection status:
```
GET http://your-api-url/health
```

---

## 📝 Notes

1. **All endpoints return JSON** with `{ success: boolean, data: any, error?: { message: string } }` format
2. **Foreign key constraints** are enforced - you cannot delete records with dependencies
3. **Unique constraints** are enforced - duplicate names/values will return 409 Conflict
4. **Convenience endpoints** exist for common operations (e.g., create by project ID)
5. **All DELETE operations** check for foreign key constraints and return appropriate errors

---

*Last Updated: Complete CRUD Implementation v1.0*
