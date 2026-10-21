# Security Architecture

Status: Phase 0 (design). This document defines the security layers and concrete configured defaults (with rationale) for headers, CORS, cookies, rate limits, secrets, uploads, SSRF policy, supply chain, data classification, and retention. KVKK/GDPR notes are **considerations, not legal advice or compliance claims**. See also [threat-model.md](threat-model.md) and [access-control-matrix.md](access-control-matrix.md).

## 1. Security layers

| Layer         | Components                     | Controls                                                                                                                                                                               |
| ------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge / proxy  | reverse proxy or load balancer | TLS termination, HSTS, coarse IP rate limits, request size caps, IP allowlist for admin routes (deployment)                                                                            |
| Application   | Fastify pipeline in `apps/api` | request-id, CORS allowlist, CSRF, session auth, RBAC + ownership guards, zod validation, body limits, Problem Details errors, pino redaction                                           |
| Data          | PostgreSQL, Redis, MinIO       | parameterized SQL, least-privilege DB roles (migration vs runtime), append-only audit, encrypted-at-rest volumes (deployment), short-lived signed object URLs, Redis non-authoritative |
| Observability | pino, OTel, Prometheus         | security event logging, redaction, audit completeness, alerting on anomaly metrics (Phase 8)                                                                                           |

## 2. Header policy

Applied on every API response (via a global hook):

| Header                       | Value                                      | Rationale                                                 |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `Strict-Transport-Security`  | `max-age=63072000; includeSubDomains`      | TLS-only; long max-age (2 years) is standard practice     |
| `X-Content-Type-Options`     | `nosniff`                                  | stop MIME sniffing of JSON/upload responses               |
| `X-Frame-Options`            | `DENY`                                     | no framing of API responses; UI sets its own if needed    |
| `Referrer-Policy`            | `no-referrer`                              | keep token-bearing URLs out of referrers                  |
| `Content-Security-Policy`    | `default-src 'none'` on API responses      | JSON API needs no resource loading; UI serves its own CSP |
| `Cache-Control`              | `no-store` on authenticated/PII responses  | no shared caching of private data                         |
| `Permissions-Policy`         | `camera=(), microphone=(), geolocation=()` | deny unneeded powerful features                           |
| `Cross-Origin-Opener-Policy` | `same-origin`                              | isolate browsing context                                  |

All values are configured defaults in code, covered by header-assertion tests.

## 3. CORS policy

- Explicit **allowlist** of origins from config (e.g. the demo UI origin); **no wildcard** origin with credentials.
- Allowed methods: `GET, POST, PATCH, PUT, DELETE, OPTIONS`; allowed headers: `content-type`, `x-csrf-token`, `idempotency-key`, `x-request-id`; exposed headers: `x-request-id`, `idempotency-replayed`, `retry-after`.
- Credentials: `true` only for the allowlisted origins.
- Preflight results cached briefly (600 s default).
- Non-browser API clients are not affected by CORS but are subject to the same auth/rate limits.

## 4. Cookie policy

| Attribute  | Value                                          | Rationale                                                     |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------- |
| name       | `__Host-mercato_session` (when TLS + Path=/)   | `__Host-` blocks domain/path injection                        |
| `HttpOnly` | yes                                            | no JS access → XSS can't exfiltrate                           |
| `Secure`   | yes                                            | TLS-only                                                      |
| `SameSite` | `Lax`                                          | CSRF baseline while keeping top-level navigation links usable |
| `Path`     | `/`                                            | required by `__Host-`                                         |
| max-age    | idle 7 d / absolute 30 d (configured defaults) | bounded exposure window (residual risk R2)                    |

CSRF cookie (readable by JS for double-submit): `mercato_csrf` — `Secure`, `SameSite=Lax`, not `HttpOnly`; bound to the session via HMAC.

## 5. Rate-limit dimensions and initial limits

All limits are **configured defaults** with rationale (protect resources without harming normal use); they are not measured capacities. Algorithm: sliding window in Redis (loss of Redis degrades to fail-open per-IP static limit — rate limiting is availability control, never correctness control).

| Dimension                           | Default limit                               | Rationale                              |
| ----------------------------------- | ------------------------------------------- | -------------------------------------- |
| IP: global                          | 600 req/min                                 | absorb browsing + API use from one NAT |
| IP: auth endpoints (login, reset)   | 10 req/min per IP                           | credential stuffing friction           |
| Account: login attempts             | 10 failures / 15 min → lockout with backoff | account protection                     |
| Session: global per session         | 300 req/min                                 | runaway clients                        |
| Endpoint: `POST /checkout/attempts` | 10/min per user                             | checkout is expensive                  |
| Endpoint: search                    | 60/min per user, max query length 200 chars | query cost control                     |
| Resource: reservations per user     | 20 active                                   | stock-hoarding friction                |
| Store: product writes               | 120/min per store                           | bulk import tolerance                  |
| Operation: refunds per order        | 5/min per actor                             | refund abuse friction                  |
| Webhooks: per source IP             | 300/min                                     | provider retry tolerance               |

Every limited response returns `429` with `Retry-After` and Problem Details code `rate-limited`. Limits are exempt for internal worker jobs.

## 6. Secrets management

- Secrets (DB passwords, session pepper, webhook HMAC keys, provider API keys, SMTP credentials) come from environment variables validated by `packages/config` (zod) at boot — invalid/missing config fails startup loudly.
- Local dev: `.env` (gitignored) + `.env.example` with placeholders only. Production: deployment secret store (compose secrets / platform secret manager); never baked into images.
- In-code prohibition: no secret literals; gitleaks runs in CI on every PR and on history.
- Rotation: documented runbook entries for webhook HMAC key (dual-key acceptance window), session pepper (rehash-on-login), DB passwords (role-based rotation). Rotation procedure is part of `docs/operations/deployment.md`.
- Logging: pino redaction covers `authorization`, `cookie`, `set-cookie`, `password`, `token`, `secret`, `hmac`, signature headers by path — verified by `tests/security/log-redaction.test.ts` (planned).

## 7. Upload security policy

1. Client requests an upload intent; API validates authz + declared type + size.
2. Allowed types: images `image/jpeg`, `image/png`, `image/webp` (max 5 MiB); verification documents `application/pdf` (max 10 MiB) — configured defaults.
3. **Magic-byte sniffing** on the actual bytes (not the declared content-type); mismatch → reject with `unsupported-media-type`.
4. Object keys are **randomized** (UUIDv7 + random suffix + extension from sniffed type); no user-controlled path segments; no overwriting existing keys.
5. Serving: short-lived signed URLs (default 5 min TTL), `Content-Disposition: attachment` for documents, safe `Content-Type`, and **re-encoding** of images before serving (strips embedded payloads).
6. Uploads are **never executed**, rendered inline as HTML, or used server-side as input to processors without sandboxing (media processing extraction is a Phase 11 candidate precisely to isolate it).
7. Storage bucket is private; listing is disabled; URL issuance is authz-checked per resource.

## 8. SSRF policy

- **No arbitrary server-side URL fetching exists in the design.** There is no "import from URL", webhook-callback-to-user-URL, or avatar-from-URL feature.
- If such a feature is ever added: private/link-local/loopback address blocks must be denied after DNS resolution (re-checked on redirect), scheme allowlist `https` only, egress restricted at the network layer, and it needs a new ADR + threat-model update.
- Enforcement: design rule + `tests/security/ssrf.test.ts` (asserts no outbound fetch path exists for user-supplied URLs) + lint review checklist item.

## 9. Dependency and supply-chain policy

| Control                  | Tool                                          | Gate                                                   |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------ |
| Locked versions          | pnpm lockfile, `--frozen-lockfile` in CI      | PR fails if lockfile out of sync                       |
| Secret scanning          | gitleaks                                      | blocks merge on findings                               |
| Static security analysis | Semgrep (security rulesets)                   | blocks on high/critical                                |
| Vulnerability audit      | OSV-Scanner + `pnpm audit`                    | blocks on high/critical without a documented exception |
| Container scanning       | Trivy on built images                         | blocks deploy on critical                              |
| SBOM                     | syft or Trivy SBOM artifact per build         | artifact archived, no gate                             |
| License review           | manual in PR checklist for new deps           | review                                                 |
| Typosquatting review     | manual: check new package names before adding | review                                                 |

Exceptions: documented, time-bounded, owner-assigned (see [vulnerability-management.md](vulnerability-management.md)).

## 10. Data classification

| Class        | Examples                                                                    | Handling                                                          |
| ------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Public       | product titles/descriptions, store names, public reviews                    | no restriction                                                    |
| Internal     | aggregate metrics, non-PII logs                                             | staff access, standard logging                                    |
| Confidential | order history, addresses, seller financials, settlement data                | authz-scoped access, masked in support views, never in logs       |
| Secret       | passwords, session hashes, tokens, MFA secrets, API keys, webhook HMAC keys | hashed/encrypted at rest, never logged, never returned by any API |
| Restricted   | payment provider event payloads, verification documents                     | minimal retention, signed URLs only, audited access               |

## 11. Retention rules (configured defaults)

| Data                                       | Retention                                                                                       | Rationale                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| Account + profile                          | until deletion request + 30 d grace; PII scrubbed after; rows kept where financially referenced | legal-retention vs minimization balance |
| Addresses                                  | 30 d after last order referencing them (configurable)                                           | minimization                            |
| Sessions                                   | until expiry + 7 d, then hard-purge                                                             | no value after expiry                   |
| Password reset / email verification tokens | until expiry + 24 h                                                                             | short-lived by design                   |
| audit_events                               | 24 months (partition-drop if ever needed)                                                       | accountability                          |
| authentication_events                      | 12 months                                                                                       | abuse forensics                         |
| Payment metadata (provider refs, states)   | lifetime of the order + 7 years intent (configurable)                                           | financial record expectation            |
| Ledger entries / order items               | never deleted                                                                                   | integrity                               |
| Notifications / deliveries                 | 90 d                                                                                            | volume control                          |
| Uploads (product media)                    | life of product + 30 d                                                                          | catalog need                            |
| Verification documents                     | until review + 180 d                                                                            | dispute window                          |
| Logs (app)                                 | 30 d (deployment-side)                                                                          | debugging window                        |

These are engineering defaults for a portfolio project, **not** a legal compliance determination.

## 12. KVKK/GDPR considerations (not legal advice)

- Data minimization is applied at schema and event-payload level (ids + snapshots, not full profiles).
- Access, rectification, and deletion: user self-service profile endpoints; deletion request flow scrubs PII while preserving financial rows (documented trade-off in the ERD deletion policy).
- Export: a data-export job is a Phase 7+ item producing the user's data as JSON (planned).
- Lawful basis, cookie consent, cross-border transfer, and DPA obligations are **out of scope** of this document; consult qualified counsel for any real deployment.
- Nothing in this repository should be read as a claim of KVKK/GDPR compliance.
