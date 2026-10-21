# ADR-010: PaymentProvider Abstraction with Mock Provider

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

The marketplace needs payment initiation, authorization, capture, failure, cancellation, and refund flows with asynchronous webhook confirmation — without depending on a real PSP for development and CI, and without ever handling PAN/CVV. The design must remain portable to a real provider (Stripe, Iyzico, etc.) later.

## Options considered

1. **Direct integration with a real PSP in dev** — realistic; requires accounts, secrets, network dependency in CI, and card data adjacency; poor test determinism.
2. **`PaymentProvider` interface + mock provider implementing its webhook contract** — deterministic, offline, fully testable including signature/replay paths.
3. **No payments abstraction (hardcode a fake)** — fastest; guarantees a rewrite later and hides failure modes.

## Decision

Define a **`PaymentProvider` interface** (initiate, authorize, capture, fail, cancel, refund, status/reconciliation) and implement a **mock provider service** used in dev, tests, and demos. The mock exposes the real webhook contract: async callbacks with **HMAC-SHA256 signatures over the raw body**, timestamp header with replay window (±120 s default), and provider event ids for dedupe. Mock-only simulation endpoints (authorize/fail) live behind a guard that refuses to enable in production configuration. Provider state machine and failure scenarios are specified in `docs/architecture/payment-workflow.md`.

## Consequences

- Positive: CI can deterministically test every failure scenario from the brief (duplicate webhooks, delayed capture after cancellation, retried refunds); signature verification code is exercised exactly as it would be against a real PSP; no secrets beyond a shared webhook HMAC key in dev.
- Negative: a real integration will differ in details (payload fields, retry semantics) — the interface isolates but does not eliminate adapter work; there is a standing risk of overfitting tests to mock behavior (mitigate by keeping contract tests provider-contract-shaped, and by property tests over the state machine).
- PAN/CVV policy: never stored, logged, or proxied; mock uses tokenized test instruments only.

## Reversal criteria

When a real provider is integrated: the mock remains the CI provider; the real adapter must pass the same contract suite before enabling. The interface changes only through an ADR.
