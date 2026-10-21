# Mercato

Production-oriented, security-first multi-vendor marketplace backend.

Mercato is a portfolio engineering project: an enterprise-grade marketplace
backend (multi-vendor catalog, inventory, checkout, payments, ledger,
fulfillment) built as a TypeScript modular monolith with explicit security
controls and transactional correctness under concurrency.

**Status: early development (Phase 1 complete).** Phases are delivered
incrementally; see [docs/roadmap.md](docs/roadmap.md) for the plan and honest
progress markers.

## What is implemented today

- pnpm monorepo: `apps/api` (NestJS 12 + Fastify 5), `packages/{contracts,config,shared-kernel,testing}`
- Validated configuration (zod) with fail-fast startup and secret redaction
- Structured JSON logging (pino) with request-id correlation
- Health endpoints: `/health/live`, `/health/ready` (real PostgreSQL + Redis
  checks), `/health/startup`
- OpenAPI 3.1 generated from the same zod schemas used for runtime validation,
  served at `/openapi.json` with an offline Swagger UI at `/docs`
- RFC 9457 Problem Details error surface for every failure, including
  framework and transport errors (413/429/500 mapping tested)
- HTTP hardening: strict CSP security headers, CORS allowlist, request-id
  validation (client input never reflected unvalidated), body limits,
  rate limiting with shared Problem Details shape
- Docker Compose dev stack: PostgreSQL 18.6, Redis 8.8.3, S3-compatible object
  storage (MinIO), Mailpit — all pinned
- Test suites (unit + integration against real PostgreSQL/Redis) with
  property-based tests for money and cursor invariants
- GitHub Actions CI: format, lint, typecheck, build, tests, secret scanning,
  dependency and container scanning, SBOM, OpenAPI contract validation,
  migration verification

Planned next: Identity & Access (Phase 2), then catalog, inventory,
checkout, payments/ledger (see roadmap).

## Technology stack

| Layer        | Choice                        | Rationale                                       |
| ------------ | ----------------------------- | ----------------------------------------------- |
| Runtime      | Node.js 24 LTS (pinned)       | Supported LTS, pinned in `.nvmrc`/`engines`     |
| Language     | TypeScript 6 (strict)         | Type-safe contracts; no `any`                   |
| HTTP         | NestJS 12 + Fastify 5         | Modular monolith boundaries + fast adapter      |
| Validation   | zod 4                         | Single source of truth for validation + OpenAPI |
| API docs     | OpenAPI 3.1 (zod-openapi)     | Contract generated from runtime schemas         |
| Database     | PostgreSQL 18.6 + Drizzle ORM | Transactional source of truth                   |
| Cache/queues | Redis 8.8 + BullMQ (planned)  | Ephemeral state only, never business truth      |
| Logging      | pino                          | Structured JSON with redaction                  |
| Storage      | S3-compatible (MinIO locally) | Controlled uploads, signed URLs                 |

## Quick start

Prerequisites: Node.js 24 (see `.nvmrc`), pnpm 12, Docker.

```bash
pnpm install
cp .env.example .env          # development-only values; never commit
pnpm infra:up                 # postgres, redis, storage (MinIO), mailpit
pnpm db:migrate               # apply database migrations
pnpm dev                      # API on http://localhost:3000
```

Inspect the API:

- Swagger UI: http://localhost:3000/docs
- OpenAPI 3.1 document: http://localhost:3000/openapi.json
- Liveness/readiness: http://localhost:3000/health/live, `/health/ready`
- Local mailbox (Mailpit): http://localhost:8025

## Development commands

| Command                             | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `pnpm build`                        | Build all workspace projects                      |
| `pnpm test`                         | Build + run all test suites (unit + integration)  |
| `pnpm test:unit`                    | Unit tests only                                   |
| `pnpm test:integration`             | Integration tests (needs `pnpm infra:up`)         |
| `pnpm lint` / `pnpm lint:fix`       | ESLint (type-aware, strict)                       |
| `pnpm typecheck`                    | TypeScript project-wide type check                |
| `pnpm format:check`                 | Prettier style gate                               |
| `pnpm db:generate`                  | Generate SQL migrations from `src/db/schema`      |
| `pnpm db:migrate`                   | Apply migrations (separate credentials supported) |
| `pnpm infra:up` / `pnpm infra:down` | Local Docker infrastructure                       |

## Architecture

Mercato is a **modular monolith**: one deployable API where each bounded
context (identity, catalog, inventory, checkout, payments, ...) owns its
tables, services, controllers, policies and events. Cross-module writes go
through explicit application interfaces or domain events — no circular
dependencies, no shared mutable state.

Key documents:

- [Architecture overview](docs/architecture/overview.md)
- [Domain boundaries](docs/architecture/domain-boundaries.md)
- [Database ERD](docs/architecture/database-erd.md)
- [Checkout sequence](docs/architecture/checkout-sequence.md)
- [Payment workflow](docs/architecture/payment-workflow.md)
- [Inventory reservations](docs/architecture/inventory-reservation.md)
- [Transactional outbox](docs/architecture/outbox-processing.md)
- [ADR index](docs/adr/) — one record per significant decision

## Security approach

Security is the first quality gate, not a hardening afterthought:

- Opaque server-side sessions (HttpOnly/Secure/SameSite cookies), Argon2id
  password hashing, CSRF double-submit + Origin checks (Phase 2)
- RBAC + resource-ownership policy checks enforced server-side on every
  protected operation; clients can never set prices, roles, statuses or totals
- Inventory correctness enforced with PostgreSQL row locking and CHECK
  constraints (no Redis-only locks)
- Payment webhooks authenticated via HMAC over the raw body, deduplicated,
  replay-protected; idempotent handlers
- Integer minor-unit money everywhere; immutable monetary snapshots on orders;
  balanced double-entry ledger
- Strict input validation at every trust boundary, allowlisted dynamic SQL
  identifiers, controlled uploads (magic-byte sniffing, randomized keys,
  signed URLs), SSRF-safe outbound policy
- Audit logging for privileged operations; secret redaction in logs

See [docs/security/threat-model.md](docs/security/threat-model.md),
[SECURITY.md](SECURITY.md) and the
[access-control matrix](docs/security/access-control-matrix.md).

## Testing

```bash
pnpm test            # everything (builds first)
pnpm test:unit
pnpm test:integration  # real PostgreSQL + Redis via docker compose
```

Property-based tests (fast-check) cover monetary invariants, allocation
rounding and cursor tamper-evidence. Concurrency tests for inventory and
checkout arrive with Phases 4-5 and are a hard acceptance criterion.

## Known limitations (honest list)

- Phases 2-11 are not implemented yet (see [roadmap](docs/roadmap.md));
  identity, catalog, checkout, payments, ledger and fulfillment are planned
  work, not shipped features
- MinIO Community Edition images were removed from public registries in 2026;
  local S3-compatible storage currently uses a digest-pinned Chainguard MinIO
  build (see `docs/adr/013-local-object-storage.md`)
- No measured performance numbers are published until the k6 scenarios in
  Phase 8 produce them
- The project demonstrates security engineering practices but makes no claim
  of formal compliance certification or zero vulnerabilities

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions and the
Definition of Done every change must satisfy.

## License

MIT — see [LICENSE](LICENSE).
