# Mercato Documentation

Documentation index for the Mercato multi-vendor marketplace backend. Phase 0 (design) documents the intended system; see [roadmap.md](roadmap.md) for what exists and when.

## Start here

| Document                                             | What it covers                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [architecture/overview.md](architecture/overview.md) | Problem statement, quality priorities, system context & container diagrams, runtime/deployment view |
| [roadmap.md](roadmap.md)                             | 12 phases with deliverables, acceptance criteria, status                                            |
| [portfolio-case-study.md](portfolio-case-study.md)   | Problems addressed, trade-offs, evidence policy, real-vs-mocked inventory                           |

## Architecture

| Document                                                                       | What it covers                                                                                              |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [architecture/domain-boundaries.md](architecture/domain-boundaries.md)         | 18 bounded contexts: tables, events, dependencies, invariants; module dependency diagram                    |
| [architecture/database-erd.md](architecture/database-erd.md)                   | ERD, identifiers/timestamps/money policies, deletion policy, indexes, isolation, cursor pagination          |
| [architecture/checkout-sequence.md](architecture/checkout-sequence.md)         | Full checkout sequence incl. multi-vendor split and failure paths                                           |
| [architecture/payment-workflow.md](architecture/payment-workflow.md)           | Payment state machine, mock provider contract, webhook security, 7 failure scenarios                        |
| [architecture/inventory-reservation.md](architecture/inventory-reservation.md) | Stock model, reservation state machine, locking SQL, expiry recovery, concurrency test matrix               |
| [architecture/outbox-processing.md](architecture/outbox-processing.md)         | Transactional outbox, event envelope & versioning, delivery/ordering guarantees, dedupe, DLQ, event catalog |

## Architecture Decision Records

| ADR                                                            | Decision                                        |
| -------------------------------------------------------------- | ----------------------------------------------- |
| [ADR-001](adr/ADR-001-modular-monolith.md)                     | Modular monolith instead of microservices       |
| [ADR-002](adr/ADR-002-pnpm-workspaces-no-turbo.md)             | pnpm workspaces without Turborepo               |
| [ADR-003](adr/ADR-003-postgres-source-of-truth.md)             | PostgreSQL as transactional source of truth     |
| [ADR-004](adr/ADR-004-drizzle-orm-migrations.md)               | Drizzle ORM with generated SQL migrations       |
| [ADR-005](adr/ADR-005-uuidv7-identifiers.md)                   | UUIDv7 application-side identifiers             |
| [ADR-006](adr/ADR-006-money-integer-minor-units.md)            | Money as integer minor units + ISO-4217         |
| [ADR-007](adr/ADR-007-opaque-sessions-cookies-csrf.md)         | Opaque sessions, cookies, CSRF                  |
| [ADR-008](adr/ADR-008-inventory-concurrency-postgres-locks.md) | Inventory concurrency via PostgreSQL row locks  |
| [ADR-009](adr/ADR-009-transactional-outbox.md)                 | Transactional outbox for domain events          |
| [ADR-010](adr/ADR-010-payment-abstraction-mock-provider.md)    | PaymentProvider abstraction + mock provider     |
| [ADR-011](adr/ADR-011-api-versioning-zod-openapi.md)           | API versioning with zod-first OpenAPI contracts |
| [ADR-012](adr/ADR-012-postgres-fts-search-boundary.md)         | PostgreSQL FTS behind a repository boundary     |

## Security

| Document                                                                     | What it covers                                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [security/threat-model.md](security/threat-model.md)                         | Assets, trust boundaries, STRIDE per flow, mitigation→test mapping, residual risks, "Not claimed"                                         |
| [security/access-control-matrix.md](security/access-control-matrix.md)       | 7 roles × operations matrix (Allow/Deny/Conditional) + explicit non-capabilities                                                          |
| [security/asvs-checklist.md](security/asvs-checklist.md)                     | Selected ASVS 5.0.0 areas mapped to planned implementation & verification (no compliance claim)                                           |
| [security/security-architecture.md](security/security-architecture.md)       | Layers, headers, CORS, cookies, rate limits, secrets, uploads, SSRF, supply chain, data classification, retention, privacy considerations |
| [security/vulnerability-management.md](security/vulnerability-management.md) | Severity gates, exception process, disclosure policy, scope & safe harbor                                                                 |
| [security/incident-response.md](security/incident-response.md)               | Severity classes, roles, detection, containment/eradication/recovery, evidence retention, postmortem template                             |

## Operations

| Document                                                                       | What it covers                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [operations/deployment.md](operations/deployment.md)                           | Prerequisites, local stack, env config, deploy checklist, secret rotation runbooks    |
| [operations/troubleshooting.md](operations/troubleshooting.md)                 | Symptom→diagnosis→action tables, diagnostic SQL                                       |
| [operations/backup-restore.md](operations/backup-restore.md)                   | pg_dump/pg_restore procedures, mandatory restore verification, retention              |
| [operations/database-migrations.md](operations/database-migrations.md)         | Migration workflow, roles, expand/contract for destructive changes, rollback strategy |
| [operations/observability.md](operations/observability.md)                     | Logging contract, metrics, tracing, security-event monitoring                         |
| [operations/disaster-recovery-drill.md](operations/disaster-recovery-drill.md) | Quarterly drill script with scoring and records                                       |

## Root files

- [../SECURITY.md](../SECURITY.md) — reporting, supported versions, posture summary
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — dev setup, commands, code style, PR checklist
- [../LICENSE](../LICENSE) — MIT, "Mercato contributors"

## Conventions

- Numbers presented as policy (rate limits, TTLs, hash parameters) are **configured defaults with stated rationale**, not measured results.
- No compliance claims anywhere; verification statuses are honest (`planned` / `implemented` / `verified by test X`).
- Mermaid diagrams live in fenced ` ```mermaid ` blocks; labels with special characters are quoted.
