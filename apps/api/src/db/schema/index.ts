/**
 * Database schema registry.
 *
 * Each bounded context registers its tables here as its module lands
 * (Phase 2 starts with identity). Table ownership is documented in
 * docs/architecture/domain-boundaries.md; migrations are generated from this
 * file via `pnpm db:generate`.
 */
export {};
