# Authentication

> Source files: `artifacts/api-server/src/routes/auth.ts`, `artifacts/api-server/src/middleware/auth.ts`, `artifacts/api-server/src/lib/jwt.ts`, `artifacts/api-server/src/lib/config.ts`

---

## Overview

The system uses a **dual-token JWT strategy**:

- **Access token** — short-lived (15 minutes), sent in the `Authorization: Bearer` header on every API call
- **Refresh token** — long-lived (7 days), stored in an **HttpOnly cookie** (`pos_refresh`), never accessible by JavaScript

This pattern limits the window of exposure if an access token is stolen, while the HttpOnly cookie ensures the refresh token cannot be exfiltrated by XSS attacks.

---

## Key Derivation

Both JWT signing keys are derived from a single `SESSION_SECRET` environment variable using HMAC-SHA256 (an HKDF-like construction). This means only one secret needs to be provisioned, but the access and refresh keys are cryptographically independent:

```
SESSION_SECRET ──HMAC-SHA256("pos:jwt:access")──→ accessSecret
SESSION_SECRET ──HMAC-SHA256("pos:jwt:refresh")──→ refreshSecret
```

In **desktop mode**, the `SESSION_SECRET` is a 64-character hex string generated randomly on first startup and stored in `%APPDATA%\ShoeStorePOS\secret.key` with mode `0o600`. It persists across app restarts, so existing sessions remain valid after a relaunch.

---

## Token Specification

### Access Token
```json
{
  "sub": "<userId>",
  "storeId": "<storeId>",
  "roleId": "<roleId>",
  "iss": "pos-api",
  "iat": ...,
  "exp": ... // 15 minutes
}
```

### Refresh Token
```json
{
  "sub": "<userId>",
  "storeId": "<storeId>",
  "sid": "<sessionId>",
  "iss": "pos-api",
  "iat": ...,
  "exp": ... // 7 days
}
```

---

## Auth Endpoints

### `GET /api/auth/setup-status`
No authentication required. Returns:
```json
{
  "storeExists": boolean,
  "isSetupComplete": boolean
}
```
Used by the React app's Gateway component to decide whether to redirect to the setup wizard.

---

### `POST /api/auth/setup`
No authentication required. **One-time only** — returns 409 if setup is already complete.

Request body (validated by `CompleteSetupBody` Zod schema):
```json
{
  "storeName": "...",
  "adminUsername": "...",
  "adminPassword": "...",
  "adminFullName": "...",
  "phone": "...",
  "address": "...",
  "city": "...",
  "currency": "EGP",
  "taxRate": 0,
  "logoUrl": "...",
  "printerWidth": "80mm",
  "paperType": "..."
}
```

What happens inside a **database transaction**:
1. Inserts the `stores` row with `is_setup_complete = true`
2. Inserts all 5 default roles (`Admin`, `Manager`, `Cashier`, `Inventory Staff`, `Accountant`) with their predefined permissions from `DEFAULT_ROLES`
3. Inserts the admin user with the Admin role, hashed password
4. Writes a `setup.completed` audit log entry

---

### `POST /api/auth/login`
No authentication required.

Request body (validated by `LoginBody`):
```json
{
  "username": "...",
  "password": "..."
}
```

**Security behaviors:**

1. **Timing-safe user lookup**: If the username does not exist, the server still runs `verifyPassword()` against a dummy hash to prevent timing-based username enumeration.

2. **Account lockout**: After `maxFailedAttempts` (5) failed attempts, the account is locked for `lockoutMinutes` (15) minutes. The `locked_until` timestamp is stored in the `users` table.

3. **Inactive account check**: Returns 401 if `is_active = false`.

4. **On success**: Resets `failed_login_attempts` to 0, updates `last_login_at`, creates a session row, issues access + refresh tokens.

**Response:**
```json
{
  "accessToken": "<jwt>",
  "user": {
    "id": "...",
    "storeId": "...",
    "username": "...",
    "fullName": "...",
    "role": { "id": "...", "name": "...", "nameAr": "..." },
    "permissions": ["sales.create", "..."],
    "storeName": "..."
  }
}
```

The refresh token is set as an **HttpOnly cookie**:
- Name: `pos_refresh`
- Path: `/api/auth` (only sent to auth endpoints)
- `httpOnly: true`
- `sameSite: strict`
- `secure: true` in production

---

### `POST /api/auth/refresh`
No authentication required. Reads the `pos_refresh` cookie.

**Refresh Token Rotation:**
1. Verifies the JWT signature
2. Loads the session row from the database
3. Validates: session must not be revoked, must not be expired, and `refresh_token_hash` must match `SHA-256(token)` — this prevents replay attacks with stolen tokens
4. **Revokes the used session** (sets `revoked_at`)
5. Creates a **new session** and issues new access + refresh tokens

If a previously-used refresh token is attempted (e.g., replayed by an attacker), the `refresh_token_hash` check fails immediately because the old hash was in the revoked session row.

**Response:** Same shape as `/auth/login`.

---

### `POST /api/auth/logout`
No authentication required (graceful — works even with an invalid token).

Verifies the refresh token cookie, revokes the session row, clears the cookie.

---

### `GET /api/auth/me`
Requires `requireAuth` middleware.

Returns the current user's full profile (same shape as login response user object). Used by the React app to hydrate the auth context on page load.

---

## Auth Middleware

### `requireAuth`
Attached to all protected routes. Flow:

1. Extracts `Bearer <token>` from `Authorization` header
2. Verifies JWT signature and expiry via `verifyAccessToken()`
3. Loads user, role, store from DB using `userId` and `storeId` from the token
4. Validates: user exists, `store_id` matches token's `storeId` (tenant isolation), user is not deleted, user is active
5. Attaches `req.auth: AuthContext` to the request

```typescript
interface AuthContext {
  userId: string;
  storeId: string;
  roleId: string;
  username: string;
  fullName: string;
  permissions: string[]; // from the user's role
  storeName: string;
}
```

### `requirePermission(permission: string)`
Must come after `requireAuth`. Checks `hasPermission(req.auth.permissions, permission)`. Supports wildcards:
- `"*"` in the user's permissions grants everything
- `"module.*"` grants all actions in a module
- Exact match grants that specific action

### `requireAnyPermission(permissions: string[])`
OR-logic version. The request passes if the user has **any** of the listed permissions.

---

## Frontend Auth Flow

The React app in `artifacts/pos/src/lib/auth.tsx` implements:

1. **On mount**: Calls `POST /api/auth/refresh` to silently restore the session (the HttpOnly cookie is sent automatically). If it fails, shows the login page.

2. **On login**: Stores the access token in a **module-level variable** (`currentAccessToken`) — not in `localStorage` or `sessionStorage`. This means the token lives only in memory and is lost on page refresh (which triggers a new silent refresh).

3. **Token injection**: The `setAuthTokenGetter()` call wires the custom fetch client (`lib/api-client-react/src/custom-fetch.ts`) to read `currentAccessToken` and inject it as `Authorization: Bearer`.

4. **Proactive refresh**: The auth context decodes the JWT `exp` claim and schedules a `setTimeout` to refresh the token **60 seconds before it expires**. This keeps the user logged in indefinitely as long as the tab is open.

5. **hasPermission()**: Checks `user.permissions.includes("*") || user.permissions.includes(permission)`. Note: the client-side check does NOT support module wildcards (`module.*`) — it's a simplified check for UI visibility. The authoritative check is always server-side.

---

## Security Hardening Summary

| Threat | Mitigation |
|--------|-----------|
| Token theft via XSS | Refresh token in HttpOnly cookie; access token in memory only |
| Cross-site request forgery | `sameSite: strict` cookie; access token required in header |
| Refresh token replay | Token rotation + hash verification against session row |
| Credential brute force | 5-attempt lockout for 15 minutes |
| Username enumeration | Dummy bcrypt verify run on unknown usernames (timing safety) |
| Tenant data leakage | `storeId` always from JWT, never from request body |
| Stale sessions after user deletion | Auth middleware re-validates user status on every request |
| Supply chain attacks | `minimumReleaseAge: 1440` in pnpm workspace config |
| Password storage | bcrypt with 12 rounds |
| Key management (desktop) | `SESSION_SECRET` derived per-machine, stored at mode `0o600` |
