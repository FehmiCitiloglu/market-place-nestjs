# Backup and Restore

Status: Phase 0 (runbook). PostgreSQL is the source of truth for all business state (ADR-003); Redis holds no authoritative data (queues are rebuildable from `outbox_events`); MinIO holds uploaded media. This runbook covers all three with the PostgreSQL procedure spelled out in full.

## 1. What must be backed up

| Data                                         | Source                                 | Method                                   | Rationale                              |
| -------------------------------------------- | -------------------------------------- | ---------------------------------------- | -------------------------------------- |
| Business data (orders, ledger, users, audit) | PostgreSQL                             | `pg_dump` custom format, scheduled       | the source of truth                    |
| Uploaded media                               | MinIO                                  | object sync/versioned bucket replication | product images, verification documents |
| Secrets                                      | platform secret store                  | store-native export (encrypted)          | env values are not in git              |
| Config                                       | `.env` template + deployment manifests | version control (placeholders only)      | secrets never in git                   |
| Schema                                       | migrations directory                   | version control                          | rebuildable                            |

Redis is **not** backed up by design: if it is lost, the outbox relay re-publishes unpublished events and BullMQ jobs are recreated; rate-limit counters reset (acceptable).

## 2. Backup procedure (PostgreSQL)

Schedule (configured defaults — set the cron/backup job in deployment): **full `pg_dump` daily**, **WAL archiving continuous** if PITR is configured (optional at this scale), retention **14 daily + 8 weekly** copies (configurable to policy needs).

```bash
# Daily full logical backup (custom format: compressed, parallel-restore capable)
# Run as the backup role (SELECT on all app tables; no DDL needed)
pg_dump \
  --host="$PGHOST" --port="$PGPORT" --username="$BACKUP_ROLE" \
  --format=custom \
  --compress=6 \
  --file="/backups/mercato-$(date -u +%Y%m%dT%H%M%SZ).dump" \
  "$PGDATABASE"

# Integrity: record a checksum alongside the artifact
sha256sum /backups/mercato-*.dump > /backups/SHA256SUMS
```

- Backups are copied to **encrypted storage** (deployment-level: encrypted volume or object store with server-side encryption). A backup that lives only on the database host is not a backup.
- Backup success/failure is monitored (backup job exit status + artifact freshness check); **a silent backup failure is a SEV-3 incident**.
- MinIO media sync (daily): `mc mirror --watch`-style sync or bucket replication to the backup store; include bucket policy/config in the backup.

## 3. Restore procedure (PostgreSQL)

```bash
# 0. Do NOT restore over a live database. Use a fresh database or a stopped instance.

# 1. Verify the artifact before touching anything
sha256sum -c /backups/SHA256SUMS

# 2. Inspect: list table-of-contents to confirm it contains expected tables
pg_restore --list /backups/mercato-<timestamp>.dump | head -50

# 3. Create a clean target database and restore as the migration-capable role
createdb --host="$PGHOST" --port="$PGPORT" --username="$RESTORE_ROLE" mercato_restore
pg_restore \
  --host="$PGHOST" --port="$PGPORT" --username="$RESTORE_ROLE" \
  --dbname="mercato_restore" \
  --no-owner \
  --exit-on-error \
  /backups/mercato-<timestamp>.dump

# 4. Run verification (see §4) before promoting the restored database
```

Notes:

- `--exit-on-error` stops at the first failure rather than leaving a half-restored database that looks fine.
- `--no-owner` avoids role-name coupling between backup and restore environments; re-grant to the runtime role afterward (`GRANT` statements live in the migration/role bootstrap script).
- Role/credential bootstrap (`mercato_migrate`, `mercato_runtime`, grants) is version-controlled in `infra/deployment` and re-applied after restore.
- MinIO restore: sync the backup mirror back into the bucket, then verify object counts against the `product_images`/`seller_verifications` rows.

## 4. Restore verification (mandatory)

A restore is **not** complete until verified. Run these checks against `mercato_restore` (or the promoted instance):

1. **Row-count audit** for critical tables (counts must match the recorded pre-incident/backed-up expectations or the dump's own stats):

```sql
SELECT 'orders' AS t, count(*) FROM orders
UNION ALL SELECT 'order_items', count(*) FROM order_items
UNION ALL SELECT 'ledger_entries', count(*) FROM ledger_entries
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'audit_events', count(*) FROM audit_events
UNION ALL SELECT 'outbox_events', count(*) FROM outbox_events;
```

2. **Ledger balance check** — every transaction balances per currency:

```sql
SELECT transaction_id, currency, sum(CASE WHEN direction='debit' THEN amount_minor ELSE -amount_minor END) AS net
FROM ledger_entries
GROUP BY transaction_id, currency
HAVING sum(CASE WHEN direction='debit' THEN amount_minor ELSE -amount_minor END) <> 0;
```

Expected: zero rows.

3. **Inventory identity check**:

```sql
SELECT count(*) FROM inventory_items
WHERE available + reserved + committed <> on_hand;
```

Expected: zero rows.

4. **Referential smoke test**: `pg_restore --exit-on-error` already enforces FK validity; additionally boot the app against the restored DB with `GET /readyz` and run a read-only endpoint (product list).
5. **Timestamp sanity**: `max(created_at)` on `orders` and `audit_events` is at or before the backup timestamp.
6. Record the verification results (who, when, checks passed) in the ops log — this evidence is what the [disaster-recovery drill](disaster-recovery-drill.md) collects.

## 5. PITR / point-in-time recovery (optional)

At larger scale, enable WAL archiving (`archive_mode=on`, archive command to the backup store) and restore with `pg_restore` base + `pg_wal` replay to a target time. Phase 0 runs on daily logical dumps; PITR is a deployment upgrade with the same verification steps.

## 6. Retention and lifecycle

| Artifact                       | Retention (default) | Storage                       |
| ------------------------------ | ------------------- | ----------------------------- |
| Daily dumps                    | 14 days             | encrypted backup volume/store |
| Weekly dumps                   | 8 weeks             | encrypted backup volume/store |
| MinIO mirrors                  | 14 days versioning  | backup bucket                 |
| SHA256SUMS + verification logs | with artifacts      | backup store                  |
| Restore drill records          | 12 months           | ops log (repo-private)        |

Backups are deleted per retention, never earlier than the data-retention implications in [../security/security-architecture.md](../security/security-architecture.md#11-retention-rules-configured-defaults) allow (financial rows are long-retention).

## 7. Roles

- **Backup role** (`mercato_backup`): read-only on all app tables; used by the dump job only.
- **Restore role** (`mercato_restore`/`mercato_migrate`): DDL-capable; used only during restore/maintenance.
- The runtime role is never used for backup or restore.

## 8. Drill schedule

Full restore drill (to a scratch database, with §4 verification) runs **quarterly** — script: [disaster-recovery-drill.md](disaster-recovery-drill.md). The drill's goal is not ceremony: it is the only way to know the dump actually restores.
