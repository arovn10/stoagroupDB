# 🚀 Your API is Live!

## API URL
```
https://stoagroupdb-ddre.onrender.com
```

---

## ✅ Quick Test

### Health Check
Open in browser or use curl:
```
https://stoagroupdb-ddre.onrender.com/health
```

### API Documentation
```
https://stoagroupdb-ddre.onrender.com/api
```

---

## 📝 Example API Calls

### Create a Project
```bash
curl -X POST https://stoagroupdb-ddre.onrender.com/api/core/projects \
  -H "Content-Type: application/json" \
  -d '{
    "ProjectName": "Test Project",
    "City": "Baton Rouge",
    "State": "LA",
    "Units": 100
  }'
```

### Update a Project
```bash
curl -X PUT https://stoagroupdb-ddre.onrender.com/api/core/projects/1 \
  -H "Content-Type: application/json" \
  -d '{
    "Units": 150,
    "Stage": "Stabilized"
  }'
```

### Create a Loan
```bash
curl -X POST https://stoagroupdb-ddre.onrender.com/api/banking/loans \
  -H "Content-Type: application/json" \
  -d '{
    "ProjectId": 1,
    "LoanPhase": "Construction",
    "LoanAmount": 15000000,
    "LoanClosingDate": "2024-01-15"
  }'
```

---

## 🌐 Use in Domo

In Domo DataFlows or Magic ETL Custom Script:

```javascript
const apiUrl = 'https://stoagroupdb-ddre.onrender.com/api/core/projects';

const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    ProjectName: input.ProjectName,
    City: input.City,
    State: input.State,
    Units: input.Units
  })
});

return await response.json();
```

---

## 📋 All Available Endpoints

### Core
- `POST /api/core/projects` - Create project
- `PUT /api/core/projects/:id` - Update project
- `POST /api/core/banks` - Create bank
- `PUT /api/core/banks/:id` - Update bank

### Banking
- `POST /api/banking/loans` - Create loan
- `PUT /api/banking/loans/:id` - Update loan
- `POST /api/banking/participations` - Create participation
- `PUT /api/banking/participations/:id` - Update participation

### Pipeline
- `POST /api/pipeline/under-contracts` - Create under contract
- `PUT /api/pipeline/under-contracts/:id` - Update under contract

**See full list:** `GET https://stoagroupdb-ddre.onrender.com/api`

---

## 🔒 Security Notes

- ✅ API uses HTTPS (secure)
- ✅ Database credentials stored in Render (not in code)
- ✅ CORS configured for your domains
- ✅ All queries use parameterized statements (SQL injection protection)

---

## 🎯 Next Steps

1. ✅ API is deployed and running
2. Test the health endpoint
3. Try creating/updating a record
4. Integrate with Domo using the API URL above
5. Monitor Render dashboard for logs and metrics

---

**Your API is ready to use!** 🎉
