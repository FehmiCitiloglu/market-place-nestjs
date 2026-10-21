import { describe, expect, it } from 'vitest';
import { Validator } from '@seriousme/openapi-schema-validator';
import { buildOpenApiDocument } from '../src/index.js';

/**
 * Contract gate: the generated document must validate against the official
 * OpenAPI 3.1 schema. CI runs this via `pnpm --filter @mercato/contracts
 * validate:openapi` so contract breakage fails the pipeline.
 */
describe('OpenAPI 3.1 meta-schema validation', () => {
  it('generated document is a valid OpenAPI 3.1 document', async () => {
    const document = buildOpenApiDocument({ version: '0.1.0', environment: 'test' });
    const validator = new Validator();
    // SpecData is a plain record; a spread converts without type assertions.
    const spec: Record<string, unknown> = { ...document };
    const result = await validator.validate(spec);
    expect(result.valid, `meta-schema errors: ${JSON.stringify(result.errors ?? [], null, 2)}`).toBe(true);
  });
});
