# Authentication Setup Complete ✅

## What Was Created

1. **Database Table**: `auth.User` - Stores Capital Markets user accounts
2. **Backend API**: Authentication endpoints at `/api/auth/*`
3. **Protected Routes**: All banking dashboard write operations require authentication
4. **User Accounts**: 2 accounts created with hashed passwords

## User Accounts

- **Username**: `arovner@stoagroup.com` / **Password**: `CapitalMarkets26`
- **Username**: `Mmurray@stoagroup.com` / **Password**: `CapitalMarkets26`

## Testing the Authentication

### 1. Start the API Server

```bash
cd api
npm run dev
```

The API will run on `http://localhost:3000` (or your configured PORT)

### 2. Test Login Endpoint

Using cURL:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "arovner@stoagroup.com",
    "password": "CapitalMarkets26"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "userId": 1,
      "username": "arovner@stoagroup.com",
      "email": "arovner@stoagroup.com",
      "fullName": "Alec Rovner"
    }
  }
}
```

### 3. Test Protected Banking Endpoint

First, get a token from login, then use it:

```bash
# Login and save token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"arovner@stoagroup.com","password":"CapitalMarkets26"}' \
  | jq -r '.data.token')

# Use token to create a loan (protected endpoint)
curl -X POST http://localhost:3000/api/banking/loans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "ProjectId": 1,
    "LoanPhase": "Construction",
    "LoanAmount": 5000000,
    "LoanClosingDate": "2024-01-15",
    "FinancingStage": "Construction Loan"
  }'
```

### 4. Test Without Authentication (Should Fail)

```bash
# This should return 401 Unauthorized
curl -X POST http://localhost:3000/api/banking/loans \
  -H "Content-Type: application/json" \
  -d '{
    "ProjectId": 1,
    "LoanPhase": "Construction"
  }'
```

Expected response:
```json
{
  "success": false,
  "error": {
    "message": "No token provided. Authorization header must be: Bearer <token>"
  }
}
```

## Using in Frontend (JavaScript/TypeScript)

### Option 1: Using the API Client (`api-client.js`)

```javascript
import { login, createLoan, setAuthToken } from './api-client.js';

// Login
const loginResult = await login('arovner@stoagroup.com', 'CapitalMarkets26');
if (loginResult.success) {
  console.log('Logged in as:', loginResult.data.user.username);
  // Token is automatically stored for future requests
  
  // Now you can make authenticated requests
  const loanData = {
    ProjectId: 1,
    LoanPhase: 'Construction',
    LoanAmount: 5000000,
    LoanClosingDate: '2024-01-15'
  };
  
  const result = await createLoan(loanData);
  console.log('Loan created:', result.data);
}
```

### Option 2: Using Fetch Directly

```javascript
// Login
const loginResponse = await fetch('https://stoagroupdb-ddre.onrender.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'arovner@stoagroup.com',
    password: 'CapitalMarkets26'
  })
});

const loginData = await loginResponse.json();
const token = loginData.data.token;

// Store token (e.g., in localStorage)
localStorage.setItem('authToken', token);

// Use token for authenticated requests
const loanResponse = await fetch('https://stoagroupdb-ddre.onrender.com/api/banking/loans', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    ProjectId: 1,
    LoanPhase: 'Construction',
    LoanAmount: 5000000
  })
});
```

## Protected Endpoints

All **POST, PUT, DELETE** operations on these routes require authentication:

- `/api/banking/loans` (POST, PUT, DELETE)
- `/api/banking/dscr-tests` (POST, PUT, DELETE)
- `/api/banking/participations` (POST, PUT, DELETE)
- `/api/banking/guarantees` (POST, PUT, DELETE)
- `/api/banking/covenants` (POST, PUT, DELETE)
- `/api/banking/liquidity-requirements` (POST, PUT, DELETE)
- `/api/banking/bank-targets` (POST, PUT, DELETE)
- `/api/banking/equity-commitments` (POST, PUT, DELETE)

**GET operations are public** and don't require authentication (for Domo integration).

## Environment Variables

Make sure your `.env` file includes:

```env
# JWT Secret (change this in production!)
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=24h
```

## Security Notes

1. **Change JWT_SECRET**: Use a strong, random secret in production
2. **Token Expiration**: Tokens expire after 24 hours (configurable via `JWT_EXPIRES_IN`)
3. **HTTPS**: Always use HTTPS in production
4. **Password Storage**: Passwords are hashed with bcrypt (10 rounds)

## Troubleshooting

### "No token provided" error
- Make sure you're including the `Authorization: Bearer <token>` header
- Check that the token hasn't expired

### "Invalid or expired token" error
- Token may have expired (default: 24 hours)
- Re-login to get a new token

### Connection errors
- Verify your `.env` file has correct database credentials
- Check that the API server is running

## Next Steps

1. ✅ Authentication system is ready
2. ✅ Users are created
3. 🔄 Test login endpoint
4. 🔄 Integrate authentication into your frontend
5. 🔄 Deploy to production (remember to change JWT_SECRET!)
