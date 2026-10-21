import { describe, expect, it } from 'vitest';
import {
  isUuid,
  isUuidV7,
  newUuidV7,
  uuidV7ToDate,
  uuidV7TimestampMs,
} from '../src/identifiers.js';

describe('uuidv7', () => {
  it('generates valid UUIDv7 strings', () => {
    for (let i = 0; i < 1000; i += 1) {
      const id = newUuidV7();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(isUuid(id)).toBe(true);
      expect(isUuidV7(id)).toBe(true);
    }
  });

  it('is strictly monotonic across calls', () => {
    const ids = Array.from({ length: 5000 }, () => newUuidV7());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is monotonic across millisecond boundaries', () => {
    const now = Date.now();
    const a = newUuidV7(now);
    const b = newUuidV7(now + 1);
    expect(a < b).toBe(true);
  });

  it('embeds and recovers the timestamp', () => {
    const now = Date.now();
    const id = newUuidV7(now);
    expect(uuidV7TimestampMs(id)).toBe(now);
    expect(uuidV7ToDate(id).getTime()).toBe(now);
  });

  it('rejects out-of-range timestamps', () => {
    expect(() => newUuidV7(-1)).toThrow(RangeError);
    expect(() => newUuidV7(1.5)).toThrow(RangeError);
    expect(() => newUuidV7(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });

  it('rejects non-UUIDv7 input for timestamp extraction', () => {
    expect(() => uuidV7TimestampMs('not-a-uuid')).toThrow(TypeError);
    expect(isUuidV7('01890a5d-ac96-774b-bcce-b302099a8057')).toBe(true);
    expect(isUuidV7('01890a5d-ac96-474b-bcce-b302099a8057')).toBe(false);
  });
});
