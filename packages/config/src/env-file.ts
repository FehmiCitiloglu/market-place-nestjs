import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Load the nearest `.env` file, walking up from `startDir`.
 *
 * Monorepo-friendly: package scripts run with cwd set to the package
 * directory, while the shared `.env` (also used by docker compose) lives at
 * the repository root.
 */
export function loadEnvFileIfPresent(startDir: string = process.cwd()): void {
  let directory = resolve(startDir);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}
