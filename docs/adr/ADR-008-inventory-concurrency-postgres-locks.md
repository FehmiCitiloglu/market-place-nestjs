# ADR-008: Inventory Concurrency via PostgreSQL Row Locks

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

Overselling is a hard failure for a marketplace. Stock is contended by concurrent checkouts, payment confirmations, expiry sweeps, and cancellations. Options: distributed locks (Redis), optimistic versioning, PostgreSQL pessimistic row locks, or external inventory services.

## Options considered

1. **Redis locks (Redlock-style)** — fast, but the lock is not transactional with the data change: a crash between lock and commit breaks correctness; Redis flush loses mutual exclusion; violates ADR-003 (Redis never authoritative).
2. **Optimistic concurrency (version column + retry)** — no lock waits, but high-contention checkout causes retry storms and long tail latency; partial multi-line reservation success handling is complex.
3. **PostgreSQL `SELECT ... FOR UPDATE` + conditional UPDATE + CHECK constraints** — mutual exclusion is in the same transaction as the data change; constraints make negative stock impossible even if application logic errs.
4. **External inventory microservice** — distributed consistency problems reappear as network problems; rejected with ADR-001.

## Decision

Use **pessimistic row locking in PostgreSQL** for inventory mutations:

- `SELECT ... FOR UPDATE` on `inventory_items` rows in deterministic ascending id order (deadlock avoidance).
- Conditional `UPDATE ... WHERE available >= $qty` as a second guard; zero rows updated → `stock-unavailable`.
- CHECK constraints (`available >= 0`, `reserved >= 0`, `committed >= 0`) make negative stock unrepresentable.
- Reservation state transitions are conditional (`WHERE state = 'pending'`) so expiry vs. confirm races resolve to exactly one winner.
- The expiry sweep uses `FOR UPDATE SKIP LOCKED` so multiple workers cooperate.
- No correctness-relevant lock may ever live in Redis.

## Consequences

- Positive: correctness is provable and constraint-backed; the required concurrency matrix (100 buyers vs 10 units, expiry-vs-payment race, duplicate checkout, repeated release, worker crash) is testable against real PostgreSQL in CI.
- Negative: hot rows serialize (a flash-sale variant queues buyers) — accepted, correctness first; lock waits must be monitored (Phase 8 metrics); deadlock risk is controlled by lock ordering, verified by test #7 in the matrix.

## Reversal criteria

If measured contention shows unacceptable tail latency at realistic load (k6, Phase 8), consider queueing checkout requests per variant or optimistic retry for low-contention variants. Never trade the constraint-backed guarantee away.
