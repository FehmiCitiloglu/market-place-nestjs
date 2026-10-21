# ADR-009: Transactional Outbox for Domain Events

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

Order creation must trigger inventory confirmation, ledger postings, notifications, and search updates. Publishing events directly from the business transaction (dual-write to a queue) creates a window where the DB commit succeeded but the publish failed — or vice versa — losing or duplicating business effects. Delivery must survive process crashes.

## Options considered

1. **Dual-write (DB commit + immediate queue publish)** — simple; the classic partial-failure gap; needs reconciliation forever.
2. **Transactional outbox** — event rows written in the same DB transaction; a relay publishes asynchronously; at-least-once with idempotent consumers.
3. **Change-data-capture (Debezium on WAL)** — no polling; significant operational machinery for a two-app monolith; hard to demo and debug locally.
4. **Database as queue (`LISTEN/NOTIFY` polling)** — outbox minus the ecosystem; weaker retry/dead-letter tooling.

## Decision

Implement the **transactional outbox**: `outbox_events` rows are inserted in the same PostgreSQL transaction as the business change; an outbox relay in `apps/worker` publishes to BullMQ with `FOR UPDATE SKIP LOCKED` scanning; consumers dedupe via `inbox_processed_events` and are idempotent (see `docs/architecture/outbox-processing.md`). Delivery claim: **at-least-once**; exactly-once effects via dedupe; no exactly-once delivery claim.

## Consequences

- Positive: no lost events after commit; crash-safe; replay/repair tooling can re-drive from rows; consumers can be tested for idempotency deterministically.
- Negative: events arrive with relay latency (poll interval, default near-real-time with 1s scan — configured); duplicates are normal and every consumer must handle them; ordering is per-aggregate-causal at best, not global.
- The event envelope is versioned (`schema_version`) and contract-tested in CI.

## Reversal criteria

Move to CDC if relay polling measurably lags under load or if multiple independent services need the same stream. The envelope and consumer idempotency requirements survive that migration unchanged.
