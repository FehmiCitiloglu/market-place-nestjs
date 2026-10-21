import { randomBytes } from 'node:crypto';

/**
 * UUIDv7 (RFC 9562) generation.
 *
 * Layout: 48-bit unix timestamp in milliseconds, 4-bit version (7),
 * 12-bit rand_a, 2-bit variant (10), 62-bit rand_b.
 *
 * Identifiers are generated application-side so the same strategy can be
 * used for database keys, event ids and correlation identifiers without
 * depending on database extensions. Within the same millisecond the random
 * field is incremented so that generated ids are strictly monotonic
 * (important for cursor pagination and index locality).
 */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const TIMESTAMP_BYTES = 6;
const RANDOM_BYTES = 10;

let lastTimestampMs = -1;
let lastRandom: Buffer = Buffer.alloc(RANDOM_BYTES);

function encodeUuid(timestampMs: number, random: Buffer): string {
  const bytes = Buffer.alloc(16);
  // 48-bit big-endian timestamp
  bytes.writeUIntBE(timestampMs, 0, TIMESTAMP_BYTES);
  // version 7 + 12 bits of rand_a (top 4 bits of random[0])
  bytes[6] = 0x70 | ((random[0] ?? 0) & 0x0f);
  bytes[7] = random[1] ?? 0;
  // variant 10xx + 6 bits of rand_b (top 6 bits of random[2])
  bytes[8] = 0x80 | ((random[2] ?? 0) & 0x3f);
  random.copy(bytes, 9, 3, RANDOM_BYTES);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Increment the 74-bit random field in place; returns false on overflow. */
function incrementRandom(random: Buffer): boolean {
  for (let i = RANDOM_BYTES - 1; i >= 0; i -= 1) {
    const next = ((random[i] ?? 0) + 1) & 0xff;
    random[i] = next;
    if (next !== 0) {
      return true;
    }
  }
  return false;
}

/**
 * Generate a new UUIDv7.
 *
 * @param nowMs unix timestamp in milliseconds; defaults to the system clock.
 */
export function newUuidV7(nowMs: number = Date.now()): string {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 0xffffffffffff) {
    throw new RangeError('timestamp out of range for UUIDv7');
  }
  let timestampMs = nowMs;
  if (timestampMs === lastTimestampMs && !incrementRandom(lastRandom)) {
    // Random field overflowed within the same millisecond: move the
    // timestamp forward by 1ms to preserve strict monotonicity.
    timestampMs = lastTimestampMs + 1;
    lastRandom = randomBytes(RANDOM_BYTES);
  } else if (timestampMs !== lastTimestampMs) {
    lastRandom = randomBytes(RANDOM_BYTES);
  }
  lastTimestampMs = timestampMs;
  return encodeUuid(timestampMs, lastRandom);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value);
}

/** Extract the embedded unix millisecond timestamp from a UUIDv7. */
export function uuidV7TimestampMs(value: string): number {
  if (!isUuidV7(value)) {
    throw new TypeError('not a UUIDv7');
  }
  return Buffer.from(value.replace(/-/g, ''), 'hex').readUIntBE(0, TIMESTAMP_BYTES);
}

export function uuidV7ToDate(value: string): Date {
  return new Date(uuidV7TimestampMs(value));
}
