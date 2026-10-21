# Deployment Guide

Status: Phase 0. Grounded in the fixed stack: Node.js 24 LTS (pinned 24.21.0), pnpm 12, PostgreSQL 17/18, Redis, MinIO, Mailpit, optional observability profile. Ports and credentials come from `.env` — this document deliberately contains **no port numbers**; check `.env.example` for the current placeholders.

## 1. Prerequisites

| Requirement             | Version                                                      | Check                    |
| ----------------------- | ------------------------------------------------------------ | ------------------------ |
| Node.js                 | 24 LTS, pinned 24.21.0 (`engines` in package.json, `.nvmrc`) | `node -v`                |
| pnpm                    | 12 (pinned via `packageManager`)                             | `pnpm -v`                |
| Docker + compose plugin | recent stable                                                | `docker compose version` |
| Git                     | any recent                                                   | `git -v`                 |

## 2. Local development stack

```bash
pnpm install                 # frozen lockfile
cp .env.example .env         # fill in local values; never commit .env
pnpm infra:up                # docker compose up -d: postgres, redis, minio, mailpit
pnpm db:migrate              # apply SQL migrations (migration DB role)
pnpm dev                     # runs apps/api (and worker via workspace scripts)
```

- Email is captured by Mailpit — its UI address is in `.env` (`MAILPIT_UI_URL`).
- Object storage (MinIO) console/endpoint in `.env`.
- Observability (optional): `docker compose --profile observability up -d` starts Prometheus, Grafana, and the OTel collector/Jaeger using `infra/observability` configs.

Full-stack demo (api + worker as containers):

```bash
docker compose --profile full up -d --build
```

## 3. Environment configuration

- All configuration is validated at boot by `packages/config` (zod schema). Missing or invalid values **fail startup with a clear message** — that is the intended behavior.
- Secrets (DB passwords, session pepper, webhook HMAC key, provider API key, SMTP credentials) are provided via environment/compose secrets. Production never bakes them into images.
- `.env.example` lists every variable with placeholder values and a comment; it contains no real secrets.

## 4. Build and release

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
pnpm build
```

CI runs the same plus secret scan (gitleaks), Semgrep, OSV-Scanner/npm audit, Trivy image scan, SBOM generation, OpenAPI contract validation, and migration verification. Release artifacts are container images built from `infra/docker` (multi-stage, non-root runtime user, read-only filesystem where possible).

## 5. Deploying to a server (single-VM pattern)

1. Provision a VM with Docker; open only the TLS port in the firewall.
2. Clone the repo at the release tag; create `.env` from the platform secret store.
3. `docker compose --profile full up -d --build` (or pull pre-built images).
4. Run migrations as a deploy step with the **migration role** (see [database-migrations.md](database-migrations.md)):
   ```bash
   pnpm db:migrate
   ```
5. Health check: `GET /healthz` (liveness) and `GET /readyz` (DB + Redis connectivity) — exact paths follow `apps/api` implementation.
6. Configure TLS at the reverse proxy (Caddy/Nginx/platform load balancer) and enable the header policy from [../security/security-architecture.md](../security/security-architecture.md#2-header-policy).
7. Configure backups per [backup-restore.md](backup-restore.md) **before** taking any real data.

Container platform deployment (Kubernetes or similar) uses the same images and env contract; manifests live in `infra/deployment` and are extended as the project progresses.

## 6. Deploy-time checklist

- [ ] Migrations applied and verified (from previous release snapshot + from empty)
- [ ] Runtime DB role used by the app (no DDL rights); migration role not present in runtime env
- [ ] Secrets sourced from the secret store; `gitleaks` clean
- [ ] TLS + HSTS configured; `/docs` disabled (production config)
- [ ] CORS allowlist matches real front-end origins exactly
- [ ] Backups scheduled and a restore drill recorded ([disaster-recovery-drill.md](disaster-recovery-drill.md))
- [ ] Log retention/rotation configured at the platform level
- [ ] Rate-limit configuration reviewed for the deployment size
- [ ] Webhook endpoint reachable from the payment provider with the production HMAC secret

## 7. Secret rotation runbooks (summary)

| Secret           | Procedure                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook HMAC key | generate new key; configure provider with new key; set app to accept **both** old and new for a window (dual verification); retire old key after window; watch signature-failure metrics      |
| Session pepper   | deploy new pepper with rehash-on-login flag; sessions unaffected (tokens are hashed with SHA-256, pepper protects against offline hash abuse); force re-login for privileged roles after 24 h |
| DB passwords     | `ALTER ROLE ... PASSWORD` in a maintenance window; update secret store; rolling restart app and worker                                                                                        |
| Provider API key | generate at provider, update secret store, restart; revoke old key                                                                                                                            |
| SMTP credentials | update secret store, restart worker; verify with Mailpit/real provider test send                                                                                                              |

## 8. Rollback

- Application: redeploy the previous image/tag (state is in PostgreSQL, not in the process).
- Migrations: never auto-rolled-back; destructive changes use expand/contract ([database-migrations.md](database-migrations.md#5-destructive-changes-expand--contract)) so the previous app version runs against the new schema safely.
- Config: revert the env change and restart; validated config fails fast, so misconfiguration is caught at boot, not at first request.
