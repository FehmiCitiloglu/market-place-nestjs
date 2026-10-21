import { defineConfig } from 'drizzle-kit';
import { loadEnvFileIfPresent } from '@mercato/config';

loadEnvFileIfPresent();

/**
 * drizzle-kit configuration for schema diffing and migration generation.
 * Migrations are applied by src/db/migrate.ts (separate credentials supported).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env['DATABASE_MIGRATION_URL'] ?? process.env['DATABASE_URL'] ?? '',
  },
  strict: true,
  verbose: true,
});
