import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Forked processes keep pg/redis connections isolated between test files.
    pool: 'forks',
    reporters: ['default'],
  },
});
