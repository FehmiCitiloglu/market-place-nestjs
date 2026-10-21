# Troubleshooting

Status: Phase 0 (runbook skeleton). Symptom → diagnosis → action. Commands use the fixed stack (`pnpm` scripts, docker compose). No port numbers here — they live in `.env`.

## 1. Fast triage

```bash
pnpm infra:logs                 # docker compose logs -f for infra services
docker compose ps               # infra container state
pnpm dev                        # api/worker logs in foreground when debugging locally
```

Health endpoints: `GET /healthz` (process up), `GET /readyz` (dependencies reachable). A failing `/readyz` with a healthy `/healthz` points at a dependency, not the app.

## 2. Symptom → diagnosis → action

| Symptom                                                      | Likely diagnosis                                       | Action                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App fails at boot with config error                          | missing/invalid env var (zod validation)               | read the boot error listing the field; fix `.env`; `packages/config` never starts with bad config — this is by design                                                                       |
| `ECONNREFUSED` to Postgres/Redis/MinIO                       | infra not running or wrong host/port in `.env`         | `docker compose ps`; `pnpm infra:up`; compare `.env` with `.env.example`                                                                                                                    |
| Migration fails: permission denied                           | running with runtime role instead of migration role    | ensure `DATABASE_URL_MIGRATION` (or equivalent) points at the migration role; see [database-migrations.md](database-migrations.md)                                                          |
| `401` on every authenticated request                         | session cookie missing/not sent, or clock skew         | check cookie flags (Secure requires TLS or localhost); check app/DB time sync; inspect `authentication_events`                                                                              |
| `403 csrf-token-invalid`                                     | double-submit mismatch or missing Origin               | ensure client sends `x-csrf-token` matching the CSRF cookie; verify `Origin`/`Sec-Fetch-Site` pass; check CORS allowlist                                                                    |
| `429 rate-limited` everywhere                                | rate-limit misconfiguration or shared-IP NAT           | check the dimension in the response detail; tune limits in config; confirm Redis is reachable (fallback limit is stricter)                                                                  |
| Checkout fails `stock-unavailable` but stock looks present   | stale view of `available` (reservations holding stock) | query `inventory_items` + `inventory_reservations WHERE state='pending'`; run expiry sweep (§3); check for aged pending reservations                                                        |
| Stock stuck reserved                                         | expiry job not running                                 | confirm `apps/worker` is up; worker runs an immediate sweep on start — restart worker or run `scripts/inventory-expiry-sweep` (Phase 7 tooling); verify `expires_at` values are in the past |
| Outbox backlog growing (`published_at IS NULL` count rising) | relay down or Redis queue unreachable                  | check worker logs; `docker compose logs redis`; restart worker; backlog recovers automatically (rows are durable)                                                                           |
| Consumers not processing / DLQ growing                       | consumer crash-loop or non-retryable payloads          | read `outbox_events.last_error` + DLQ entries; fix root cause; replay with `scripts/outbox-replay` (Phase 7 tooling)                                                                        |
| Webhook `401 webhook-stale`                                  | clock skew or replay outside ±120 s window             | sync clocks (NTP); if provider legitimately retries late, review the window policy before changing it                                                                                       |
| Webhook `401` signature failures spike                       | wrong HMAC secret or provider misconfig                | verify secret matches provider config (dual-key window during rotation); see [deployment.md](deployment.md#7-secret-rotation-runbooks-summary)                                              |
| Payments stuck in `REQUIRES_ACTION`                          | provider never confirmed or webhook lost               | check provider status via GET endpoint; reconciliation job (Phase 6) covers this; manually re-drive via `scripts/payment-repair` (Phase 7)                                                  |
| Emails not arriving                                          | SMTP misconfig                                         | Mailpit captures all local mail — check its UI; verify SMTP env vars                                                                                                                        |
| Upload rejected `unsupported-media-type`                     | magic bytes don't match declared type                  | expected behavior; confirm file isn't corrupt/polyglot; see upload policy                                                                                                                   |
| Slow requests, DB CPU high                                   | missing index or hot lock                              | check `pg_stat_activity` for lock waits; review slow query log; inventory hot rows serialize by design (ADR-008)                                                                            |
| Deadlock errors in logs                                      | lock ordering violation (should not happen)            | capture the error detail; run `tests/integration/inventory-concurrency.test.ts`; file a bug — deterministic ordering is an invariant                                                        |

## 3. Diagnostic queries

```sql
-- outbox backlog
SELECT count(*) FROM outbox_events WHERE published_at IS NULL;

-- oldest unpublished event (relay lag)
SELECT min(occurred_at) FROM outbox_events WHERE published_at IS NULL;

-- stuck reservations
SELECT id, inventory_item_id, quantity, expires_at
FROM inventory_reservations
WHERE state = 'pending' AND expires_at < now();

-- stock identity drift per item
SELECT id, on_hand, reserved, committed, available
FROM inventory_items
WHERE available + reserved + committed <> on_hand;

-- recent failed auth for an account
SELECT * FROM authentication_events
WHERE user_id = $1 ORDER BY occurred_at DESC LIMIT 20;
```

All queries are read-only; never fix drift by blind UPDATE — use the repair tooling so `inventory_movements` and audit rows stay consistent (see [../architecture/inventory-reservation.md](../architecture/inventory-reservation.md#7-operational-notes)).

## 4. Escalation

- Security-relevant symptoms (webhook forgery, audit tampering, mass 401s, suspected data exposure) → [../security/incident-response.md](../security/incident-response.md) immediately.
- Data integrity symptoms (ledger imbalance, identity drift) → stop writes if impact is spreading, capture evidence, then follow incident response SEV-2.
- Unknown symptoms → capture request-id/trace-id, timeline, and the output of §3 queries before restarting anything.
