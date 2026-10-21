/**
 * Dependency-injection tokens.
 *
 * All providers inject dependencies through explicit @Inject(TOKEN) calls.
 * This keeps DI working under esbuild-based tooling (vitest/tsx) which does
 * not emit decorator type metadata, and makes every wiring point greppable.
 */
export const APP_CONFIG = Symbol('APP_CONFIG');
export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const OPENAPI_DOCUMENT = Symbol('OPENAPI_DOCUMENT');
export const APP_LOGGER = Symbol('APP_LOGGER');
