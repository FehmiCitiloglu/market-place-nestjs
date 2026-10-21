import { newUuidV7 } from './identifiers.js';

/**
 * Domain and integration events.
 *
 * Delivery semantics are at-least-once (transactional outbox + queue relay);
 * consumers must be idempotent and dedupe on `eventId` (see the outbox ADR).
 */
export interface EventMetadata {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly actorId?: string | null;
}

export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly eventId: string;
  readonly eventType: TType;
  /** Schema version of the payload; bumped on breaking changes. */
  readonly eventVersion: number;
  /** ISO-8601 UTC timestamp. */
  readonly occurredAt: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: TPayload;
  readonly metadata: EventMetadata;
}

export function createDomainEvent<TType extends string, TPayload>(params: {
  eventType: TType;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: TPayload;
  occurredAt: Date;
  metadata?: EventMetadata;
}): DomainEvent<TType, TPayload> {
  return {
    eventId: newUuidV7(params.occurredAt.getTime()),
    eventType: params.eventType,
    eventVersion: params.eventVersion,
    occurredAt: params.occurredAt.toISOString(),
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    payload: params.payload,
    metadata: params.metadata ?? {},
  };
}

/** Integration event types published to the outbox. */
export const INTEGRATION_EVENT_TYPES = [
  'user.registered',
  'user.email_verified',
  'seller.approved',
  'store.suspended',
  'product.published',
  'inventory.reserved',
  'inventory.reservation_expired',
  'inventory.reservation_released',
  'checkout.started',
  'order.created',
  'order.cancelled',
  'payment.captured',
  'payment.failed',
  'refund.completed',
  'shipment.dispatched',
  'settlement.completed',
] as const;

export type IntegrationEventType = (typeof INTEGRATION_EVENT_TYPES)[number];
