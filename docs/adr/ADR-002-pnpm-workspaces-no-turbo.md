# ADR-002: pnpm Workspaces Without Turborepo

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

The repo holds 2 apps and 4 packages (contracts, config, shared-kernel, testing). Build orchestration options: plain `pnpm -r`, Turborepo, Nx. The requirement is deterministic, cacheable-enough builds with minimal tooling surface.

## Options considered

1. **Turborepo** — remote/local build caching, task graph, `turbo run` pipelines; adds config (`turbo.json`), cache semantics, and another failure surface.
2. **pnpm workspaces + `pnpm -r` scripts** — native ordering via workspace dependencies, `--filter` for targeted runs, zero extra config.
3. **Nx** — powerful graph and generators; heaviest tooling of the three.

## Decision

Use **pnpm 12 workspaces with `pnpm -r` orchestration** (`build`, `typecheck`, `test` run topologically via workspace dependency order). No Turborepo in Phase 0.

## Consequences

- Positive: one tool (pnpm) to learn and debug; `packageManager: pnpm@12.14.0` pins the toolchain; simpler CI; no cache-invalidation surprises.
- Negative: no cross-machine build cache; large CI minutes spent rebuilding unchanged packages (acceptable at 6 packages); no task-graph visualization.
- CI still benefits from pnpm's content-addressable store caching.

## Reversal criteria

Adopt Turborepo when the workspace count grows past roughly 8–10 packages, or CI build time demonstrably dominates the pipeline (measured in CI timings). The migration is low-risk because scripts already follow `build/test/typecheck` naming conventions.
