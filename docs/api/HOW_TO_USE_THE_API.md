# How to Use Your Render API

Your API is live and ready to use at:
```
https://stoagroupdb.onrender.com
```

---

## 🚀 Quick Start

### Test the API is Working

**Health Check:**
```bash
curl https://stoagroupdb.onrender.com/health
```

**API Documentation:**
```bash
curl https://stoagroupdb.onrender.com/api
```

Or open in your browser:
- Health: https://stoagroupdb.onrender.com/health
- Docs: https://stoagroupdb.onrender.com/api

---

## 📝 Making API Calls

### Create a Project

```bash
curl -X POST https://stoagroupdb.onrender.com/api/core/projects \
  -H "Content-Type: application/json" \
  -d '{
    "ProjectName": "New Project",
    "City": "Baton Rouge",
    "State": "LA",
    "Region": "Gulf Coast",
    "Location": "Baton Rouge, LA",
    "Units": 200,
    "ProductType": "Heights",
    "Stage": "Started"
  }'
```

### Update a Project

```bash
curl -X PUT https://stoagroupdb.onrender.com/api/core/projects/1 \
  -H "Content-Type: application/json" \
  -d '{
    "Units": 250,
    "Stage": "Stabilized"
  }'
```

### Create a Loan

```bash
curl -X POST https://stoagroupdb.onrender.com/api/banking/loans \
  -H "Content-Type: application/json" \
  -d '{
    "ProjectId": 1,
    "LoanPhase": "Construction",
    "LoanType": "LOC - Construction",
    "LenderId": 5,
    "LoanAmount": 15000000,
    "LoanClosingDate": "2024-01-15",
    "MaturityDate": "2025-12-31"
  }'
```

### Update a Loan

```bash
curl -X PUT https://stoagroupdb.onrender.com/api/banking/loans/10 \
  -H "Content-Type: application/json" \
  -d '{
    "LoanAmount": 16000000,
    "MaturityDate": "2026-12-31"
  }'
```

---

## 🌐 Using in Domo

### Option 1: Domo DataFlow with Custom Script

1. Go to **DataFlows** in Domo
2. Create a new DataFlow
3. Add your dataset as input
4. Add **"Custom Script"** step
5. Use this code:

```javascript
// In Domo Custom Script
const apiUrl = 'https://stoagroupdb.onrender.com/api/core/projects';

const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    ProjectName: input.ProjectName,
    City: input.City,
    State: input.State,
    Region: input.Region,
    Location: input.Location,
    Units: input.Units,
    ProductType: input.ProductType,
    Stage: input.Stage
  })
});

const result = await response.json();
return result;
```

### Option 2: Domo Magic ETL

1. Create a Magic ETL pipeline
2. Add **"Custom Script"** transform
3. Use the same JavaScript code as above

---

## 📋 Available Endpoints

### Core Entities

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/core/projects` | POST | Create new project |
| `/api/core/projects/:id` | PUT | Update project |
| `/api/core/banks` | POST | Create new bank |
| `/api/core/banks/:id` | PUT | Update bank |
| `/api/core/persons` | POST | Create new person |
| `/api/core/persons/:id` | PUT | Update person |
| `/api/core/equity-partners` | POST | Create equity partner |
| `/api/core/equity-partners/:id` | PUT | Update equity partner |

### Banking

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/banking/loans` | POST | Create new loan |
| `/api/banking/loans/:id` | PUT | Update loan |
| `/api/banking/participations` | POST | Create participation |
| `/api/banking/participations/:id` | PUT | Update participation |
| `/api/banking/guarantees` | POST | Create guarantee |
| `/api/banking/guarantees/:id` | PUT | Update guarantee |
| `/api/banking/dscr-tests` | POST | Create DSCR test |
| `/api/banking/dscr-tests/:id` | PUT | Update DSCR test |
| `/api/banking/covenants` | POST | Create covenant |
| `/api/banking/covenants/:id` | PUT | Update covenant |
| `/api/banking/liquidity-requirements` | POST | Create liquidity requirement |
| `/api/banking/liquidity-requirements/:id` | PUT | Update liquidity requirement |
| `/api/banking/bank-targets` | POST | Create bank target |
| `/api/banking/bank-targets/:id` | PUT | Update bank target |
| `/api/banking/equity-commitments` | POST | Create equity commitment |
| `/api/banking/equity-commitments/:id` | PUT | Update equity commitment |

### Pipeline

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pipeline/under-contracts` | POST | Create under contract |
| `/api/pipeline/under-contracts/:id` | PUT | Update under contract |
| `/api/pipeline/commercial-listed` | POST | Create commercial listed |
| `/api/pipeline/commercial-listed/:id` | PUT | Update commercial listed |
| `/api/pipeline/commercial-acreage` | POST | Create commercial acreage |
| `/api/pipeline/commercial-acreage/:id` | PUT | Update commercial acreage |
| `/api/pipeline/closed-properties` | POST | Create closed property |
| `/api/pipeline/closed-properties/:id` | PUT | Update closed property |

**See all endpoints:** `GET https://stoagroupdb.onrender.com/api`

---

## 📨 Request Format

### Headers
```
Content-Type: application/json
```

### Request Body (JSON)
```json
{
  "FieldName": "value",
  "AnotherField": 123
}
```

### Response Format

**Success (200/201):**
```json
{
  "success": true,
  "data": {
    "ProjectId": 1,
    "ProjectName": "New Project",
    ...
  }
}
```

**Error (400/404/409):**
```json
{
  "success": false,
  "error": {
    "message": "Error description here"
  }
}
```

---

## 🔧 Using in JavaScript/TypeScript

### Fetch API (Browser/Node.js)

```javascript
// Create a project
async function createProject(projectData) {
  const response = await fetch('https://stoagroupdb.onrender.com/api/core/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(projectData)
  });
  
  const result = await response.json();
  return result;
}

// Update a project
async function updateProject(projectId, updates) {
  const response = await fetch(`https://stoagroupdb.onrender.com/api/core/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates)
  });
  
  const result = await response.json();
  return result;
}

// Usage
const newProject = await createProject({
  ProjectName: "Test Project",
  City: "Baton Rouge",
  State: "LA",
  Units: 100
});

await updateProject(1, { Units: 150 });
```

### Axios (if you prefer)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://stoagroupdb.onrender.com',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Create project
const project = await api.post('/api/core/projects', {
  ProjectName: "Test Project",
  City: "Baton Rouge",
  State: "LA"
});

// Update project
await api.put('/api/core/projects/1', {
  Units: 150
});
```

---

## 🧪 Using Postman

1. **Create a new request**
2. **Set method** to `POST` or `PUT`
3. **Set URL:** `https://stoagroupdb.onrender.com/api/core/projects`
4. **In Headers tab:** Add `Content-Type: application/json`
5. **In Body tab:**
   - Select "raw"
   - Select "JSON"
   - Paste your JSON:
   ```json
   {
     "ProjectName": "Test Project",
     "City": "Baton Rouge",
     "State": "LA",
     "Units": 100
   }
   ```
6. **Click Send**

---

## 🔒 Security Notes

- ✅ API uses HTTPS (secure connection)
- ✅ All queries use parameterized statements (SQL injection protection)
- ✅ CORS is configured for your domains
- ✅ Database credentials stored securely in Render (not in code)
- ✅ Helmet.js security headers enabled

---

## 🐛 Troubleshooting

### Connection Errors

**"Failed to connect"**
- Check that Render service is running (check Render dashboard)
- Verify the URL is correct: `https://stoagroupdb.onrender.com`
- Check your internet connection

**"CORS error"**
- Make sure your domain is in Render's `CORS_ORIGINS` environment variable
- Or set `CORS_ORIGINS=*` in Render (for testing only)

### Database Errors

**"Database connection failed"**
- Check Render logs for database connection errors
- Verify Azure SQL Database firewall allows Render's IP (4.220.49.253)
- Check database credentials in Render environment variables

**"Table not found"**
- Verify your database has the required tables (core.Project, banking.Loan, etc.)
- Check table names match the API expectations

### Validation Errors

**"Field is required"**
- Check that all required fields are included in your request
- See API documentation for required fields: `GET /api`

**"Invalid foreign key"**
- Make sure referenced IDs exist (e.g., ProjectId must exist before creating a Loan)

---

## 📊 Monitoring

### Check API Status

```bash
curl https://stoagroupdb.onrender.com/health
```

### View Logs

- Go to Render dashboard
- Click on your service
- View "Logs" tab for real-time logs

### View Metrics

- Render dashboard shows:
  - Request count
  - Response times
  - Error rates
  - CPU/Memory usage

---

## 💡 Tips

1. **Always test with health check first** - Make sure API is running
2. **Use POST for creating** - Use PUT for updating
3. **Include ID in URL for updates** - `/api/core/projects/:id`
4. **Partial updates work** - Only include fields you want to change
5. **Check response.success** - Always check if request succeeded
6. **Handle errors** - Check for `error` object in response

---

## 🎯 Common Use Cases

### Update Project Units
```bash
PUT /api/core/projects/1
{"Units": 250}
```

### Create a New Loan
```bash
POST /api/banking/loans
{
  "ProjectId": 1,
  "LoanPhase": "Construction",
  "LoanAmount": 15000000
}
```

### Update Loan Amount
```bash
PUT /api/banking/loans/10
{"LoanAmount": 16000000}
```

### Add a New Bank
```bash
POST /api/core/banks
{
  "BankName": "New Bank",
  "City": "New Orleans",
  "State": "LA"
}
```

---

## 📚 More Information

- **Full API Documentation:** `GET https://stoagroupdb.onrender.com/api`
- **Health Check:** `GET https://stoagroupdb.onrender.com/health`
- **Render Dashboard:** https://dashboard.render.com

---

**Your API is ready to use!** 🚀

Just make HTTP requests to `https://stoagroupdb.onrender.com/api/...` and you're good to go!
