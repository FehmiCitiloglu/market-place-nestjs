# Incident Response

Status: Phase 0 (outline). A working process skeleton for a single-maintainer portfolio project with room to scale. This is preparedness documentation, not a claim that incidents have been handled or that the process is certified.

## 1. Severity classes

| Class | Definition                                                                               | Examples                                                                | Response target                                      |
| ----- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| SEV-1 | Active compromise, money loss, mass PII exposure, or integrity loss in orders/ledger     | forged payment webhooks confirmed, audit log tampering, DB exfiltration | Immediate (drop other work); status update every 2 h |
| SEV-2 | Exploitable vulnerability with significant impact, or partial outage of payment/checkout | auth bypass found, checkout down, overselling detected                  | Same day; updates every 24 h                         |
| SEV-3 | Limited-impact security issue or degraded component                                      | rate-limit bypass, notification failures, single-store data issue       | Within 3 business days                               |
| SEV-4 | Minor / informational                                                                    | header misconfiguration without exploit path, scanner noise             | Next scheduled maintenance                           |

Targets are working goals for this project, not service-level agreements.

## 2. Roles

| Role                    | Holder (portfolio project)                    | Responsibility                                                  |
| ----------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| Incident Commander (IC) | repository maintainer                         | owns the response, declares severity, coordinates, communicates |
| Operator                | maintainer (same person; role-hat documented) | executes containment/eradication steps, captures evidence       |
| Communications          | maintainer                                    | status page/advisory updates, reporter liaison                  |
| Reviewer (postmortem)   | a second person where available               | challenges conclusions, ensures action items land               |

If the project ever has more contributors, IC and Operator must be different people for SEV-1/2.

## 3. Detection sources

- **Security-event logging:** `authentication_events` (failure spikes, lockouts), `audit_events` (privileged action anomalies), webhook signature-failure counters.
- **Metrics/alerts (Phase 8):** outbox backlog, DLQ depth, 4xx/5xx rate, rate-limit triggers, payment state divergence (reconciliation), inventory identity drift, expired-reservation sweep anomalies.
- **External:** researcher reports ([vulnerability-management.md](vulnerability-management.md)), scanner findings (gitleaks/Semgrep/OSV/Trivy), user reports.
- **Integrity checks:** audit-log append-only verification, backup restore drills ([../operations/disaster-recovery-drill.md](../operations/disaster-recovery-drill.md)).

## 4. Response phases

### 4.1 Detect & declare

1. Signal arrives (alert, report, observation). IC records: what, when first observed, suspected blast radius.
2. Declare severity (§1) and open a private tracking issue. Over-declaring is preferred to under-declaring.

### 4.2 Contain

| Situation                   | Containment actions                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen session(s) suspected | revoke affected sessions + all sessions of the actor; force password reset; raise `SessionRevoked` events                                                |
| Webhook forgery suspected   | rotate webhook HMAC secret (dual-key window), disable webhook endpoint if provider allows, verify recent payment transitions against provider            |
| Credential/secret leaked    | rotate the secret everywhere it is used (see rotation runbooks in [../operations/deployment.md](../operations/deployment.md)); invalidate derived tokens |
| Malicious admin action      | suspend the account, freeze privileged routes (config flag), preserve sessions as evidence first                                                         |
| Dependency compromise       | pin/remove the dependency, revoke tokens that CI held, rebuild from clean state                                                                          |
| Data exposure               | stop the leak path first (route/permission), then assess scope from access logs                                                                          |

Evidence capture before cleanup where possible: request logs by request-id/trace-id, `audit_events` rows, DB state snapshots, container images, timelines.

### 4.3 Eradicate

- Fix the root cause (code fix + regression test per the threat-model mapping), patch or remove the compromised component, close the exploited path.
- Verify with the relevant security test suite; for SEV-1, add a targeted test before declaring eradication.

### 4.4 Recover

1. Restore integrity: reconcile payments (provider status vs local), inventory identity check, ledger balance check, outbox/DLQ replay if events were lost ([../architecture/outbox-processing.md](../architecture/outbox-processing.md#5-retry-backoff-dead-letter)).
2. Restore from backup **only** when data integrity is compromised and the [backup-restore procedure](../operations/backup-restore.md) with its verification step is followed.
3. Gradual re-enable: lift containment flags, monitor the §3 detection signals for at least 24 h (SEV-1/2).

### 4.5 Post-incident

- Blameless postmortem within 5 business days for SEV-1/2 (template below).
- Action items tracked as issues with owners and due dates; the security regression suite must contain a test for the exploited path.
- Update [threat-model.md](threat-model.md) (residual risks), [asvs-checklist.md](asvs-checklist.md) (status corrections), and this plan if the process failed.

## 5. Evidence retention

- **Audit log integrity:** `audit_events` is append-only (no UPDATE/DELETE grants for runtime roles). For incidents, export relevant partitions to write-once storage immediately (file hash recorded in the tracking issue).
- **Retention for incident evidence:** minimum 12 months for SEV-1/2 material, regardless of normal log retention (30 d app logs) — so export early.
- Evidence chain: who collected what, when, with which command; stored alongside the postmortem (private).
- Privacy: evidence may contain PII; access is limited to the response roles; evidence is deleted at the end of the retention window.

## 6. Postmortem template

```markdown
# Incident postmortem — <title>

- Severity: SEV-N
- Date declared / resolved:
- IC / Operator / Reviewer:
- Tracking issue / advisory:

## Summary

<2–3 sentences: what happened, impact, current state>

## Timeline (UTC)

- HH:MM first signal
- HH:MM declared
- HH:MM contained
- HH:MM eradicated
- HH:MM recovered

## Impact

<users/records/money affected; how measured; what is still unknown>

## Root cause

<technical cause + contributing process gaps; avoid blame language>

## What went well

## What went poorly

## Where we got lucky

## Action items

| #   | Action | Owner | Due | Issue |
| --- | ------ | ----- | --- | ----- |

## Detection gap analysis

<why detection was/wasn't timely; what signal would have caught it earlier>

## Documentation updates

<threat model / ASVS mapping / runbooks changed by this incident>
```

## 7. Communication policy

- Internal (this project: the tracking issue and postmortem) is the primary channel.
- External: GitHub private advisory for security issues; public disclosure timing per [vulnerability-management.md](vulnerability-management.md#42-intake-handling).
- Never include secrets, raw PII, or exploit details in public communication; include affected versions, impact, and remediation.
