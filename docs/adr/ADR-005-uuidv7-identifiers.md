# ADR-005: UUIDv7 Application-Side Identifiers

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

Every table needs a primary key that is safe to generate in application code, index-friendly for time-ordered inserts, and non-enumerable (no sequential-id scraping of orders/users). Options: UUIDv4, UUIDv7, ULID, database sequences (bigserial).

## Options considered

1. **UUIDv4** — random, non-enumerable; poor B-tree locality, random page splits at scale.
2. **UUIDv7 (RFC 9562)** — time-ordered prefix + random suffix: monotonic, index-friendly, non-enumerable across the global namespace.
3. **ULID** — similar ordering; less universal tooling, 128-bit but non-standard text form.
4. **bigserial sequences** — best index locality; leaks volume/guessable ids; central-sequence contention; awkward for client-side batch generation.

## Decision

All primary keys are **UUIDv7 generated app-side** via a single monotonic generator in `packages/shared-kernel` (per-process monotonicity: timestamp + counter within the same millisecond). Stored as native `uuid` columns.

## Consequences

- Positive: time-ordered inserts keep B-tree append-like behavior; ids can be created before insert (order + items + seller_orders in one batch); ids are not guessable; no DB round-trip per id.
- Negative: 16-byte keys are wider than bigint (accepted); strictly monotonic ordering across processes is not guaranteed (not required — `created_at` + `id` pair is the cursor key).
- Generator tests cover monotonicity within a process and cross-process uniqueness (statistical + format checks).

## Reversal criteria

Only if a proven UUIDv7 implementation flaw or DB-level generation requirement emerges; the swap would be confined to the shared-kernel generator and column types.
