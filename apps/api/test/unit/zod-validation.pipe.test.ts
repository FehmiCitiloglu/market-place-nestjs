import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '@mercato/shared-kernel';
import { zodPipe } from '../../src/common/http/zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    email: z.string().email(),
    quantity: z.coerce.number().int().min(1),
  });

  it('returns parsed data for valid input', () => {
    const pipe = zodPipe(schema);
    expect(pipe.transform({ email: 'a@b.co', quantity: '2' })).toEqual({
      email: 'a@b.co',
      quantity: 2,
    });
  });

  it('throws ValidationError with issue details on invalid input', () => {
    const pipe = zodPipe(schema);
    try {
      pipe.transform({ email: 'nope', quantity: 0 });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const validation = error as ValidationError;
      expect(validation.status).toBe(422);
      expect(validation.issues.map((issue) => issue.path).sort()).toEqual(['email', 'quantity']);
    }
  });

  it('rejects unknown values for object schemas', () => {
    const pipe = zodPipe(schema);
    expect(() => pipe.transform(undefined)).toThrow(ValidationError);
    expect(() => pipe.transform('string')).toThrow(ValidationError);
  });
});
