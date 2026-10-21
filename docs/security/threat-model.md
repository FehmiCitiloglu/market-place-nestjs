# Threat Model — Mercato

Status: Phase 0 (design). This is an engineering threat model for the planned system, not a penetration test result and not a security certification. Diagrams referenced: [system context](../architecture/overview.md#3-system-context), [containers](../architecture/overview.md#4-container-view), [checkout sequence](../architecture/checkout-sequence.md), [payment workflow](../architecture/payment-workflow.md), [outbox processing](../architecture/outbox-processing.md).

## 1. Assets

| Asset                                                                      | Why it matters                       | Impact if compromised |
| -------------------------------------------------------------------------- | ------------------------------------ | --------------------- |
| User credentials (password hashes, reset/verification tokens, MFA secrets) | account takeover                     | high                  |
| Session tokens                                                             | impersonation                        | high                  |
| Payment state and provider webhooks                                        | money movement, double charge/refund | critical              |
| Ledger, orders, settlement data                                            | financial integrity                  | critical              |
| Inventory quantities                                                       | overselling, fraud                   | high                  |
| Seller/store data, verification documents                                  | PII, business secrets                | medium–high           |
| Admin/moderator capabilities                                               | platform-wide abuse                  | critical              |
| Audit log                                                                  | non-repudiation, forensics           | high (integrity)      |
| Object storage content (product media, verification docs)                  | malware distribution, PII leak       | medium                |
| Secrets (DB roles, webhook HMAC keys, API keys)                            | everything                           | critical              |
| Logs/observability data                                                    | secret/PII leakage via logs          | medium                |

## 2. Trust boundaries

1. **Internet ↔ edge proxy** — TLS, coarse rate limits, IP reputation (deployment-dependent).
2. **Edge ↔ API** — request-id integrity, body size limits.
3. **Client ↔ API** — untrusted input; session/CSRF/authentication boundary.
4. **API ↔ PostgreSQL** — parameterized SQL; separate migration vs runtime roles; least-privilege grants.
5. **API/Worker ↔ Redis** — queue trust (job payloads are data, re-validated on consumption; Redis is not authoritative).
6. **API/Worker ↔ MinIO** — object keys are app-generated; downloads via short-lived signed URLs only.
7. **API/Worker ↔ Mailpit/SMTP** — outbound email; no inbound trust.
8. **Payment provider ↔ webhook endpoint** — the most security-sensitive inbound boundary: HMAC-signed callbacks that move money state.
9. **Operator ↔ production** — deploy access, DB access, secret access (privileged; audited).

## 3. Entry points

- `POST /api/v1/auth/*` (login, register, verify email, reset password, logout)
- All authenticated REST endpoints under `/api/v1` (cart, checkout, orders, products, reviews, admin, ...)
- `POST /api/v1/webhooks/payments` (unauthenticated by session; authenticated by HMAC signature)
- File uploads (product images, seller verification documents) via presigned MinIO URLs
- `/docs` OpenAPI UI (non-production only)
- BullMQ job payloads (from Redis — treated as semi-trusted; consumers re-validate)
- Email links (verification, reset) — token-bearing URLs
- Deployment/ops interfaces (SSH, compose, DB clients)

## 4. Threat actors

| Actor                                   | Capability                         | Primary goals                                         |
| --------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| Anonymous internet user                 | full API access as guest           | scrape, probe, exploit, register                      |
| Authenticated customer                  | own resources                      | discounts fraud, coupon abuse, others' data           |
| Malicious seller                        | own store admin                    | counterfeit listings, commission evasion, staff abuse |
| Malicious seller staff                  | delegated store access             | privilege creep, data theft                           |
| Malicious support agent/moderator/admin | privileged roles                   | financial fraud, censorship abuse, data exfiltration  |
| External attacker with stolen session   | whatever the session allows        | account takeover, purchases                           |
| Automated bot / scraper                 | high volume                        | credential stuffing, inventory hoarding               |
| Compromised dependency / supply chain   | code execution in build or runtime | secret theft, backdoor                                |
| Payment provider impersonator           | crafted webhooks                   | fake captures/refunds                                 |

## 5. Data-flow description

Client request → edge (TLS, limits) → Fastify pipeline (request-id, CORS/CSRF checks, session resolution, zod validation) → module application service (RBAC + ownership checks) → PostgreSQL transaction (locks, domain writes, outbox rows) → response. Asynchronously: outbox relay → BullMQ → consumers (inventory/orders/ledger/notifications/search) with inbox dedupe. Payments: API → mock provider (server-to-server) and provider → webhook endpoint (HMAC). Uploads: API issues short-lived signed URL → client → MinIO; metadata validated (magic bytes) before URL issuance; re-encoding before serving.

## 6. STRIDE analysis per major flow

Severity: **C** critical / **H** high / **M** medium / **L** low.

### 6.1 Authentication & session flow

| Threat (STRIDE)        | Example                                    | Sev | Preventive controls                                                                                              | Detective controls                                                      |
| ---------------------- | ------------------------------------------ | --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Spoofing               | credential stuffing, session theft via XSS | H   | Argon2id; HttpOnly+Secure+SameSite cookies; login rate limits per IP+account; lockout/backoff; no tokens in URLs | `authentication_events` logging of failures; alert on stuffing patterns |
| Tampering              | session fixation, cookie forgery           | H   | rotation on login/privilege elevation; SHA-256 hashed at rest; `__Host-` cookie prefix                           | audit of session issuance anomalies                                     |
| Repudiation            | "I never logged in"                        | M   | `authentication_events` + `audit_events` append-only, request-id linked                                          | audit review tooling                                                    |
| Information disclosure | reset token leak via referrer/logs         | H   | hashed single-use tokens; no tokens in logs; `Referrer-Policy: no-referrer` on token pages                       | log redaction checks (tests)                                            |
| Denial of service      | login endpoint hammering                   | M   | per-IP and per-account rate limits; body limits                                                                  | rate-limit metric alerts                                                |
| Elevation of privilege | role claim forgery                         | H   | server-side role store; clients cannot set roles; re-auth + audit on role changes                                | role-change audit events                                                |

### 6.2 Checkout flow

| Threat                 | Example                              | Sev | Preventive controls                                                                  | Detective controls                                                     |
| ---------------------- | ------------------------------------ | --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Tampering              | client-side total/price manipulation | C   | server-side repricing; zod strict schemas reject unknown fields; immutable snapshots | property tests; audit on manual total overrides (which must not exist) |
| Repudiation            | duplicate order claims               | H   | idempotency keys + fingerprints; order/status history                                | idempotency-conflict metrics                                           |
| Information disclosure | accessing another user's order/cart  | H   | ownership checks; 404 for non-owned resources                                        | authz regression tests                                                 |
| Denial of service      | checkout spam holding stock          | H   | reservation TTL + expiry sweep; per-user rate limits; idempotency                    | expiry sweep metrics; reservation aging alerts                         |
| Elevation of privilege | using suspended-seller coupons       | M   | eligibility checks server-side in the creating transaction                           | coupon rejection metrics                                               |
| Spoofing               | guest claiming another's cart        | M   | guest token binding (later phase); auth required Phase 0                             | —                                                                      |

### 6.3 Payment webhooks

| Threat                 | Example                           | Sev | Preventive controls                                                                      | Detective controls                        |
| ---------------------- | --------------------------------- | --- | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| Spoofing               | forged `payment.captured` webhook | C   | HMAC-SHA256 over raw body; shared secret; timestamp window ±120 s; constant-time compare | 401 counts + alerts on signature failures |
| Repudiation            | provider denies an event          | H   | store raw event id + provider refs; `payment_attempts` trail                             | reconciliation job (Phase 6)              |
| Tampering              | replay of an old captured event   | C   | `provider_event_id` dedupe; state-machine guards                                         | duplicate-webhook metrics                 |
| Information disclosure | webhook body with PII in logs     | M   | log redaction; never log signature headers or full bodies                                | redaction test suite                      |
| Denial of service      | webhook flood                     | M   | signature check before parse; body size limit; rate limit by source                      | volume alerts                             |
| Elevation of privilege | seller setting payment status     | C   | payments module owns transitions; access matrix denies seller any payment write          | authz tests `payment-status-*`            |

### 6.4 Inventory flow

| Threat                 | Example                                | Sev | Preventive controls                                           | Detective controls                                   |
| ---------------------- | -------------------------------------- | --- | ------------------------------------------------------------- | ---------------------------------------------------- |
| Tampering              | overselling via race                   | C   | row locks + conditional updates + CHECK constraints (ADR-008) | concurrency test matrix; stock-identity drift checks |
| Repudiation            | disputed stock change                  | M   | append-only `inventory_movements` with cause refs             | movement-vs-reservation audit queries                |
| Denial of service      | hold all stock with unpaids            | H   | reservation TTL; per-user reservation caps                    | aged-reservation alerts                              |
| Elevation of privilege | seller adjusting another store's stock | H   | table ownership + ownership checks                            | authz tests                                          |

### 6.5 Uploads (media/documents)

| Threat                 | Example                            | Sev | Preventive controls                                                                                                                                                            | Detective controls                                   |
| ---------------------- | ---------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Tampering              | upload of executable/polyglot file | H   | magic-byte sniffing, MIME allowlist, size caps, randomized object keys, re-encoding before serving, `Content-Disposition: attachment`/safe content-type, never execute uploads | upload rejection metrics                             |
| Information disclosure | public enumeration of documents    | H   | short-lived signed URLs; unguessable keys; authz on URL issuance                                                                                                               | signed-URL TTL policy review                         |
| Denial of service      | giant uploads                      | M   | edge + app size limits (config default: images 5 MiB, documents 10 MiB)                                                                                                        | storage metrics                                      |
| SSRF                   | "fetch image from URL" feature     | H   | **no arbitrary server-side URL fetching**; explicit deny in design and tests                                                                                                   | SSRF regression test (`tests/security/ssrf.test.ts`) |

### 6.6 Admin / moderation flow

| Threat                 | Example                               | Sev | Preventive controls                                                   | Detective controls                                      |
| ---------------------- | ------------------------------------- | --- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| Elevation of privilege | support agent performing admin action | C   | RBAC matrix enforced server-side; least-privilege routes per role     | authz test matrix; audit review                         |
| Spoofing               | session riding on admin actions       | H   | CSRF double-submit + Origin checks; re-auth for sensitive ops         | CSRF failure metrics                                    |
| Repudiation            | silent data edits                     | H   | every privileged action writes `audit_events` in the same transaction | audit completeness checks                               |
| Information disclosure | moderator reading financial data      | M   | moderators have no unrestricted financial access (see access matrix)  | role-scope tests                                        |
| Tampering              | audit log editing                     | H   | append-only grants (no UPDATE/DELETE for runtime role)                | integrity checks (row counts/hash chain if added later) |

## 7. Cross-cutting threats

| Threat                                        | Sev | Controls                                                                                                               |
| --------------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------- |
| SQL injection                                 | C   | parameterized SQL only (Drizzle bound params); lint + review rule banning string-concatenated SQL; security test suite |
| XSS (served content/emails)                   | M   | API is JSON-only (no HTML rendering of user content); output encoding in email templates; CSP where UI exists          |
| CSRF                                          | H   | double-submit HMAC + Origin/Sec-Fetch-Site + SameSite=Lax; explicit CORS allowlist                                     |
| Dependency/supply chain                       | H   | frozen lockfile, gitleaks, Semgrep, OSV-Scanner/npm audit, Trivy, SBOM in CI; documented exception policy              |
| Secret leakage via logs                       | H   | pino redaction paths; tests asserting known secret shapes never appear in log output                                   |
| Rate-limit evasion                            | M   | limits per IP/account/session/endpoint/resource/store/operation (see security-architecture)                            |
| Redis as trust boundary                       | M   | job payloads re-validated; Redis never authoritative (ADR-003)                                                         |
| DoS on expensive endpoints (search, checkout) | M   | pagination caps, query cost limits, per-endpoint rate limits                                                           |

## 8. Mitigation → test mapping

Every critical mitigation maps to a named planned test area. Status as of Phase 0: **all planned** (suites not yet written).

| Mitigation                                              | Test area (planned)                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Webhook HMAC verification, replay window, dedupe        | `tests/security/payment-webhook.test.ts`                                                          |
| Payment state machine transition guards                 | `tests/integration/payment-state-machine.test.ts`                                                 |
| Idempotent checkout/payment/refund under retries        | `tests/integration/payment-idempotency.test.ts`, `tests/integration/checkout-idempotency.test.ts` |
| Inventory invariants under concurrency                  | `tests/integration/inventory-concurrency.test.ts`, property tests                                 |
| RBAC + ownership enforcement                            | `tests/security/access-control.test.ts` (matrix-driven)                                           |
| CSRF + Origin validation                                | `tests/security/csrf.test.ts`                                                                     |
| Session rotation, token hashing, reset token single-use | `tests/security/authentication.test.ts`                                                           |
| SQL injection resistance                                | `tests/security/sql-injection.test.ts`                                                            |
| Upload validation (magic bytes, size, type)             | `tests/security/upload-validation.test.ts`                                                        |
| SSRF absence                                            | `tests/security/ssrf.test.ts`                                                                     |
| Log redaction                                           | `tests/security/log-redaction.test.ts`                                                            |
| Problem Details error contract (no stack/PII leak)      | `tests/integration/error-contract.test.ts`                                                        |
| Outbox/inbox idempotency                                | `tests/integration/outbox-delivery.test.ts`                                                       |
| Full regression gate                                    | `tests/security/` suite runs in CI on every PR                                                    |

## 9. Residual risk register

| #   | Residual risk                                                 | Why it remains                       | Mitigation / acceptance                                                                            |
| --- | ------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| R1  | Compromised dependency executes in build or runtime           | supply chain is never fully closed   | CI scanning + SBOM + frozen lockfile; accepted residual for portfolio scope                        |
| R2  | Stolen session token used from attacker machine before expiry | opaque sessions don't bind to device | short-ish TTL (default 7 d idle / 30 d absolute, configurable), rotation, revocation-all; accepted |
| R3  | Hot inventory rows serialize under flash-sale load            | pessimistic locking by design        | monitor lock waits; queueing option documented in ADR-008                                          |
| R4  | DDoS at edge                                                  | out of app scope                     | deployment-level controls noted in ops docs; accepted                                              |
| R5  | Provider compromise signs valid webhooks                      | shared secret held by provider       | rotation procedure, reconciliation; accepted                                                       |
| R6  | Admin account takeover (post-auth)                            | MFA is a later phase                 | MFA required for admin/moderator planned before production-like deployment; documented as open gap |
| R7  | Log storage holds transient sensitive metadata                | debugging needs context              | retention limits + redaction; accepted                                                             |
| R8  | Backup compromise leaks historical data                       | backups inherit data sensitivity     | encrypted backup storage; restore-verification procedure; accepted                                 |

## 10. Not claimed

- No claim of zero vulnerabilities, "secure by construction" certification, or formal verification.
- No claim of OWASP ASVS certification or compliance; `docs/security/asvs-checklist.md` maps selected controls to **planned** implementation and verification, with honest status fields.
- No claim of PCI-DSS scope or compliance — the design avoids PAN/CVV entirely (tokenized mock instruments), which is a design choice, not a certification.
- No legal/compliance claims (KVKK/GDPR notes are considerations, not legal advice).
- This model is valid only for the architecture described in Phase 0 docs; implementation changes require updating this document.
