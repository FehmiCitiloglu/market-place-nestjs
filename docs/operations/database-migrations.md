# Database Migrations

Status: Phase 0 (runbook). Migrations are generated SQL files from drizzle-kit, committed and reviewed (ADR-004), applied by `pnpm db:migrate` using a **dedicated migration DB role** with DDL rights. The runtime role has DML only.

## 1. Workflow

1. Change the Drizzle schema in the owning module (`apps/api/src/<module>/schema.ts` convention).
2. Generate: `pnpm db:generate` (drizzle-kit generates the SQL diff into the migrations directory).
3. **Review the generated SQL by hand** — drizzle-kit can produce imperfect diffs; CI verifies it applies but cannot judge intent.
4. Test locally: `pnpm db:migrate` against the dev database, run `pnpm test`.
5. Commit schema + migration together in one PR; the PR checklist requires the migration to be backward compatible with the previous app version (expand/contract, §5).
6. CI verifies: apply from empty database + apply from a snapshot of the previous release schema.
7. Deploy: run `pnpm db:migrate` as an explicit deploy step **before** the new app version starts (order matters for expand phases; contract phases come after).

## 2. Roles and privileges

| Role              | Rights                                                                      | Used by                |
| ----------------- | --------------------------------------------------------------------------- | ---------------------- |
| `mercato_migrate` | DDL + DML on app schema                                                     | `pnpm db:migrate` only |
| `mercato_runtime` | DML only (SELECT/INSERT/UPDATE/DELETE), no DDL, no TRUNCATE on audit tables | api + worker           |

Extra hardening: `audit_events` has no UPDATE/DELETE grant even for the runtime role (append-only enforced at the DB level). Table ownership belongs to exactly one module (see [../architecture/domain-boundaries.md](../architecture/domain-boundaries.md)).

## 3. Naming and structure

- Migration files are immutable once merged: never edit an applied migration; add a new one.
- Each migration is one logical change; avoid mega-migrations mixing unrelated tables.
- Generated SQL uses parameterless DDL only; any data backfill inside a migration must be batched (see §6).

## 4. Verification checklist per migration

- [ ] Applies from empty (CI does this)
- [ ] Applies on previous release snapshot (CI does this)
- [ ] Compatible with the **previous** app version (expand/contract)
- [ ] New columns nullable or defaulted; NOT NULL added only after backfill (two-step)
- [ ] New indexes: `CONCURRENTLY` for large tables where the tool allows; otherwise documented as a lock-accepting change
- [ ] Constraints added with validation strategy for existing rows
- [ ] Rollback/roll-forward plan documented in the PR
- [ ] Performance: no full-table rewrite without explicit note (locks)

## 5. Destructive changes: expand → contract

Never drop or rename in the same release that stops using the data.

**Pattern (example: renaming `orders.total_cents` → `orders.total_minor`):**

1. **Expand (release N):** add `total_minor`; backfill from `total_cents` in batches; dual-write both columns in the app; read from the new column behind a flag if needed.
2. **Migrate data (release N, ongoing):** backfill job verifies counts/checksums old vs new.
3. **Switch reads (release N+1):** app reads only `total_minor`; old app version still works (it writes `total_cents`, which the new code tolerates or ignores).
4. **Contract (release N+2):** stop writing `total_cents`; drop the column (or rename in a separate step). Only now is data removed.

Deletions of tables/columns follow the same 3-release discipline. The same pattern covers: type widenings, constraint additions (validate then enforce), split/merge of tables, and enum additions (PostgreSQL enum additions need care — prefer lookup tables for evolving sets).

## 6. Backfills and large tables

- Batch updates (`LIMIT`-style id ranges) with progress logging; never one giant transaction over a hot table.
- Backfill rows write `inventory_movements`/audit entries where business-relevant.
- For index builds on large tables, prefer `CREATE INDEX CONCURRENTLY` (via raw SQL migration where drizzle-kit can't express it) to avoid long locks.

## 7. Rollback strategy

- **App rollback:** previous app version + current schema (guaranteed by expand/contract). This is the primary rollback.
- **Data rollback:** restore from backup ([backup-restore.md](backup-restore.md)) only if a migration corrupted data; losing post-backup writes is the trade-off — weigh against forward-fix.
- **No automatic down-migrations:** drizzle-kit may generate them, but the operational policy is roll-forward with contract steps; down migrations are dev-only conveniences and are not trusted for production data.
- If a migration must be reverted: write a _new_ forward migration that compensates; record the reasoning in the PR and in the migration file comment.

## 8. Common failures

| Failure                           | Cause                                  | Action                                                                                                                                                                                                       |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| permission denied                 | app role used for migrate              | switch to migration role env                                                                                                                                                                                 |
| lock timeout on ALTER             | hot table under traffic                | retry in maintenance window; use `CONCURRENTLY` variants                                                                                                                                                     |
| migration partially applied       | transaction-per-file assumption broken | drizzle-kit migrations run transactionally where PostgreSQL allows; for CONCURRENTLY statements, follow the file's explicit ordering; re-run after inspection (`SELECT * FROM drizzle.__drizzle_migrations`) |
| checksum mismatch of applied file | edited an applied migration            | restore the original file; add a new migration; never rewrite history                                                                                                                                        |
