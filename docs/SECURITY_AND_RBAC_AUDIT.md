# MF Pulse / Suasion Securities — Security & RBAC Audit

**Audit Date**: 2026-07-28  
**Scope**: Authentication, Authorization, RBAC, Data Protection, PII Masking, Advisory Locks

---

## 1. Role-Based Access Control (RBAC) Audit

The platform defines 4 clear user roles:
1. **Investor**: Standard consumer (`/invest/*`, `/profile`, `/portfolio`).
2. **Advisor**: Financial advisor (`/advisor/workspace`).
3. **Operations**: System administrator / Back-office (`/operations`).
4. **Management**: Executive leadership (`/management`).

### Verification
- **API Guarding**: Sensitive endpoints under `/api/v1/invest/*`, `/api/v1/portfolio/*`, and `/api/v1/sync/*` verify session user ID via NextAuth context.
- **IDOR Protection**: Requests for portfolios, orders, documents, and notifications assert `where user_id = session.user.id`. Access to another investor's ID returns `403 Forbidden` or `404 Not Found`.

---

## 2. PII & PAN Security Policy

- **No Arbitrary PAN Lookups**: Portfolio data cannot be retrieved by submitting an unauthenticated PAN.
- **Sensitive Data Masking**: PAN, Aadhaar, full bank account numbers, passwords, and tokens are omitted from client-side logs, URLs, `localStorage`, and event dispatch payloads.
- **Password Security**: Passwords hashed using `bcryptjs` with salt round cost factor 12. Account deletion revokes database sessions and soft-deactivates the user row without cascading deletion of financial history.

---

## 3. Advisory Locks & Test Isolation

- **Vitest Concurrency**: Integration tests touching the shared `jobs` table use Postgres advisory locks (`LOCK_KEY = 847_331_009`).
- **Timeout Alignment**: `testClaimLock.js` (`MAX_WAIT_MS = 900,000`) and `vitest.config.js` (`hookTimeout = 1,000_000`) prevent race conditions and lock timeouts during concurrent test runs.
