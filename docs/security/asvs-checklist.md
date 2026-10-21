# OWASP ASVS 5.0.0 Mapping — Selected Control Areas

Status: Phase 0. This is a **mapping of selected ASVS 5.0.0 control areas to planned implementation and verification**, with honest status values. This is **not** a claim of ASVS compliance, certification, or assessment. The full ASVS checklist is not asserted; only the control areas Mercato's Phase 0 design addresses are listed. Status vocabulary: `planned` (designed, not implemented), `implemented` (code exists), `verified by test X` (test suite exists and passes) — as of Phase 0 everything is `planned` unless noted.

## 1. Architecture (V1)

| ASVS area                                               | Planned implementation                                                            | Verification method                                      | Status                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| V1.1 Secure software architecture                       | Threat model, security architecture doc, ADRs                                     | doc review in PR checklist                               | planned (docs exist: `docs/security/threat-model.md`) |
| V1.2 Authentication architecture                        | Opaque server-side sessions, Argon2id, rotation (ADR-007)                         | `tests/security/authentication.test.ts`                  | planned                                               |
| V1.3 Access control architecture                        | RBAC + ownership guards, access matrix                                            | `tests/security/access-control.test.ts` (matrix-derived) | planned                                               |
| V1.4 Input/output architecture                          | zod at every trust boundary, Problem Details errors, output encoding in templates | `tests/integration/error-contract.test.ts`, lint rules   | planned                                               |
| V1.5 Cryptographic architecture                         | Argon2id, SHA-256 token hashing, HMAC-SHA256 webhooks/CSRF, TLS at edge           | `tests/security/webhook-signature.test.ts`               | planned                                               |
| V1.6 Architecture risks from ASVS-integrated components | mock provider is a test double, isolated behind `PaymentProvider` interface       | ADR-010 review                                           | planned                                               |
| V1.7 Parameterized code / no string-built SQL           | Drizzle bound params; raw SQL always parameterized                                | `tests/security/sql-injection.test.ts` + lint            | planned                                               |
| V1.8 Data protection architecture                       | data classification + retention table (`security-architecture.md`)                | review + retention job tests                             | planned                                               |

## 2. Authentication (V2)

| ASVS area                     | Planned implementation                                                                  | Verification                            | Status                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------- |
| Password storage hardness     | Argon2id, configured default m=19456, t=2, p=1, 32-byte salt                            | unit test on hash/verify parameters     | planned                                  |
| Generic auth failure messages | uniform `invalid-credentials` Problem Details                                           | `tests/security/authentication.test.ts` | planned                                  |
| Credential recovery           | single-use hashed reset tokens, 60 min TTL, rotation on use                             | token single-use test                   | planned                                  |
| Session lifecycle             | rotation on login/privilege elevation, revocation, absolute + idle TTLs                 | session lifecycle tests                 | planned                                  |
| Session token properties      | 256-bit random, SHA-256 at rest, HttpOnly/Secure/SameSite                               | cookie-flag assertions in tests         | planned                                  |
| MFA                           | TOTP required for administrator/moderator (later phase, `mfa_credentials` table exists) | MFA tests (future suite)                | planned (explicitly not yet implemented) |
| Anti-automation               | rate limits per IP/account on login/reset                                               | rate-limit tests                        | planned                                  |

## 3. Session Management (V3)

| ASVS area                         | Planned implementation                                         | Verification                         | Status  |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------ | ------- |
| Cookie attributes                 | `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` where possible | integration assertions on Set-Cookie | planned |
| Session expiry                    | idle + absolute TTLs (configured defaults 7 d / 30 d)          | expiry tests                         | planned |
| Session invalidation              | logout + revoke-all + `SessionRevoked` event                   | revocation tests                     | planned |
| CSRF on cookie-auth state changes | double-submit HMAC + Origin/Sec-Fetch-Site                     | `tests/security/csrf.test.ts`        | planned |

## 4. Access Control (V4)

| ASVS area                              | Planned implementation                                                          | Verification                            | Status  |
| -------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------- | ------- |
| Deny by default                        | unlisted operations denied                                                      | matrix-derived tests                    | planned |
| Ownership enforcement                  | every user-scoped resource checked                                              | `tests/security/access-control.test.ts` | planned |
| Vertical privilege separation          | matrix §8 non-capabilities (seller≠payment status, support≠impersonation, etc.) | named tests per non-capability          | planned |
| Horizontal privilege separation        | 404 on non-owned resources                                                      | tests for orders/products/stores        | planned |
| Static content vs privileged endpoints | `/docs` disabled in prod config                                                 | config test + deployment check          | planned |
| Anti-CSRF + CORS allowlist             | explicit allowlist, no wildcard with credentials                                | `tests/security/cors.test.ts`           | planned |

## 5. Validation, Sanitization, Encoding (V5)

| ASVS area                     | Planned implementation                                                       | Verification                               | Status  |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ | ------- |
| Validation on every boundary  | zod strict schemas; unknown fields rejected                                  | per-endpoint validation tests              | planned |
| Canonicalization/safe parsing | JSON schema limits, body size caps                                           | `tests/security/input-limits.test.ts`      | planned |
| Output encoding               | JSON-only API; template escaping in emails                                   | email template tests                       | planned |
| No SQL injection              | parameterized SQL only                                                       | `tests/security/sql-injection.test.ts`     | planned |
| No SSRF                       | no arbitrary server-side URL fetching                                        | `tests/security/ssrf.test.ts`              | planned |
| File upload validation        | magic-byte sniffing, MIME allowlist, size caps, randomized keys, re-encoding | `tests/security/upload-validation.test.ts` | planned |

## 6. Stored Cryptography (V6)

| ASVS area         | Planned implementation                                                                                                          | Verification                                        | Status  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------- |
| Algorithm choices | Argon2id (passwords), SHA-256 (token lookup hashes), HMAC-SHA256 (webhooks/CSRF), AES-256-GCM (MFA secret at rest, later phase) | unit tests on implementations                       | planned |
| Key management    | secrets via env/secret manager, never in code; rotation procedure documented                                                    | gitleaks in CI, secret scan                         | planned |
| Randomness        | `crypto.randomBytes`/`crypto.randomUUID` only                                                                                   | lint rule banning `Math.random` for security values | planned |

## 7. Error Handling and Logging (V7)

| ASVS area                                | Planned implementation                                     | Verification                               | Status  |
| ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | ------- |
| No stack traces / internals to clients   | RFC 9457 Problem Details with stable `code`                | `tests/integration/error-contract.test.ts` | planned |
| Structured logging with required context | pino JSON, request-id/trace-id, actor id                   | log assertion helpers                      | planned |
| No sensitive data in logs                | redaction paths for tokens, cookies, passwords, signatures | `tests/security/log-redaction.test.ts`     | planned |
| Audit logging for security events        | `audit_events` + `authentication_events` append-only       | audit completeness tests                   | planned |

## 8. Data Protection (V8)

| ASVS area                 | Planned implementation                                                              | Verification                        | Status  |
| ------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------- | ------- |
| Data minimization         | PII limited to what flows need; event payloads carry ids + snapshots                | schema review in contract tests     | planned |
| Sensitive data at rest    | DB disk encryption is deployment-level (documented); MFA secrets encrypted app-side | deployment doc checklist            | planned |
| Sensitive data in transit | TLS at edge; internal traffic on compose network                                    | deployment checks                   | planned |
| No PAN/CVV storage        | tokenized mock instruments only                                                     | code search test (no card patterns) | planned |
| Retention and deletion    | retention table + purge jobs; deletion policy in ERD doc                            | retention job tests                 | planned |

## 9. Communication (V9)

| ASVS area                                       | Planned implementation                                        | Verification                             | Status  |
| ----------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------- | ------- |
| TLS everywhere in deployment                    | edge terminates TLS; HSTS                                     | deployment checklist                     | planned |
| Server-side certificate validation for outbound | Node default TLS verification; no `rejectUnauthorized: false` | lint/grep CI check                       | planned |
| Webhook channel security                        | HMAC over raw body + timestamp window                         | `tests/security/payment-webhook.test.ts` | planned |

## 10. Malicious Code (V10) / Business Logic (V11) / Resources (V12) — selected

| ASVS area                                            | Planned implementation                                       | Verification                                   | Status  |
| ---------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- | ------- |
| No untrusted code execution (uploads never executed) | re-encode + serve as attachment; no eval                     | upload tests                                   | planned |
| Business rule enforcement server-side                | checkout repricing, coupon double-validation, state machines | `tests/integration/checkout-*`, property tests | planned |
| Anti-automation / rate limiting                      | multi-dimension rate limits                                  | rate-limit tests                               | planned |
| Resource limits                                      | body size, pagination caps, query timeouts, lock timeouts    | `tests/security/input-limits.test.ts`          | planned |

## 11. How to read the Status column

- Every row is `planned` at Phase 0: the design exists, the code and tests do not yet.
- Rows will be updated to `implemented` and then `verified by test X` only when the named suite exists and passes in CI. Naming the test here creates the obligation; it is not evidence yet.
- This document must not be cited as proof of compliance with any standard.
