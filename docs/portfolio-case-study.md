# Portfolio Case Study — Mercato

Status: early skeleton (Phase 0). This case study will be completed as implementation and measurements land. Per the [evidence policy](#7-evidence-policy) below, every claim must map to code, tests, or measured results — this document deliberately contains **no performance numbers yet**.

## 1. Problem being solved

Multi-vendor marketplaces look like CRUD until you touch the parts that move money: limited stock shared by competing buyers, one customer payment splitting into multiple seller settlements, coupons and taxes recomputed server-side, and webhooks that arrive twice, late, or not at all. The project's goal is to build that hard core with production-grade engineering discipline: strict validation at every trust boundary, constraint-backed concurrency correctness, failure-path recovery, and least-privilege access control — as a portfolio demonstration, with honest labeling of what is mock, planned, or unverified.

## 2. Complex engineering problems addressed

### 2.1 Inventory consistency under contention

Many buyers, few units, retried requests, crashed workers. Overselling must be impossible, not merely unlikely. Approach: PostgreSQL pessimistic row locking in deterministic order + conditional updates + CHECK constraints making negative stock unrepresentable + reservation expiry recovery that survives worker downtime (ADR-008, [inventory-reservation.md](architecture/inventory-reservation.md)).

### 2.2 Duplicate-payment prevention

Lost HTTP responses, double-clicks, duplicate and out-of-order webhooks, retried refunds. Approach: idempotency keys scoped per actor+operation with persisted request fingerprints and stored results; a documented payment state machine rejecting invalid transitions; webhook HMAC verification + provider-event dedupe + inbox dedupe; commit-then-ack for webhooks ([payment-workflow.md](architecture/payment-workflow.md)).

### 2.3 Access control across seven roles

Sellers, support agents, moderators, and administrators each get a deliberately narrow slice of capability, with explicit non-capabilities (a seller cannot set payment status or commission; support cannot impersonate anyone; moderators have no unrestricted financial access; admin privileged actions require re-auth + audit). Approach: RBAC + ownership/state policy guards on every protected operation, derived from a single access matrix document ([access-control-matrix.md](security/access-control-matrix.md)).

### 2.4 Failure recovery

Every side effect survives process crashes. Approach: transactional outbox (business change + event commit atomically), at-least-once delivery with idempotent consumers and a dedupe table, bounded retries, dead-letter + replay tooling, and reconciliation for payments ([outbox-processing.md](architecture/outbox-processing.md)).

## 3. Trade-offs made (and why)

| Trade-off                         | Chosen                                     | Rejected                  | Why                                                                                                                         | Reversal trigger                                                     |
| --------------------------------- | ------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Modular monolith vs microservices | modular monolith (ADR-001)                 | microservices per context | single transaction boundary for checkout/outbox; demo and debug simplicity; boundaries enforced by rules instead of network | measured per-context load, team split, recurring coupling violations |
| Postgres FTS vs OpenSearch        | Postgres FTS behind a repository (ADR-012) | OpenSearch cluster        | zero extra infra; instant consistency with catalog; engine swap is additive via the repo boundary                           | measured relevance/latency failure or k6 result                      |
| Server-side sessions vs JWT       | opaque sessions + cookies + CSRF (ADR-007) | JWT in browser            | instant revocation, rotation, small client secret; avoids token-lifetime exposure                                           | a real stateless-edge requirement (unlikely)                         |
| Turborepo vs pnpm -r              | pnpm workspaces (ADR-002)                  | Turborepo                 | 6 packages don't justify the extra tooling; migration is cheap later                                                        | >8–10 packages or CI build time dominating                           |
| Pessimistic locking vs optimistic | row locks + constraints (ADR-008)          | optimistic versioning     | correctness provable and constraint-backed; contention is observable and acceptable                                         | measured tail latency unacceptable at realistic load                 |
| Money as integers vs numeric      | int minor units + currency (ADR-006)       | numeric/float             | exact arithmetic; conservation laws testable                                                                                | none foreseeable                                                     |
| Mock payment provider vs real PSP | mock behind interface (ADR-010)            | real PSP in CI            | deterministic failure-scenario testing incl. signatures/replays; no card data adjacency                                     | real-provider adapter passing the same contract suite                |

## 4. Evidence: which tests support which claims

Suites named below are the planned evidence (Phase 0: all **planned**; the roadmap phases deliver them). Naming a suite is an obligation, not proof.

| Claim                                                     | Evidence suite (planned)                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| No overselling under 100-way contention                   | `tests/integration/inventory-concurrency.test.ts` (matrix: 100 buyers vs 10 units) |
| Reservation/stock identity always holds                   | property tests `property-inventory` (fast-check interleavings)                     |
| Duplicate checkout charges once                           | `tests/integration/checkout-idempotency.test.ts`                                   |
| Forged/replayed webhooks rejected                         | `tests/security/payment-webhook.test.ts`                                           |
| Payment transitions never invalid                         | `tests/integration/payment-state-machine.test.ts` + property tests                 |
| Refund cannot exceed capture                              | property tests `property-payments` incl. retried refunds                           |
| Event effects exactly-once despite at-least-once delivery | `tests/integration/outbox-delivery.test.ts` (duplicate delivery, worker crash)     |
| Ledger balances per currency                              | property tests `property-ledger`                                                   |
| RBAC/ownership enforced per matrix                        | `tests/security/access-control.test.ts` (matrix-derived)                           |
| Secrets never in logs                                     | `tests/security/log-redaction.test.ts`                                             |
| No SSRF surface                                           | `tests/security/ssrf.test.ts`                                                      |
| Upload validation                                         | `tests/security/upload-validation.test.ts`                                         |
| Order split sums exactly                                  | property test `order-split-sum`                                                    |

**Measured performance numbers will be added only after k6 runs (Phase 8).** Until then this document contains none — a fabricated benchmark would defeat the point of the project.

## 5. What is real vs mocked (honest inventory)

| Component                         | Status                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| PostgreSQL, Redis, MinIO, Mailpit | real, local via docker compose                                                                             |
| Payment provider                  | **mock** implementing the webhook contract (ADR-010); real PSP adapter not built                           |
| Email delivery                    | real SMTP path to Mailpit (captured); production sending not configured                                    |
| Search                            | real PostgreSQL FTS; OpenSearch not used                                                                   |
| Ledger                            | real double-entry implementation; **explicitly a portfolio demo ledger, not legally certified accounting** |
| MFA                               | designed (table exists); **implemented in Phase 9**                                                        |
| Observability                     | designed; instrumentation Phase 8                                                                          |

## 6. Open / unresolved trade-offs

1. **Payments↔orders module dependency** — resolved pattern (read-only port) documented in [domain-boundaries.md](architecture/domain-boundaries.md#3-module-dependency-diagram), but implementation may reveal it needs a tiny shared identity port; open until Phase 5 code review.
2. **Per-aggregate event ordering** — consumers must not rely on order; if a real need for partitioned ordering emerges, the queue design changes (documented limitation now).
3. **Guest checkout** — deferred; Phase 0 requires authenticated checkout. Cart already models guests; the auth merge policy is open.
4. **Multi-currency carts** — rejected for now (single-currency orders); cross-currency conversion is out of scope and unresolved.
5. **Tail latency under hot-row contention** — accepted per ADR-008 until measurements say otherwise; queueing is the fallback.
6. **Audit-log tamper evidence** — append-only DB grants now; a hash chain is a candidate if the threat model demands stronger integrity.
7. **Turborepo adoption** — revisit trigger defined in ADR-002; not scheduled.

## 7. Evidence policy

- **Every claim in this case study must map to code, a test, or a measured result.** If an artifact does not exist yet, the claim is labeled `planned` and names the artifact that will substantiate it.
- **Measured performance numbers (latency, throughput, error rates) will be added only after k6 runs (Phase 8)**, each with the scenario, environment, and configuration recorded. Numbers without that context will not be published here.
- Statuses are honest: `planned` ≠ `implemented` ≠ `verified by test X`. The ASVS mapping ([asvs-checklist.md](security/asvs-checklist.md)) follows the same rule.
- No compliance claims (no "ASVS compliant", "PCI compliant", "GDPR compliant"); no zero-vulnerability claims; mocked components are labeled as mocked.
- When an experiment contradicts a design expectation (e.g. locking tail latency), this document records the finding and the resulting decision — including decisions to leave something suboptimal and why.
