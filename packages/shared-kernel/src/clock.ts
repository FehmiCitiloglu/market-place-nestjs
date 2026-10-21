/** Injectable time source so time-dependent logic is testable. */
export interface Clock {
  now(): Date;
  nowMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests; time only moves when explicitly advanced. */
export class FixedClock implements Clock {
  private currentMs: number;

  constructor(start: Date = new Date('2026-01-01T00:00:00.000Z')) {
    this.currentMs = start.getTime();
  }

  now(): Date {
    return new Date(this.currentMs);
  }

  nowMs(): number {
    return this.currentMs;
  }

  set(date: Date): void {
    this.currentMs = date.getTime();
  }

  advance(ms: number): void {
    this.currentMs += ms;
  }
}
