# Security Policy

## Supported versions

Mercato is a portfolio project under active development in Phase 0 (design). Security fixes are applied to the `main` branch only; there are no released versions or long-term support branches. Users running any snapshot of `main` should update regularly.

| Branch        | Supported |
| ------------- | --------- |
| `main`        | ✅        |
| anything else | ❌        |

## Reporting a vulnerability

Use **GitHub private vulnerability reporting** on this repository (Security → Advisories → Report a vulnerability). If that is unavailable, open a GitHub issue asking for private contact details without including vulnerability information.

Please include:

- affected endpoint/component and version/commit,
- reproduction steps,
- impact assessment,
- any suggested fix (optional).

Please **do not** open public issues for security reports, and do not test against data you do not own.

Response goals (goals, not guarantees): acknowledgement within 3 business days; status updates at least every 14 days; coordinated disclosure 90 days after a fix ships, or by mutual agreement. Reporters are credited unless they prefer anonymity. The full process, severity gates, and safe-harbor scope are in [docs/security/vulnerability-management.md](docs/security/vulnerability-management.md).

## Scope

In scope: this repository's code and the documented local demo stack (docker compose). Out of scope: social engineering, physical attacks, denial-of-service, third-party services (payment provider, GitHub, registries), and deployments not run by the project owner.

## Security posture summary (as of Phase 0)

This is a design-stage project. Honest inventory of controls:

**Designed and documented (implementation in progress per [docs/roadmap.md](docs/roadmap.md)):**

- Opaque server-side sessions (SHA-256-hashed tokens, HttpOnly/Secure/SameSite=Lax cookies, rotation on login/privilege elevation), Argon2id password hashing (OWASP parameters), single-use hashed reset/verification tokens, re-authentication for sensitive operations — [ADR-007](docs/adr/ADR-007-opaque-sessions-cookies-csrf.md)
- RBAC (7 roles) + ownership/state checks with explicit non-capabilities (sellers cannot set payment status or commission; no impersonation; admin privileged actions require re-auth + audit) — [docs/security/access-control-matrix.md](docs/security/access-control-matrix.md)
- zod validation at every trust boundary, strict schemas, body size limits, RFC 9457 errors with stable codes, allowlisted dynamic sort/filter keys — [ADR-011](docs/adr/ADR-011-api-versioning-zod-openapi.md)
- Payment webhook HMAC-SHA256 over raw body + timestamp replay window + provider-event dedupe; documented payment state machine; no PAN/CVV handling — [docs/architecture/payment-workflow.md](docs/architecture/payment-workflow.md)
- Constraint-backed inventory correctness (row locks, conditional updates, CHECK constraints) — [ADR-008](docs/adr/ADR-008-inventory-concurrency-postgres-locks.md)
- Transactional outbox + idempotent consumers (reliability control with security relevance: no lost/duplicated financial effects) — [ADR-009](docs/adr/ADR-009-transactional-outbox.md)
- Upload security (magic-byte sniffing, size caps, randomized keys, re-encoding, no execution), SSRF-by-absence policy — [docs/security/security-architecture.md](docs/security/security-architecture.md)
- Header/CORS/cookie policy, multi-dimension rate limits, secret management and rotation runbooks, log redaction
- CI security gates: gitleaks, Semgrep, OSV-Scanner/npm audit, Trivy, SBOM — [docs/security/vulnerability-management.md](docs/security/vulnerability-management.md)

**Planned but not yet implemented (see roadmap phases):**

- All security test suites (named in [docs/security/threat-model.md](docs/security/threat-model.md#8-mitigation--test-mapping)) — none exist yet at Phase 0
- MFA (TOTP) for administrator/moderator (Phase 9)
- OWASP ZAP controlled DAST (Phase 9)
- OpenTelemetry/Prometheus security-event alerting (Phase 8)
- k6 load validation of rate limits (Phase 8)

## No-compliance-claims disclaimer

- This project makes **no claim** of compliance or certification with any standard, including OWASP ASVS, PCI-DSS, KVKK, or GDPR. The [ASVS mapping](docs/security/asvs-checklist.md) is a planning aid with honest status fields, not an assessment.
- No claim of zero vulnerabilities is made or implied. The [threat model](docs/security/threat-model.md) documents known residual risks explicitly.
- The ledger is a portfolio demonstration, not legally certified accounting; the payment provider is a mock (documented in [docs/adr/ADR-010-payment-abstraction-mock-provider.md](docs/adr/ADR-010-payment-abstraction-mock-provider.md)).
- Privacy/KVKK/GDPR notes in the documentation are engineering considerations, not legal advice.
