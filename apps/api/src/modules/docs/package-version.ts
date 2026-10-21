import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads the package version at runtime (works from both src/ under tsx and
 * dist/ under node by walking up to the package root).
 */
export function readPackageVersion(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 5; depth += 1) {
    try {
      const raw = readFileSync(join(directory, '..', 'package.json'), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'name' in parsed &&
        'version' in parsed &&
        (parsed as { name: unknown }).name === '@mercato/api'
      ) {
        return String((parsed as { version: unknown }).version);
      }
    } catch {
      // keep walking up
    }
    directory = dirname(directory);
  }
  return '0.0.0';
}
