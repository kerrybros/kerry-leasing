# 🧪 Testing Guide - Authentication & Tenant Scoping

This guide walks through testing the hardened backend authentication and strict tenant isolation features.

---

## Overview

The system implements:
- ✅ **JWT Verification**: Clerk token verification on every protected request
- ✅ **Tenant Isolation**: Organization-based data scoping (orgId)
- ✅ **Role-Based Access**: Internal (admin) vs External (member) roles
- ✅ **Clear Error Messages**: 401 Unauthorized, 403 Forbidden

---

## Prerequisites

Before testing:
1. ✅ Both servers running (`pnpm dev` from root)
2. ✅ Frontend accessible (e.g., http://localhost:3007)
3. ✅ API accessible (http://localhost:4000)
4. ✅ Clerk keys configured in `.env` files

---

## Test Suite

### Test 1: User Authentication Flow

**Goal**: Verify Clerk authentication works end-to-end

**Steps**:
1. Open frontend in browser
2. Click **Sign Up**
3. Enter username, email, password
4. Complete sign-up flow
5. You should be redirected to `/app`

**Expected**:
- ✅ Sign-up successful
- ✅ User ID displayed on `/app` page
- ✅ No organization yet (warning shown)

---

### Test 2: Organization Creation

**Goal**: Verify organization context for tenant scoping

**Steps**:
1. After sign-in, Clerk may prompt to create an organization
2. Create an organization (e.g., "Test Company")
3. Check the `/app` page

**Expected**:
- ✅ Organization name displayed
- ✅ Organization ID displayed
- ✅ Warning about missing org is gone
- ✅ "GET /units" button now enabled

---

### Test 3: GET /me Endpoint

**Goal**: Verify JWT verification and auth context extraction

**Steps**:
1. On `/app` page, click **🔑 GET /me** button
2. Check the response

**Expected Response**:
```json
{
  "userId": "user_2abcXYZ123",
  "orgId": "org_2xyzABC456",
  "role": "external"
}
```

**What this proves**:
- ✅ Authorization header with Bearer token sent correctly
- ✅ Backend verified JWT with Clerk
- ✅ Extracted userId from token
- ✅ Extracted orgId from token claims
- ✅ Determined role based on org membership

**Troubleshooting**:
- **401 Error**: Token verification failed - check Clerk keys match
- **Network Error**: Check API is running on port 4000

---

### Test 4: GET /units Endpoint (With Organization)

**Goal**: Verify tenant-scoped endpoint with organization context

**Steps**:
1. Ensure you have an organization selected
2. Click **📦 GET /units** button
3. Check the response

**Expected Response**:
```json
{
  "units": [],
  "count": 0,
  "orgId": "org_2xyzABC456"
}
```

**What this proves**:
- ✅ Tenant guard working (requireOrg middleware)
- ✅ orgId extracted and verified
- ✅ Response scoped to organization
- ✅ Empty array is expected (no database yet)

---

### Test 5: GET /units Endpoint (Without Organization)

**Goal**: Verify tenant guard rejects requests without organization

**Steps**:
1. In Clerk dashboard, remove yourself from the organization
   - Or create a new user without organization
2. Try to click **GET /units**

**Expected**:
- ✅ Button is disabled
- ✅ Warning message shows about missing organization

**If you force the request** (via curl or removing the disabled check):

**Expected Response**:
```json
{
  "error": "Forbidden",
  "message": "Organization context required. Please select an organization."
}
```

**HTTP Status**: `403 Forbidden`

**What this proves**:
- ✅ Backend enforces organization requirement
- ✅ Clear error message for missing org
- ✅ Proper HTTP status code

---

### Test 6: Invalid Token

**Goal**: Verify backend rejects invalid/expired tokens

**Steps**:
1. Open browser DevTools → Network tab
2. Click **GET /me**
3. Copy the request as cURL
4. Modify the token to be invalid
5. Run the modified request

**Example**:
```bash
curl -H "Authorization: Bearer invalid_token_here" http://localhost:4000/me
```

**Expected Response**:
```json
{
  "error": "Unauthorized",
  "message": "Token verification failed"
}
```

**HTTP Status**: `401 Unauthorized`

**What this proves**:
- ✅ Backend validates every token
- ✅ Rejects invalid tokens with 401
- ✅ Clear error message

---

### Test 7: Missing Authorization Header

**Goal**: Verify backend requires auth header

**Steps**:
```bash
curl http://localhost:4000/me
```

**Expected Response**:
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header"
}
```

**HTTP Status**: `401 Unauthorized`

---

### Test 8: Role-Based Access (Internal Only)

**Goal**: Verify role-based authorization

**Steps**:
1. As a regular user (external role), try to access internal endpoint
2. In browser console, run:
```javascript
const token = await window.Clerk.session.getToken();
fetch('http://localhost:4000/admin/stats', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(console.log);
```

**Expected Response** (as external user):
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions. Required roles: internal"
}
```

**HTTP Status**: `403 Forbidden`

**What this proves**:
- ✅ Role extraction working
- ✅ Role-based middleware enforcing access
- ✅ Clear error for insufficient permissions

---

### Test 9: Role Mapping (Admin → Internal)

**Goal**: Verify org admins get "internal" role

**Steps**:
1. In Clerk dashboard, make your user an **org:admin**
2. Refresh the page
3. Click **GET /me**
4. Check the role field

**Expected**:
- ✅ Role should be `"internal"` (not `"external"`)

**What this proves**:
- ✅ Backend queries org membership
- ✅ Maps org:admin → internal
- ✅ Maps other roles → external

---

## Test Results Summary

| Test | Endpoint | Expected | Status |
|------|----------|----------|--------|
| 1 | Sign Up | User created | ✅ |
| 2 | Create Org | Org created | ✅ |
| 3 | GET /me | Auth context | ✅ |
| 4 | GET /units (with org) | Empty units | ✅ |
| 5 | GET /units (no org) | 403 Forbidden | ✅ |
| 6 | Invalid token | 401 Unauthorized | ✅ |
| 7 | Missing header | 401 Unauthorized | ✅ |
| 8 | Role check | 403 Forbidden | ✅ |
| 9 | Admin role | Role = internal | ✅ |

---

## Architecture Reference

### Request Flow

```
1. User signs in with Clerk
   ↓
2. Frontend gets JWT token via getToken()
   ↓
3. Frontend makes API request with Authorization: Bearer <token>
   ↓
4. API middleware verifies token with Clerk
   ↓
5. API extracts userId, orgId, role
   ↓
6. API checks tenant guard (requireOrg)
   ↓
7. API executes handler with req.auth context
   ↓
8. Response returned to frontend
```

### Middleware Stack

```typescript
// Level 1: Authentication
clerkAuthMiddleware → verifies JWT, extracts auth context

// Level 2: Tenant Scoping
requireOrg → enforces orgId exists

// Level 3: Role Authorization
requireRole(['internal']) → enforces specific role

// Handler
(req: AuthRequest, res) => {
  // Access req.auth.userId, req.auth.orgId, req.auth.role
}
```

---

## Manual API Testing (cURL)

### Get Health (Public)
```bash
curl http://localhost:4000/health
```

### Get Auth Context
```bash
# Get token from browser console:
# await window.Clerk.session.getToken()

curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:4000/me
```

### Get Units (Requires Org)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:4000/units
```

### Get Admin Stats (Requires Internal Role)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:4000/admin/stats
```

---

## Troubleshooting

### "Token verification failed"
- **Cause**: Clerk secret key mismatch
- **Fix**: Check `CLERK_SECRET_KEY` in `apps/api/.env` matches Clerk dashboard

### "CORS error"
- **Cause**: Frontend origin not allowed
- **Fix**: Add frontend URL to `ALLOWED_ORIGINS` in `apps/api/.env`

### "Organization context required"
- **Cause**: User has no active organization
- **Fix**: Create/select organization in Clerk UI

### Button disabled for /units
- **Cause**: No organization selected
- **Fix**: Create or select an organization

---

## Next Steps

After verifying auth and tenant scoping:
1. ✅ Add real database connection
2. ✅ Implement actual units CRUD
3. ✅ Add more tenant-scoped endpoints
4. ✅ Add audit logging
5. ✅ Add rate limiting per org

---

**All tests passing?** You have a production-ready auth system with proper tenant isolation! 🎉
