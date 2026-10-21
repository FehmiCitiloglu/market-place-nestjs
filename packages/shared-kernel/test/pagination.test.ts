import { describe, expect, it } from 'vitest';
import { CursorCodec, ValidationError } from '../src/index.js';

const secret = 'test-secret-that-is-at-least-32-bytes-long!';

describe('cursor pagination', () => {
  it('round-trips payloads', () => {
    const codec = new CursorCodec(secret);
    const cursor = codec.encode({ id: 'abc', createdAt: 123456, done: true, note: null });
    expect(codec.decode(cursor)).toEqual({ id: 'abc', createdAt: 123456, done: true, note: null });
  });

  it('rejects tampered payloads', () => {
    const codec = new CursorCodec(secret);
    const cursor = codec.encode({ id: 'abc' });
    const [body, signature] = cursor.split('.');
    const tampered = Buffer.from(
      JSON.stringify({ p: { id: 'attacker' }, iat: Date.now() }),
    ).toString('base64url');
    expect(() => codec.decode(`${tampered}.${signature ?? ''}`)).toThrow(ValidationError);
    expect(() => codec.decode(`${body ?? ''}.AAAA`)).toThrow(ValidationError);
  });

  it('rejects malformed cursors', () => {
    const codec = new CursorCodec(secret);
    expect(() => codec.decode('not-a-cursor')).toThrow(ValidationError);
    expect(() => codec.decode('')).toThrow(ValidationError);
  });

  it('expires cursors', () => {
    const codec = new CursorCodec(secret, { ttlSeconds: 60 });
    const cursor = codec.encode({ id: 'abc' }, new Date('2026-01-01T00:00:00.000Z'));
    expect(() => codec.decode(cursor, new Date('2026-01-01T00:00:30.000Z'))).not.toThrow();
    try {
      codec.decode(cursor, new Date('2026-01-01T00:02:00.000Z'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues[0]?.message).toMatch(/expired/);
    }
  });

  it('requires a strong signing secret', () => {
    expect(() => new CursorCodec('short')).toThrow(RangeError);
  });
});
