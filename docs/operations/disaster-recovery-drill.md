# Disaster Recovery Drill

Status: Phase 0 (drill script). Run **quarterly** (and after any change to backup/restore tooling). The drill proves the backups restore and the team can reach a consistent state — a drill that is skipped is worse than no drill, because it converts "we back up" into "we assume we can restore". Record results in the ops log (keep 12 months).

## 0. Drill metadata (fill in each run)

```markdown
Date (UTC):
Operator:
Environment: staging / scratch (NEVER production data writes)
Backup artifact used (name + timestamp):
Result: PASS / FAIL
Notes and deviations:
```

## 1. Objectives

1. Restore the latest PostgreSQL dump to a scratch database.
2. Pass every verification check in [backup-restore.md §4](backup-restore.md#4-restore-verification-mandatory).
3. Restore MinIO media and reconcile object counts.
4. Boot the application against the restored data and complete a smoke path.
5. Verify outbox/recovery behavior: unpublished events and pending reservations are still recoverable.
6. Measure elapsed time (RTO observation) and note the newest data present (RPO observation) — record observations only; targets are set after the first real drill.

## 2. Preconditions

- [ ] Access to the backup store and checksums file.
- [ ] A scratch environment with Docker (or a disposable VM) — no production writes.
- [ ] This runbook + [backup-restore.md](backup-restore.md) open.
- [ ] 60–90 minutes reserved; nobody deploys during the drill.

## 3. Drill steps

### 3.1 Simulate the disaster (evidence of what we recover FROM)

```bash
# On the scratch instance only: take the "broken" state
createdb mercato_scratch_broken
# optionally drop a table / corrupt rows to prove the restore replaces them
```

### 3.2 Restore PostgreSQL

Follow [backup-restore.md §3](backup-restore.md#3-restore-procedure-postgresql) exactly:

1. `sha256sum -c /backups/SHA256SUMS`
2. `pg_restore --list` inspection
3. `createdb mercato_restore` + `pg_restore --no-owner --exit-on-error`
4. Re-apply role bootstrap/grants from `infra/deployment`.

Record: start time, end time, any errors.

### 3.3 Verify (mandatory checks)

Run all of [backup-restore.md §4](backup-restore.md#4-restore-verification-mandatory):

1. Row counts for `orders`, `order_items`, `ledger_entries`, `users`, `audit_events`, `outbox_events`
2. Ledger balance query → expect zero rows
3. Inventory identity query → expect zero rows
4. App readiness: boot api against `mercato_restore`, `GET /readyz` passes, product list returns data
5. Timestamp sanity: newest `orders`/`audit_events` ≤ backup timestamp

Copy the query outputs into the drill record. **Any failed check = drill FAIL** (that is the drill working).

### 3.4 Restore MinIO media

1. Sync the backup mirror into a scratch bucket.
2. Compare object count to `product_images` + `seller_verifications` rows:

```sql
SELECT
  (SELECT count(*) FROM product_images) AS product_images,
  (SELECT count(*) FROM seller_verifications) AS verification_docs;
```

3. Spot-check 3 random signed-URL downloads open successfully.

### 3.5 Recovery-behavior checks

1. **Outbox:** count `outbox_events WHERE published_at IS NULL` on the restored DB; if > 0, run the outbox relay against the scratch env and confirm those events publish and consumers dedupe (no double effects — check `inbox_processed_events`).
2. **Reservations:** run the expiry sweep query; confirm pending-expired reservations release correctly on the restored data.
3. **Reconciliation:** select payments in `REQUIRES_ACTION`/`AUTHORIZED`; confirm the reconciliation query lists them (mock provider in scratch mode).

### 3.6 Smoke path

On the restored scratch environment:

1. Register a test user, verify email via Mailpit.
2. Add to cart, run a checkout with the mock provider, capture the webhook, confirm order `PAID`.
3. Post a review; confirm search finds the product.
4. Run one admin action; confirm an `audit_events` row appears.

### 3.7 Wrap-up

- Stop and delete the scratch environment.
- Fill the drill metadata (§0): elapsed time, RPO observed (newest restored data timestamp vs. disaster-simulation time), failures/deviations.
- File issues for anything that failed or was slow; update runbooks if the procedure drifted from reality.

## 4. Scoring (honest, not theatrical)

| Outcome              | Meaning                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| PASS                 | all checks passed; timings recorded                                                            |
| PASS with deviations | all checks passed but procedure gaps found → issues filed, runbooks updated                    |
| FAIL                 | any verification check failed → backups are not trustworthy until re-done and the drill re-run |

## 5. Common drill findings (and what they mean)

| Finding                        | Implication                                                                                    | Action                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| checksum mismatch              | artifact corrupted or checksum stale                                                           | fix backup job; re-take backup; investigate storage                           |
| ledger imbalance after restore | backup captured an inconsistent state (should be impossible with pg_dump of a committed state) | investigate for app-level non-atomic writes; this is a SEV-2 integrity signal |
| verification rows missing      | wrong dump or partial restore                                                                  | re-run with `--exit-on-error`; check dump TOC                                 |
| media count mismatch           | sync job lagging                                                                               | fix mirror schedule; widen retention window                                   |
| slow restore                   | RTO risk                                                                                       | document; consider PITR or parallel restore tuning                            |
