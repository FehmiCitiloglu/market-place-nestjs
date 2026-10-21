# ADR-007: Opaque Server-Side Sessions with Cookies and CSRF Protection

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

Browser authentication must resist token theft, session fixation, and CSRF; roles include privileged staff; sensitive operations need re-authentication. Options: stateless JWT in cookies/storage, opaque server-side sessions in cookies, and (later) separate bearer tokens for integrations.

## Options considered

1. **JWT (HS256/RS256) as browser session** — stateless verification; revocation is hard, token lifetime = exposure window, storage choice (localStorage vs cookie) is a footgun, key rotation is operationally real work.
2. **Opaque random session tokens, server-side state, HttpOnly cookies** — instant revocation, rotation, and introspection; server state is cheap (PostgreSQL) and already required.
3. **Third-party IdP/OIDC** — outsourced auth; adds dependency and demo complexity, out of Phase 0 scope.

## Decision

- Session token: 256-bit cryptographically random opaque value; stored **SHA-256 hashed** in `sessions.token_hash`; raw value exists only in the client cookie.
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefix where deployment allows, `Path=/`.
- Session rotation on login and on privilege elevation; server-side revocation on logout and on `SessionRevoked`.
- Passwords: Argon2id with OWASP parameters (configured default `m=19456, t=2, p=1`, 32-byte salt, 32-byte hash — rationale: OWASP password-hashing guidance; tunable by config).
- Password reset: single-use, time-limited (default 60 min), stored hashed; email verification tokens same pattern (default 24 h).
- CSRF: double-submit HMAC token (per-session key bound to the session id, rotated with it) **plus** `Origin`/`Sec-Fetch-Site` validation on every cookie-authenticated state-changing request; explicit CORS allowlist.
- Re-authentication (password or MFA) required for sensitive operations (role changes, payout changes, API-credential management) within a freshness window (default 10 min).
- MFA (TOTP) required for `administrator` and `moderator` in a later phase; `mfa_credentials` table exists from Phase 0.

## Consequences

- Positive: immediate revocation, small client-side secret, no algorithm confusion or kid attacks, straightforward audit (session row = actor context).
- Negative: every request costs a session lookup (indexed, acceptable); horizontal scaling relies on shared PostgreSQL (already the design); API-to-API integrations cannot reuse the cookie flow — if bearer tokens are added later, they are a separate standards-aligned flow with scoped grants, never a JWT fork of the browser session.
- Logout-all / suspicious-session revocation is trivial (update `revoked_at`).

## Reversal criteria

If a genuinely stateless deployment requirement appears (no shared session store at edge), revisit with a threat model update; any move to tokens must preserve revocation semantics for privileged roles.
