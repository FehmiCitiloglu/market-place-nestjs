# ADR-001: Modular Monolith Instead of Microservices

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

Mercato has 18 bounded contexts spanning identity, catalog, inventory, checkout, payments, settlement, and more. The project must demonstrate production-grade discipline (strict boundaries, failure recovery, security) while remaining buildable and demoable by a small team. Deployment, observability, and debugging complexity scale sharply with the number of independently deployed services.

## Options considered

1. **Microservices per bounded context** — maximum isolation and independent scaling; requires distributed tracing, per-service auth, network failure handling, and CI/CD for many deployables from day one.
2. **Modular monolith** — one deployable per app tier (api, worker) with strictly separated modules; single DB transaction boundary; low operational overhead.
3. **Serverless functions per use case** — elastic; poor fit for long transactions, row locking, and local demo stack parity.

## Decision

Build **apps/api as a NestJS modular monolith** with one module per bounded context, and **apps/worker** as the async processing deployable. Module boundaries are enforced (exclusive table ownership, application interfaces/events only, acyclic dependencies — see `docs/architecture/domain-boundaries.md`).

## Consequences

- Positive: single transaction boundary makes the checkout atomicity and outbox pattern straightforward; one deployment to secure, observe, and demo; fast local dev via docker compose.
- Negative: a memory/CPU-hungry module can affect others; scaling is per-process, not per-context; discipline is required to keep module coupling clean (mitigated by lint rules and review).
- Extraction candidates are pre-identified: search/indexing, notification processing, media processing, analytics (Phase 11, one optional Go service).

## Reversal criteria

Extract a context when: (a) its load profile demonstrably differs (measured, not guessed), or (b) cross-team ownership appears, or (c) module coupling violations keep recurring despite enforcement. Extraction starts with the already-defined event contracts.
