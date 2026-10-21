import { createHmac, timingSafeEqual } from 'node:crypto';
import { ValidationError } from './errors.js';

/**
 * Opaque, tamper-evident cursor pagination.
 *
 * The cursor payload holds deterministic sort-key values; it is signed with
 * HMAC-SHA256 so clients cannot craft cursors that change query semantics.
 * Cursors expire so that a leaked URL cannot be replayed indefinitely.
 */
export interface CursorPayload {
  readonly [key: string]: string | number | boolean | null;
}

interface CursorEnvelope {
  readonly p: CursorPayload;
  readonly iat: number;
}

function toCursorPayload(value: object): CursorPayload | null {
  const result: Record<string, string | number | boolean | null> = {};
  const entries: Array<[string, unknown]> = Object.entries(value);
  for (const [key, entry] of entries) {
    if (
      entry !== null &&
      typeof entry !== 'string' &&
      typeof entry !== 'number' &&
      typeof entry !== 'boolean'
    ) {
      return null;
    }
    result[key] = entry;
  }
  return result;
}

function parseCursorEnvelope(value: unknown): CursorEnvelope | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('p' in value) || !('iat' in value)) return null;
  const rawPayload: unknown = value.p;
  if (typeof rawPayload !== 'object' || rawPayload === null) return null;
  const payload = toCursorPayload(rawPayload);
  if (payload === null || typeof value.iat !== 'number') return null;
  return { p: payload, iat: value.iat };
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export class CursorCodec {
  private readonly secret: Buffer;
  private readonly ttlSeconds: number;

  constructor(secret: string | Buffer, options: { ttlSeconds?: number } = {}) {
    const secretBuffer = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : secret;
    if (secretBuffer.length < 32) {
      throw new RangeError('cursor signing secret must be at least 32 bytes');
    }
    this.secret = secretBuffer;
    this.ttlSeconds = options.ttlSeconds ?? 24 * 60 * 60;
  }

  encode(payload: CursorPayload, issuedAt: Date = new Date()): string {
    const envelope: CursorEnvelope = { p: payload, iat: issuedAt.getTime() };
    const body = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  decode(cursor: string, now: Date = new Date()): CursorPayload {
    const parts = cursor.split('.');
    const body = parts[0];
    const signature = parts[1];
    if (parts.length !== 2 || body === undefined || signature === undefined || body.length === 0) {
      throw new ValidationError('invalid cursor', [
        { path: 'cursor', message: 'malformed cursor' },
      ]);
    }
    const expected = this.sign(body);
    const provided = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
      throw new ValidationError('invalid cursor', [
        { path: 'cursor', message: 'cursor signature mismatch' },
      ]);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw new ValidationError('invalid cursor', [
        { path: 'cursor', message: 'cursor payload is not valid JSON' },
      ]);
    }
    const envelope = parseCursorEnvelope(parsed);
    if (envelope === null) {
      throw new ValidationError('invalid cursor', [
        { path: 'cursor', message: 'cursor payload has an invalid shape' },
      ]);
    }
    if (now.getTime() - envelope.iat > this.ttlSeconds * 1000) {
      throw new ValidationError('invalid cursor', [
        { path: 'cursor', message: 'cursor has expired' },
      ]);
    }
    return envelope.p;
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
