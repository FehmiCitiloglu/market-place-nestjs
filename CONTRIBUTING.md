# Contributing

Mercato is a production-oriented, security-first multi-vendor marketplace backend built as a TypeScript modular monolith. Thanks for your interest — this document covers setup, commands, code style, and the PR checklist that mirrors our Definition of Done.

## Prerequisites

| Tool                    | Version                                                |
| ----------------------- | ------------------------------------------------------ |
| Node.js                 | 24 LTS — pinned **24.21.0** (`engines`, `.nvmrc`)      |
| pnpm                    | 12 (pinned via `packageManager`)                       |
| Docker + compose plugin | recent stable (runs PostgreSQL, Redis, MinIO, Mailpit) |

## Development setup

```bash
pnpm install            # frozen lockfile; do not hand-edit pnpm-lock.yaml
cp .env.example .env    # fill in local values; .env is gitignored — never commit it
pnpm infra:up           # docker compose up -d (postgres, redis, minio, mailpit)
pnpm db:migrate         # apply SQL migrations
pnpm dev                # run the API (and worker) in watch mode
```

Ports and credentials come from `.env` — see `.env.example` for placeholders. Email is captured by Mailpit (UI address in `.env`); nothing leaves your machine.

## Commands

| Command                                       | Purpose                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm install`                                | install dependencies (frozen lockfile)                           |
| `pnpm infra:up` / `infra:down` / `infra:logs` | manage the local infrastructure stack                            |
| `pnpm db:migrate`                             | apply migrations                                                 |
| `pnpm db:generate`                            | generate migration SQL from schema changes                       |
| `pnpm dev`                                    | run apps in watch mode                                           |
| `pnpm test`                                   | run all tests (add `test:unit` / `test:integration` for subsets) |
| `pnpm lint`                                   | ESLint (includes import-cycle rules)                             |
| `pnpm typecheck`                              | TypeScript strict checks across workspaces                       |
| `pnpm format:check`                           | Prettier check (CI gate)                                         |
| `pnpm build`                                  | build all workspaces                                             |

## Code style and hard rules

1. **TypeScript 6 strict mode.** No `any` (including `as any`); no `@ts-ignore` without an inline justification comment. Use `unknown` + narrowing at boundaries.
2. **Business logic lives outside controllers.** Controllers parse/validate and delegate to application services; domain rules live in the owning module (see [docs/architecture/domain-boundaries.md](docs/architecture/domain-boundaries.md)).
3. **Validate at every trust boundary.** All request bodies/queries/params go through zod schemas from `packages/contracts`; strict schemas — reject unknown fields. Clients can never set price, role, status, ownership, or totals.
4. **Parameterized SQL only.** Never concatenate user input into SQL (Drizzle bound params; raw SQL always with placeholders). This is a security rule, not a style preference.
5. **Money is integer minor units + ISO-4217 currency** ([ADR-006](docs/adr/ADR-006-money-integer-minor-units.md)). Never floats.
6. **Identifiers are UUIDv7** from `packages/shared-kernel`; timestamps are `timestamptz` UTC.
7. **Module boundaries are law:** one module owns each table; cross-module access goes through application interfaces or events; dependencies must stay acyclic.
8. **Side effects that must survive crashes go through the outbox** ([ADR-009](docs/adr/ADR-009-transactional-outbox.md)); consumers must be idempotent.
9. **Structured logging** (pino) with request-id/trace-id and secret redaction. Never log tokens, cookies, passwords, or webhook signatures.
10. **Errors** use RFC 9457 Problem Details with stable `code` values; no stack traces or internals cross the API boundary.

## Testing expectations

- Unit tests (vitest) for pure logic; integration tests against **real** PostgreSQL/Redis via the compose infra (no mocked databases for concurrency claims).
- Property tests (fast-check) for money, stock, order transitions, coupons, and idempotency invariants.
- Security changes ship with a regression test in `tests/security/` named per the [threat-model mapping](docs/security/threat-model.md#8-mitigation--test-mapping).
- Concurrency-sensitive changes must state which concurrency test covers them.

## Pull request checklist (Definition of Done)

- [ ] Implementation complete against the referenced issue/ADR
- [ ] Input validated at every touched boundary (zod, strict schemas)
- [ ] Authorization reviewed: role + ownership + state checks on every new/changed operation; [access matrix](docs/security/access-control-matrix.md) updated if behavior changed
- [ ] Positive **and** negative tests added (including the failure path, not just the happy path)
- [ ] Concurrency considered; relevant concurrency/property tests added or cited
- [ ] Structured logging in place with redaction; no secrets in logs or errors
- [ ] OpenAPI/contracts updated (`packages/contracts`) and contract tests green
- [ ] Migration included if schema changed, following [expand/contract](docs/operations/database-migrations.md#5-destructive-changes-expand--contract)
- [ ] Security notes added where the change touches auth, payments, uploads, webhooks, or admin actions
- [ ] Existing tests green: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`

## Commits and review

- Prefer small, focused PRs; reference the ADR or docs section a change implements.
- Commit messages: imperative mood, explain _why_ when the diff cannot.
- Security-relevant changes need a second pair of eyes when available; when solo, self-review against the PR checklist explicitly.

## Where to look first

- [docs/README.md](docs/README.md) — documentation index
- [docs/architecture/overview.md](docs/architecture/overview.md) — system shape and quality priorities
- [docs/roadmap.md](docs/roadmap.md) — what exists and what is planned
- [SECURITY.md](SECURITY.md) — reporting and posture
