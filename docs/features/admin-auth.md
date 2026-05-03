# Admin Authentication Requirements

## 1. Purpose

Protect the shared `/admin` page with a simple admin login flow.

The admin credential is configured through environment variables.

After successful login, the app creates a JWT token and stores it in `localStorage`.

When the user refreshes `/admin`, the app validates the saved token. If the token is valid, the user can access `/admin`. If the token is invalid or expired, the app clears the token and shows the login page.

This feature must not use Supabase.

---

## 2. Scope

This requirement applies to the shared `/admin` page.

The `/admin` page may contain multiple admin sections, such as:

- Lucky Draw admin configuration.
- Quiz admin configuration.

All `/admin` content must be protected behind the login state.

---

## 3. Out of Scope

The following are not required:

- Supabase Auth.
- Supabase Edge Functions.
- Third-party auth providers.
- User registration.
- Password reset.
- Multi-user role management.
- Database-backed user accounts.
- OAuth login.
- Magic link login.
- Refresh token flow.
- Admin user management UI.

---

## 4. Required Environment Variables

Admin credentials and JWT secret must be stored in environment variables.

Required variables:

```env
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_JWT_SECRET=
```

Optional variable:

```env
ADMIN_TOKEN_EXPIRES_IN=12h
```

Rules:

- Do not prefix these variables with `NEXT_PUBLIC_`.
- Do not expose these values to browser code.
- Do not import or read these values in client components.
- Do not store raw username/password in `localStorage`.
- Do not store the JWT secret in `localStorage`.

---

## 5. Important Security Constraint

The browser must not directly compare the submitted username/password against `.env` values.

The browser cannot safely access private environment variables.

Credential verification and JWT signing must happen in trusted Next.js server-side code.

Allowed implementation options:

1. Next.js Route Handler for login and token verification.
2. Next.js Middleware for protecting `/admin` if token is also stored in a cookie.
3. Next.js server-side utility functions used only by Route Handlers or Middleware.

Do not implement credential verification purely in client-side code.

---

## 6. Required Auth Endpoints

Because this feature does not use Supabase, implement small Next.js server-side endpoints for authentication.

Recommended endpoints:

```txt
POST /api/admin/login
POST /api/admin/verify
```

### 6.1 `POST /api/admin/login`

Request body:

```ts
type AdminLoginRequest = {
  username: string;
  password: string;
};
```

Behavior:

1. Read `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_JWT_SECRET` from server environment variables.
2. Validate that all required environment variables exist.
3. Compare submitted credentials against environment credentials in server code.
4. If credentials are invalid, return `401`.
5. If credentials are valid, create a signed JWT token.
6. Return the token to the browser.

Success response:

```ts
type AdminLoginSuccessResponse = {
  token: string;
  expiresAt: number;
};
```

Error response:

```ts
type AdminLoginErrorResponse = {
  error: "INVALID_CREDENTIALS" | "AUTH_CONFIG_MISSING" | "UNKNOWN_ERROR";
  message: string;
};
```

### 6.2 `POST /api/admin/verify`

Request body:

```ts
type AdminVerifyRequest = {
  token: string;
};
```

Behavior:

1. Read `ADMIN_JWT_SECRET` from server environment variables.
2. Verify the JWT signature.
3. Verify token expiration.
4. Verify token payload role is `admin`.
5. If valid, return `valid: true`.
6. If invalid, expired, malformed, or missing, return `valid: false`.

Response:

```ts
type AdminVerifyResponse = {
  valid: boolean;
  expiresAt?: number;
};
```

---

## 7. JWT Requirements

The JWT token must be signed server-side using `ADMIN_JWT_SECRET`.

Recommended payload:

```ts
type AdminJwtPayload = {
  role: "admin";
  iat: number;
  exp: number;
};
```

Rules:

- Token must include `role: "admin"`.
- Token must include issued-at time.
- Token must include expiration time.
- Recommended expiration is 12 hours.
- Expired tokens must be rejected.
- Invalid or malformed tokens must be rejected.

Recommended storage key:

```ts
const ADMIN_AUTH_TOKEN_KEY = "admin-auth-token";
```

After successful login:

```ts
localStorage.setItem(ADMIN_AUTH_TOKEN_KEY, token);
```

---

## 8. `/admin` Page Behavior

When a user opens `/admin`:

1. Check `localStorage` for `admin-auth-token`.
2. If no token exists, show the login page.
3. If a token exists, call `POST /api/admin/verify`.
4. If the token is valid, show the admin page.
5. If the token is invalid, expired, malformed, or verification fails:
   - remove `admin-auth-token` from `localStorage`
   - show the login page

The admin page must not show protected admin content while token validation is still pending.

Show a loading state while validating the token.

---

## 9. Login Page Requirements

The login page should be displayed in place of `/admin` content when the user is not authenticated.

The login form must include:

- Username/account input.
- Password input.
- Submit button.
- Error message area.
- Loading state while submitting.

Login behavior:

1. User enters username and password.
2. Client sends credentials to `POST /api/admin/login`.
3. If login succeeds:
   - save JWT token to `localStorage`
   - show `/admin` content
4. If login fails:
   - show a clear error message
   - do not save anything to `localStorage`

Do not log credentials.

Do not display raw credential details in errors.

---

## 10. Logout Requirements

The `/admin` page must include a logout action.

Logout behavior:

```ts
localStorage.removeItem("admin-auth-token");
```

After logout:

- Clear local admin auth state.
- Show the login page.
- Do not clear unrelated feature data unless explicitly requested.

---

## 11. Client State Requirements

The client may use local React state or Zustand for admin auth UI state.

Recommended auth state:

```ts
type AdminAuthState =
  | { status: "checking" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; expiresAt: number }
  | { status: "error"; message: string };
```

Do not use this client state as proof of authentication without token verification.

The token must be verified after page refresh.

---

## 12. Middleware Option

Middleware may be used as an additional protection layer if the token is also available in a cookie.

This requirement specifically asks to store the token in `localStorage`.

Since Middleware cannot read `localStorage`, Middleware is optional unless the implementation also stores the token in an httpOnly cookie.

If using only `localStorage`, the `/admin` page must validate the token through `POST /api/admin/verify` before rendering protected content.

---

## 13. Security Rules

- Do not expose `ADMIN_USERNAME`, `ADMIN_PASSWORD`, or `ADMIN_JWT_SECRET` to browser code.
- Do not use `NEXT_PUBLIC_` for admin credentials or JWT secret.
- Do not verify credentials in client-side code.
- Do not store raw credentials in `localStorage`.
- Store only the signed JWT token in `localStorage`.
- Clear invalid or expired tokens automatically.
- Protect all `/admin` content behind the validated auth state.
- Use generic login error messages.
- Do not log passwords or tokens.
- Use short-lived JWT tokens.
- Validate request bodies on auth endpoints.
- Do not use `any`.

---

## 14. Required AGENTS.md Exception

If `AGENTS.md` still forbids Next.js Route Handlers, add a documented exception for admin authentication.

Required exception text:

```md
### Admin Authentication Exception

Next.js Route Handlers are allowed only for admin authentication endpoints:

- `POST /api/admin/login`
- `POST /api/admin/verify`

These endpoints may read server-only environment variables:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`

They must not expose secrets to the browser.

This exception exists because browser code cannot safely read private `.env` values or sign/verify JWTs with a private secret.
```

Do not use this exception for unrelated API features.

---

## 15. Acceptance Criteria

- Visiting `/admin` without a token shows the login page.
- Login with correct username/password succeeds.
- Login with incorrect credentials fails.
- Successful login creates a JWT token.
- The JWT token is saved in `localStorage`.
- Refreshing `/admin` validates the saved token.
- A valid token allows access to `/admin`.
- An invalid, expired, malformed, or unverifiable token is removed from `localStorage`.
- Invalid token state shows the login page.
- Logout removes the token and shows the login page.
- Admin credentials are read only from server-side environment variables.
- Admin credentials and JWT secret are never exposed to browser code.
- No Supabase implementation is used.
