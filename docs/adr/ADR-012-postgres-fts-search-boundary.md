# ADR-012: PostgreSQL Full-Text Search Behind a Repository Boundary

- **Status:** Accepted (Phase 0)
- **Date:** 2026-10-21

## Context

The marketplace needs product search (title, description, attributes) with relevance ranking, filters, and pagination. Options: PostgreSQL FTS, OpenSearch/Elasticsearch, an external SaaS. Search demand in Phase 0 is modest, but the architecture must allow swapping engines without public API changes.

## Options considered

1. **PostgreSQL FTS (`tsvector`/`ts_rank`, GIN indexes)** — zero extra infrastructure, transactional consistency with the catalog (a published product is instantly searchable), good enough relevance for catalog scale.
2. **OpenSearch cluster** — better relevance tuning, facets, typo tolerance; doubles operational surface, needs index-sync reliability (another consumer), eventual consistency with the catalog.
3. **Hosted search SaaS** — outsourced ops; external dependency, data egress, and demo-stack divergence.

## Decision

Implement search as **PostgreSQL FTS behind a `SearchRepository` interface** in the `search` module. The public search API (query shape, filters, cursor pagination, result DTO) is defined by zod contracts and is engine-independent. Only `published` products of non-suspended stores are indexed/returned. The GIN index is on the tsvector of title + description + attribute text with a configured text-search configuration. Extraction to OpenSearch later would implement the same interface plus an event-driven indexer consuming `ProductPublished`/`ProductUpdated`/`ProductUnpublished` (already in the event catalog).

## Consequences

- Positive: no new infrastructure; search state can never lag the catalog in Phase 0 (same transaction); simple backup/restore story (one database).
- Negative: relevance tuning and typo tolerance are limited compared with OpenSearch; heavy search load shares the transactional DB (mitigated by read replicas if ever needed).
- Performance claims are deferred: no benchmark numbers are stated until k6 runs (Phase 8) measure the actual endpoint.

## Reversal criteria

Switch to Opensearch when measured search latency/relevance or load requires it; the trigger is a k6 result or a concrete relevance failure, not preference. The repository boundary plus event catalog make the change additive: add an indexer consumer and an OpenSearch implementation of `SearchRepository`.
