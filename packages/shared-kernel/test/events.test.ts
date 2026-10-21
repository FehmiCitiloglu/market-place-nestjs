import { describe, expect, it } from 'vitest';
import { createDomainEvent, isUuidV7 } from '../src/index.js';

describe('domain events', () => {
  it('creates events with uuidv7 ids and ISO timestamps', () => {
    const occurredAt = new Date('2026-03-01T12:00:00.000Z');
    const event = createDomainEvent({
      eventType: 'order.created',
      eventVersion: 1,
      aggregateType: 'order',
      aggregateId: '01890a5d-ac96-774b-bcce-b302099a8057',
      payload: { totalMinor: '1234', currency: 'USD' },
      occurredAt,
      metadata: { correlationId: 'corr-1' },
    });
    expect(isUuidV7(event.eventId)).toBe(true);
    expect(event.occurredAt).toBe('2026-03-01T12:00:00.000Z');
    expect(event.eventVersion).toBe(1);
    expect(event.metadata.correlationId).toBe('corr-1');
    expect(event.payload).toEqual({ totalMinor: '1234', currency: 'USD' });
  });
});
