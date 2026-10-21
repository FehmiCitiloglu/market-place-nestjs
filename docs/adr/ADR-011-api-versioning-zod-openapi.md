# ADR-011: API Versioning with zod-First OpenAPI Contracts

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

The REST API is the product surface. Schemas must be validated at every trust boundary, documented in OpenAPI, and kept in sync with implementation. Versioning must let the API evolve without silent breakage. Options: handwritten OpenAPI + codegen, zod-first schemas generating OpenAPI, GraphQL.

## Options considered

1. **Handwritten OpenAPI YAML + codegen validators** — spec-first; drift between spec and code is the classic failure mode.
2. **zod 4 schemas as single source of truth + `zod-openapi` generating OpenAPI 3.1** — one definition drives runtime validation, TypeScript types, and docs; drift is structurally impossible.
3. **GraphQL** — flexible queries; weak fit for command-heavy checkout/payment flows, adds its own security surface.

## Decision

- **zod 4 schemas in `packages/contracts`** are the single source of truth: request/response validation at every trust boundary, inferred TS types, and **OpenAPI 3.1 generation via zod-openapi**.
- REST under **`/api/v1`**; the major version is in the path. Additive changes (new optional fields, new endpoints) ship within v1; breaking changes require `/api/v2` with v1 maintained for a documented overlap window.
- Swagger UI is served at **`/docs` in non-production**; in production it is disabled or restricted by configuration (default: disabled).
- Error responses use **RFC 9457 Problem Details** (`application/problem+json`) with a stable machine-readable `code` field; pagination is cursor-based on large lists.
- Dynamic sort/filter keys are **allowlisted** server-side; unknown body fields are rejected (strict schemas).

## Consequences

- Positive: runtime validation, types, and docs cannot drift; contract tests in CI validate the generated spec (lint + snapshot); consumers can rely on stable error codes.
- Negative: zod schema ergonomics constrain some OpenAPI features (documented in `packages/contracts`); generating 3.1 requires care with nullable/optional semantics (covered by contract tests).
- Event schemas live in the same package and share the versioning policy of `docs/architecture/outbox-processing.md` (`schema_version`), separate from URL versioning.

## Reversal criteria

If spec-first consumer codegen becomes a hard requirement, generate the OpenAPI artifact from zod and distribute that (already possible); only move to spec-first authoring if a consumer-driven contract platform is adopted.
