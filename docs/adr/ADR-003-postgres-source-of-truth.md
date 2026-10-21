# ADR-003: PostgreSQL as the Transactional Source of Truth

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

Mercato needs strong consistency for orders, inventory, payments state, and a balanced ledger; plus full-text search, JSON snapshots, and a local demo stack. Redis is in the stack for queues and rate limits.

## Options considered

1. **PostgreSQL for all business state; Redis strictly ephemeral** — ACID transactions, row locking, CHECK constraints, mature tooling.
2. **Split-brain by domain** (e.g. inventory in Redis, orders in Postgres) — fast counters, but cross-store atomicity is impossible without sagas everywhere.
3. **Newer distributed SQL (CockroachDB, etc.)** — horizontal scale; heavier ops, and demo/local parity suffers.

## Decision

**PostgreSQL 17/18 is the single transactional source of truth.** Redis (ioredis) is used only for rate limits, ephemeral state, and BullMQ queues — **never** as source of truth for orders, inventory, or balances. Every durable business change is a PostgreSQL transaction; async work is described by rows (outbox, reservation expiry timestamps) that survive Redis loss.

## Consequences

- Positive: one consistency model; `SELECT ... FOR UPDATE` + CHECK constraints give provable inventory correctness (ADR-008); backups and audit are single-system; losing Redis only delays work, never loses it.
- Negative: single-database scaling ceiling (acceptable at this scope); PostgreSQL is a throughput bottleneck for extreme hot-row contention (mitigated by short transactions and lock metrics).
- FTS lives in PostgreSQL behind a repository boundary (ADR-012) so the read side can move later.

## Reversal criteria

Introduce a second source-of-truth store only with a measured scale need and an ADR covering consistency, backup, and failover implications.
