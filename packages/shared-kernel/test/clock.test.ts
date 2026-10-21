import { describe, expect, it } from 'vitest';
import { FixedClock, SystemClock } from '../src/clock.js';

describe('clock', () => {
  it('system clock tracks real time', () => {
    const clock = new SystemClock();
    const before = Date.now();
    expect(clock.nowMs()).toBeGreaterThanOrEqual(before);
  });

  it('fixed clock only moves when advanced', () => {
    const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    clock.advance(1500);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:01.500Z');
    clock.set(new Date('2026-02-01T00:00:00.000Z'));
    expect(clock.nowMs()).toBe(Date.parse('2026-02-01T00:00:00.000Z'));
  });
});
