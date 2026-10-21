# ADR-004: Drizzle ORM with Generated SQL Migrations

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

Data access must use parameterized SQL only, schema changes must be reviewed and repeatable, and runtime DB credentials must not include DDL rights. Options: Drizzle ORM + drizzle-kit, Prisma, Kysely/SQL-only, TypeORM.

## Options considered

1. **Drizzle ORM + drizzle-kit SQL migrations** — TypeScript schema colocated with code, SQL migrations are plain reviewable files, typed query builder close to SQL, no codegen daemon.
2. **Prisma** — excellent DX and migrations; heavier runtime engine, schema in its own DSL, less transparent SQL.
3. **Kysely + hand-written migrations** — maximum SQL transparency; more boilerplate for schema diffs.
4. **TypeORM** — decorators and entity graph; migration quality and typing weaker than the above.

## Decision

Use **Drizzle ORM with drizzle-kit generated SQL migrations**, committed to the repo and applied by `pnpm db:migrate` using a dedicated **migration DB role** (DDL). The runtime role has DML only. Query building is typed and parameterized; raw SQL is allowed where the query builder cannot express a locking clause, but always with bound parameters.

## Consequences

- Positive: migrations are diffable SQL; schema lives in TypeScript next to the tables' owning modules; typed results catch column drift at compile time; split roles enforce least privilege at the DB level.
- Negative: drizzle-kit generation can produce imperfect diffs for complex changes — every generated migration is reviewed by a human before commit (CI verifies it applies from empty and from the previous snapshot).
- Rollback strategy is expand/contract (see `docs/operations/database-migrations.md`), not down-migrations for destructive changes.

## Reversal criteria

Reconsider if drizzle-kit cannot express a needed migration cleanly in repeated cases, or if the team grows to need Prisma-class multi-schema tooling. The SQL migration files remain portable evidence either way.
