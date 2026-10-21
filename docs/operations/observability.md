# Observability

Status: Phase 0 (design). Three pillars: structured logs (pino), metrics (Prometheus), traces (OpenTelemetry → Jaeger/OTel collector). Full instrumentation lands in **Phase 8**; this document defines the contract so early code logs in the right shape. No measured numbers are claimed anywhere.

## 1. Logging (pino structured JSON)

Every log line is JSON with these fields where applicable:

| Field                                          | Source                                       | Notes                                |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------ |
| `time`                                         | pino default                                 | ISO-8601 UTC                         |
| `level`                                        | pino                                         | error/warn/info/debug                |
| `msg`                                          | call site                                    | stable, low-cardinality message text |
| `request_id`                                   | inbound `X-Request-Id` or generated (UUIDv7) | echoed in the response header        |
| `trace_id` / `span_id`                         | OTel context                                 | links logs to traces                 |
| `actor_type`, `actor_id`                       | session resolution                           | `guest` when unauthenticated         |
| `route`, `method`, `status`, `duration_ms`     | request lifecycle                            | per-request summary line             |
| `event_id`, `event_type`, `consumer`, `result` | outbox consumers                             | see outbox doc                       |
| `error_code`                                   | Problem Details `code`                       | stable machine codes, not messages   |

**Redaction (mandatory):** `authorization`, `cookie`, `set-cookie`, `password`, `token`, `secret`, `hmac`, signature headers, provider raw bodies — redacted by pino redact paths; verified by `tests/security/log-redaction.test.ts` (planned). Full webhook bodies and signature headers are **never** logged; at most a truncated hash reference for correlation.

Log levels: `info` for lifecycle events (order created, payment captured), `warn` for retry/degradation, `error` for failures with stack (stack stays server-side only), `debug` for decision-point traces (authorization outcomes).

## 2. Metrics (Prometheus, Phase 8)

Suggested initial set (names indicative):

| Metric                                                     | Type          | Purpose                     |
| ---------------------------------------------------------- | ------------- | --------------------------- |
| `http_requests_total{route,method,status}`                 | counter       | traffic + error rates       |
| `http_request_duration_seconds{route}`                     | histogram     | latency percentiles         |
| `outbox_backlog` (gauge of `published_at IS NULL` count)   | gauge         | pipeline health             |
| `outbox_relay_lag_seconds`                                 | gauge         | oldest unpublished age      |
| `consumer_processed_total{consumer,result}`                | counter       | success/failure/duplicate   |
| `dlq_depth`                                                | counter/gauge | dead-letter growth          |
| `reservation_success_total` / `reservation_rejected_total` | counters      | stock contention signal     |
| `reservation_expiry_sweep_size`                            | gauge         | stuck-reservation detection |
| `inventory_lock_wait_seconds`                              | histogram     | hot-row visibility          |
| `payment_webhook_signature_fail_total`                     | counter       | attack/misconfig signal     |
| `payment_state_transition_total{from,to}`                  | counter       | state machine visibility    |
| `rate_limited_total{dimension}`                            | counter       | limit tuning                |
| `auth_fail_total{reason}`                                  | counter       | stuffing detection          |

Alerting thresholds are set only after observing baseline behavior — **no thresholds are asserted here as "normal"**, since no measurements exist yet.

## 3. Tracing (OpenTelemetry, Phase 8)

- Auto-instrumentation: Fastify, pg (Drizzle driver), ioredis, BullMQ, outbound HTTP to the provider.
- Span naming: `POST /api/v1/checkout/attempts`, `db.transaction`, `queue.publish <EventType>`, `queue.consume <EventType>`, `provider.capture`.
- Trace context propagates through the event envelope (`correlation_id`, `causation_id`) so an order's async effects form one trace tree across the outbox boundary.
- Sampling: head-based default with tail-based capture of errors (Phase 8 decision, revisit with real traffic).

## 4. Local observability stack

```bash
docker compose --profile observability up -d   # prometheus, grafana, otel-collector or jaeger
```

- Prometheus scrapes the API/worker metrics endpoint (path from `.env`/config).
- Grafana ships with provisioning dashboards from `infra/observability` (HTTP, queue/outbox, payments, inventory).
- Jaeger (or the OTel collector's exporter) receives traces.
- Everything binds to localhost in the compose file; not exposed publicly.

## 5. Security-event monitoring

| Signal                                             | Threshold intent                | Response                                                           |
| -------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `payment_webhook_signature_fail_total` spike       | any sustained nonzero burst     | [incident response](../security/incident-response.md) SEV-2 triage |
| `auth_fail_total` spike per IP/account             | stuffing pattern                | auto-lockout already applies; consider IP block at edge            |
| `audit_events` gap (privileged action without row) | zero tolerance                  | integrity incident                                                 |
| outbox backlog growing                             | > threshold for 5 min (Phase 8) | [troubleshooting](troubleshooting.md) §2                           |
| `429` ratio abnormally high                        | limit tuning or abuse           | review dimension config                                            |

## 6. Retention and access

- App logs: 30 days (platform-side rotation), classified per [../security/security-architecture.md](../security/security-architecture.md#10-data-classification) — logs may contain Confidential metadata, never Secret values.
- Metrics: 15 days local retention (Prometheus default tunable).
- Traces: short retention (3–7 days) — debugging aid, not audit record; the **audit trail is `audit_events`**, not logs.
