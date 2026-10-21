# ADR-006: Money as Integer Minor Units with ISO-4217 Currency

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

Marketplace money math spans pricing, tax, discounts, commission, refunds, and a double-entry ledger. Floating-point rounding errors are unacceptable; multi-currency support is required; order history must survive later price changes.

## Options considered

1. **Integer minor units + currency code** — exact arithmetic, no rounding surprises, simple serialization.
2. **`numeric`/`decimal` columns with explicit scale** — exact but easy to misuse across languages; scale drift risk at boundaries.
3. **Floating point with rounding helpers** — rejected outright: cumulative rounding errors in ledger sums.
4. **BigInt-only without currency** — rejected: multi-currency totals would be ambiguous.

## Decision

Store and transmit all monetary amounts as **integer minor units (int64 range)** paired with an **ISO-4217 currency code** on every monetary column. A per-currency minor-unit scale table in `packages/shared-kernel` maps currency → decimal places (USD → 2, JPY → 0, etc.). No float/double/numeric columns for money. Order items carry **immutable snapshots** of price, discount, tax, and commission taken at order time. Ledger entries must balance to zero **per currency**.

## Consequences

- Positive: exact arithmetic everywhere; property tests can assert conservation laws (split-sum, refund ≤ capture, ledger balance); JSON serialization is unambiguous.
- Negative: every money-aware API and table needs the currency pair; conversion between currencies is out of scope (single-currency orders only; a cart mixing currencies is rejected).
- Rounding policy is explicit: round half-up at defined boundaries (tax and discount computation order documented in `packages/contracts`), covered by unit tests.

## Reversal criteria

None foreseeable. If a currency with non-decimal minor units appeared, the scale table absorbs it without schema change.
