# Roadmap

Status markers: **in progress**, **planned**, **done**. As of Phase 0, only Phase 0 is in progress; everything else is planned. Each phase lists deliverables, acceptance criteria, and dependencies. Phases are ordered; a phase may start when its listed dependencies are done, but phases may overlap where acceptance criteria don't conflict.

## Phase 0 — Architecture & security design — **in progress**

- **Deliverables:** this documentation set (architecture, 12 ADRs, security docs, operations runbooks), repository skeleton (workspaces, lint/typecheck/format, compose infra), CI pipeline with security scans.
- **Acceptance criteria:** all docs merged and consistent with the fixed architecture decisions; `pnpm install && pnpm infra:up && pnpm db:migrate && pnpm dev` works from a clean checkout; CI green on frozen-lockfile install, format, lint, typecheck, secret scan.
- **Dependencies:** none.

## Phase 1 — Foundation & identity — **planned**

- **Deliverables:** `packages/{shared-kernel,contracts,config,testing}`; identity module (register, email verification, login, logout, sessions, password reset); RBAC guards; Problem Details error pipeline; pino logging with redaction; `audit_events` + `AuditPort`; initial security test suite (`authentication`, `csrf`, `access-control`, `log-redaction`).
- **Acceptance criteria:** session rotation + token hashing verified by tests; CSRF/Origin enforcement tested; access-control matrix cases (identity section) green; error contract test green.
- **Dependencies:** Phase 0.

## Phase 2 — Sellers, catalog, inventory — **planned**

- **Deliverables:** sellers/stores/membership/verification; catalog (products, variants, images, attributes); inventory (items, movements, reservations); upload pipeline with MinIO validation; reservation state machine + expiry sweep.
- **Acceptance criteria:** inventory concurrency matrix (7 tests) green against real PostgreSQL; upload security tests green; catalog authz tests green.
- **Dependencies:** Phase 1.

## Phase 3 — Pricing, cart, search — **planned**

- **Deliverables:** price records, promotions/coupons, cart, PostgreSQL FTS behind `SearchRepository`; cursor pagination utilities.
- **Acceptance criteria:** deterministic repricing property tests; coupon double-redemption prevented (test); search excludes unpublished/suspended; pagination cursor tests green.
- **Dependencies:** Phase 2.

## Phase 4 — Checkout & orders — **planned**

- **Deliverables:** checkout attempts with idempotency keys + fingerprints; server-side repricing/tax/shipping policy; atomic reservation + order creation with multi-vendor split; order state machine; status history.
- **Acceptance criteria:** checkout idempotency tests (lost response, duplicate submission) green; order-split-sum property test green; order transition property tests green; `payment-after-expiry` path covered.
- **Dependencies:** Phase 3.

## Phase 5 — Payments (mock provider) — **planned**

- **Deliverables:** `PaymentProvider` interface; mock provider service; webhook endpoint with HMAC verification, timestamp window, dedupe; payment state machine; the 7 failure-scenario tests.
- **Acceptance criteria:** `tests/security/payment-webhook.test.ts` green (forgery, replay, tampering); `payment-state-machine`, `payment-idempotency`, `payment-recovery` suites green; no PAN/CVV patterns in code (CI check).
- **Dependencies:** Phase 4.

## Phase 6 — Refunds, ledger, settlement — **planned**

- **Deliverables:** refunds/returns workflow; double-entry ledger; commission rules with snapshots; settlement runs + payout records; reconciliation job (provider vs local payments).
- **Acceptance criteria:** ledger balance property tests green; refund ≤ captured invariant tested (incl. retried refunds); commission snapshot immutability tested; reconciliation detects seeded divergence.
- **Dependencies:** Phase 5.

## Phase 7 — Notifications, shipping, reviews, admin/moderation — **planned**

- **Deliverables:** notification pipeline (Mailpit/SMTP) with idempotent enqueue; shipments + events; reviews with purchase eligibility; moderation cases; admin/support tooling per access matrix; repair/ops scripts (`outbox-replay`, `inventory-repair`, `payment-repair`, expiry sweep CLI).
- **Acceptance criteria:** review eligibility tests; moderation + audit completeness tests; access-matrix rows for admin sections green; ops scripts exercised in a chaos-style integration test.
- **Dependencies:** Phase 6.

## Phase 8 — Observability & performance — **planned**

- **Deliverables:** OpenTelemetry instrumentation, Prometheus metrics, Grafana dashboards, alert rules; k6 load tests (checkout, search, webhook ingestion); documented performance results measured on real runs.
- **Acceptance criteria:** traces span the outbox boundary via correlation/causation ids; k6 scenarios run against the compose stack and results are recorded (first real numbers enter the case study); alert rules fire in a seeded-failure exercise.
- **Dependencies:** Phase 7 (flows must exist to measure).

## Phase 9 — Security hardening & DAST — **planned**

- **Deliverables:** OWASP ZAP controlled DAST against the local stack; security regression suite completion; threat-model/ASVS status updates to "verified by test X" where true; rate-limit tuning from observed abuse patterns; MFA (TOTP) for administrator/moderator.
- **Acceptance criteria:** ZAP baseline scan clean of High/Critical (or documented exceptions per vulnerability-management policy); every critical mitigation in the threat-model mapping has a passing named test; MFA enforced for privileged roles.
- **Dependencies:** Phase 8 (instrumentation helps triage DAST noise).

## Phase 10 — Deployment & operations polish — **planned**

- **Deliverables:** hardened container images (non-root, read-only FS), deploy manifests in `infra/deployment`, backup scheduling + restore drill executed with recorded results, expand/contract migration rehearsal, runbooks verified against reality.
- **Acceptance criteria:** disaster-recovery drill PASS with recorded times; deploy checklist executed end-to-end on a clean server; rollback exercised (app rollback + expand/contract contract phase).
- **Dependencies:** Phase 9.

## Phase 11 — Optional Go microservice extraction — **planned (optional)**

- **Deliverables:** one extraction candidate (search/indexing, notification processing, media processing, or analytics — chosen by measured need) as a small Go service consuming the existing event envelope; no public API changes.
- **Acceptance criteria:** extracted service passes the same contract tests; the monolith runs with and without it; latency/throughput effects measured (not guessed).
- **Dependencies:** Phase 10; **trigger required** — a measured need (load, isolation, or team-structure), per ADR-001 reversal criteria. If no trigger exists by Phase 10 completion, this phase is consciously skipped and documented as such.

## Status summary

| Phase                                     | Status             |
| ----------------------------------------- | ------------------ |
| 0 Architecture & security design          | in progress        |
| 1 Foundation & identity                   | planned            |
| 2 Sellers, catalog, inventory             | planned            |
| 3 Pricing, cart, search                   | planned            |
| 4 Checkout & orders                       | planned            |
| 5 Payments                                | planned            |
| 6 Refunds, ledger, settlement             | planned            |
| 7 Notifications, shipping, reviews, admin | planned            |
| 8 Observability & performance             | planned            |
| 9 Security hardening & DAST               | planned            |
| 10 Deployment & operations polish         | planned            |
| 11 Optional Go extraction                 | planned (optional) |
