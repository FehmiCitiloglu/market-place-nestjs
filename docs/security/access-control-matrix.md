# Access Control Matrix

Status: Phase 0 (design). RBAC roles + resource-ownership policy checks, enforced **server-side on every protected operation**. Clients cannot set price, role, status, ownership, or totals under any role. Legend: **A** = Allow, **D** = Deny, **C** = Conditional (condition stated). Unlisted operations default to **D** for all roles except where a documented owner-scoped equivalent exists.

Roles: `guest` (unauthenticated), `customer`, `seller`, `seller_staff`, `support_agent`, `moderator`, `administrator`. A `seller` is the store owner; `seller_staff` is a member granted scoped access via `store_members`. `support_agent`, `moderator`, `administrator` are platform staff.

Global conditions used below:

- **Own** — resource belongs to the actor (user, store membership, order ownership).
- **Verified** — seller/store in `verified` state (not pending/suspended).
- **Active** — target in an actionable state (e.g. order not shipped/cancelled).
- **ReAuth** — recent re-authentication within the freshness window (default 10 min) + audit event.
- **Self** — the actor's own record only.

## 1. Identity & account

| Operation                         | guest | customer | seller | seller_staff | support_agent                         | moderator                                | administrator                                             |
| --------------------------------- | ----- | -------- | ------ | ------------ | ------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Register account                  | A     | A        | A      | A            | A                                     | A                                        | A                                                         |
| Login / logout                    | A     | A        | A      | A            | A                                     | A                                        | A                                                         |
| View own profile                  | D     | A Self   | A Self | A Self       | A Self                                | A Self                                   | A Self                                                    |
| Edit own profile (name, locale)   | D     | A Self   | A Self | A Self       | A Self                                | A Self                                   | A Self                                                    |
| Change own password               | D     | A Self   | A Self | A Self       | A Self                                | A Self                                   | A Self                                                    |
| Request password reset            | A     | A        | A      | A            | A                                     | A                                        | A                                                         |
| View another user's profile (PII) | D     | D        | D      | D            | C: masked view for support cases only | C: masked view for moderation cases only | A, audited                                                |
| Edit another user's data          | D     | D        | D      | D            | D                                     | D                                        | C: ReAuth + audited                                       |
| Assign/revoke roles               | D     | D        | D      | D            | D                                     | D                                        | C: ReAuth + audited; only admin may grant admin/moderator |
| Deactivate a user                 | D     | D        | D      | D            | C: request only                       | C: request only                          | C: ReAuth + audited                                       |
| Manage MFA for others             | D     | D        | D      | D            | D                                     | D                                        | C: reset only, ReAuth + audited                           |
| View sessions of others           | D     | D        | D      | D            | D                                     | D                                        | A, audited                                                |
| Revoke sessions of others         | D     | D        | D      | D            | C: own case subjects, audited         | C: own case subjects, audited            | A, ReAuth + audited                                       |

## 2. Sellers & stores

| Operation                      | guest | customer | seller           | seller_staff                    | support_agent   | moderator                   | administrator       |
| ------------------------------ | ----- | -------- | ---------------- | ------------------------------- | --------------- | --------------------------- | ------------------- |
| Register as seller             | D     | A        | A                | D                               | D               | D                           | D                   |
| View own seller/store          | D     | D        | A Own            | C: member stores                | C: case-related | C: case-related             | A, audited          |
| Edit own store settings        | D     | D        | A Own + Verified | C: member stores, scoped fields | D               | D                           | A, audited          |
| Invite/remove store staff      | D     | D        | A Own + ReAuth   | D                               | D               | D                           | A, audited          |
| Submit verification documents  | D     | D        | A Own            | D                               | D               | D                           | D                   |
| Approve/reject verification    | D     | D        | D                | D                               | D               | C: review workflow, audited | A, audited          |
| Suspend a store                | D     | D        | D                | D                               | D               | C: with case, audited       | A, ReAuth + audited |
| Reinstate a suspended store    | D     | D        | D                | D                               | D               | C: with case, audited       | A, ReAuth + audited |
| View other sellers' financials | D     | D        | D                | D                               | D               | **D**                       | A, ReAuth + audited |
| Set commission rates           | D     | D        | **D**            | **D**                           | **D**           | **D**                       | C: ReAuth + audited |

## 3. Catalog & inventory

| Operation                       | guest | customer | seller                                    | seller_staff                      | support_agent | moderator                       | administrator          |
| ------------------------------- | ----- | -------- | ----------------------------------------- | --------------------------------- | ------------- | ------------------------------- | ---------------------- |
| View published products         | A     | A        | A                                         | A                                 | A             | A                               | A                      |
| View draft products             | D     | D        | C: own stores                             | C: member stores                  | D             | C: case-related                 | A, audited             |
| Create/edit products            | D     | D        | C: own stores + Verified                  | C: member stores + Verified       | D             | D                               | A, audited             |
| Publish/unpublish products      | D     | D        | C: own stores + Verified                  | C: member stores, scoped          | D             | C: unpublish with case, audited | A, audited             |
| Delete/ archive products        | D     | D        | C: own stores, archive only               | D                                 | D             | D                               | A, audited             |
| Edit categories                 | D     | D        | D                                         | D                                 | D             | D                               | A, audited             |
| View inventory own stores       | D     | D        | A Own                                     | C: member stores                  | D             | D                               | A                      |
| Adjust stock (correction)       | D     | D        | C: own stores + Verified, reason required | C: member stores, reason required | D             | D                               | A, audited             |
| Adjust stock of other stores    | D     | D        | **D**                                     | **D**                             | **D**         | **D**                           | A, audited             |
| View reservations of own stores | D     | D        | A Own                                     | C: member stores                  | D             | D                               | A                      |
| Force-release a reservation     | D     | D        | D                                         | D                                 | D             | D                               | C: ops action, audited |

## 4. Cart, checkout, orders

| Operation                              | guest         | customer                      | seller                                            | seller_staff                    | support_agent                            | moderator                           | administrator                                            |
| -------------------------------------- | ------------- | ----------------------------- | ------------------------------------------------- | ------------------------------- | ---------------------------------------- | ----------------------------------- | -------------------------------------------------------- |
| Maintain own cart                      | C: guest cart | A Own                         | A Own                                             | A Own                           | A Own                                    | A Own                               | A Own                                                    |
| Start checkout (own cart)              | D             | A Own                         | A Own                                             | A Own                           | A Own                                    | A Own                               | A Own                                                    |
| View own orders                        | D             | A Own                         | A Own                                             | A Own                           | A Own                                    | A Own                               | A Own                                                    |
| View store's seller-orders             | D             | D                             | C: own stores                                     | C: member stores                | C: case-related, read-only               | D                                   | A, audited                                               |
| View arbitrary user's order            | D             | **D**                         | **D**                                             | **D**                           | C: case-related, masked PII, audited     | C: case-related, read-only, audited | A, audited                                               |
| Cancel own order (customer)            | D             | C: own, before shipping state | —                                                 | —                               | —                                        | —                                   | —                                                        |
| Cancel any order                       | D             | D                             | C: own store's seller-order only, reason required | C: member stores, scoped        | C: case-related, audited                 | D                                   | A, audited                                               |
| Modify order totals/price              | **D**         | **D**                         | **D**                                             | **D**                           | **D**                                    | **D**                               | **D** — corrections via refunds/ledger compensation only |
| Change payment status                  | **D**         | **D**                         | **D**                                             | **D**                           | **D**                                    | **D**                               | **D** — only payments module via provider events         |
| Approve refunds                        | D             | D                             | C: request only                                   | C: request only                 | A, audited; amount ≤ captured − refunded | D                                   | A, ReAuth + audited                                      |
| Execute refund against provider        | D             | D                             | D                                                 | D                               | D                                        | D                                   | D (system only; support triggers the request)            |
| View financial data (payments, ledger) | D             | D                             | C: own store settlement only                      | C: member store settlement only | C: masked, case-related                  | **D**                               | A, ReAuth + audited                                      |
| Set commission rates                   | D             | D                             | **D**                                             | **D**                           | **D**                                    | **D**                               | C: ReAuth + audited                                      |
| Run settlements / payouts              | D             | D                             | D                                                 | D                               | D                                        | D                                   | C: ReAuth + audited                                      |
| Export settlement reports              | D             | D                             | C: own store                                      | C: member store                 | D                                        | D                                   | A, audited                                               |

## 5. Shipping & fulfillment

| Operation                            | guest | customer | seller                   | seller_staff     | support_agent   | moderator | administrator |
| ------------------------------------ | ----- | -------- | ------------------------ | ---------------- | --------------- | --------- | ------------- |
| Create shipment for own seller-order | D     | D        | C: own stores + Verified | C: member stores | D               | D         | A, audited    |
| Update tracking/dispatch             | D     | D        | C: own stores            | C: member stores | D               | D         | A, audited    |
| View others' shipments               | D     | D        | **D**                    | **D**            | C: case-related | D         | A, audited    |

## 6. Reviews & ratings

| Operation                   | guest | customer                                   | seller                    | seller_staff              | support_agent | moderator             | administrator                           |
| --------------------------- | ----- | ------------------------------------------ | ------------------------- | ------------------------- | ------------- | --------------------- | --------------------------------------- |
| Create review               | D     | C: own, verified purchase, one per product | C: same as customer rules | C: same as customer rules | C: same       | C: same               | C: same                                 |
| Vote on review              | D     | C: one vote per review                     | C: same                   | C: same                   | C: same       | C: same               | C: same                                 |
| Edit own review             | D     | C: own, within edit window                 | C: same                   | C: same                   | C: same       | C: same               | C: same                                 |
| Hide/unhide a review        | D     | D                                          | D                         | D                         | D             | C: with case, audited | A, audited                              |
| Delete a review permanently | D     | D                                          | D                         | D                         | D             | **D** (hide only)     | C: legal removal only, ReAuth + audited |
| Reply to review as seller   | D     | D                                          | C: own store's reviews    | C: member stores          | D             | D                     | A, audited                              |

## 7. Administration & moderation

| Operation                | guest | customer | seller         | seller_staff   | support_agent         | moderator                           | administrator                                                                            |
| ------------------------ | ----- | -------- | -------------- | -------------- | --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| Open moderation case     | D     | D        | C: report only | C: report only | A                     | A                                   | A                                                                                        |
| Resolve moderation case  | D     | D        | D              | D              | D                     | C: within moderation scope, audited | A, audited                                                                               |
| Suspend user account     | D     | D        | D              | D              | C: request only       | C: request only                     | C: ReAuth + audited                                                                      |
| Access admin dashboard   | D     | D        | D              | D              | C: support views only | C: moderation views only            | A                                                                                        |
| Impersonate another user | **D** | **D**    | **D**          | **D**          | **D**                 | **D**                               | **D** — no impersonation capability exists; support tooling is read-only + action-scoped |
| View all financial data  | D     | D        | D              | D              | **D**                 | **D**                               | C: ReAuth + audited                                                                      |
| Manage commission rules  | D     | D        | **D**          | **D**          | **D**                 | **D**                               | C: ReAuth + audited                                                                      |
| Manage platform settings | D     | D        | D              | D              | D                     | D                                   | C: ReAuth + audited                                                                      |
| View audit log           | D     | D        | D              | D              | C: own case scope     | C: own case scope                   | A, audited; own actions visible in trail                                                 |
| Edit/delete audit log    | **D** | **D**    | **D**          | **D**          | **D**                 | **D**                               | **D** — append-only by DB grants for all runtime roles                                   |

## 8. Explicit non-capabilities (by design)

These are denied to **every** role and enforced structurally, not just by policy:

1. **Seller cannot set payment status or commission.** Payment transitions happen only in the payments module off verified provider events; commission comes from `commission_rules` snapshots at sale time (admin-managed).
2. **Customer cannot modify totals.** Prices, discounts, tax, shipping, and totals are computed server-side; the schema does not accept these fields.
3. **Support cannot impersonate admins (or anyone).** There is no impersonation feature; support actions are individually scoped and audited.
4. **Moderator has no unrestricted financial access.** Financial views require `administrator` (+ re-auth); moderators see masked, case-scoped data only.
5. **Admin privileged actions require re-auth + audit.** Role changes, suspensions, payout runs, settings, and financial access are all ReAuth + `audit_events` in the same transaction.

## 9. Enforcement notes

- One authorization guard pipeline: role check → ownership/policy check → state check → audit. Route handlers never hand-roll ad-hoc checks without the shared guards.
- Tests: `tests/security/access-control.test.ts` generates cases from this matrix (Planned — Phase 1). Matrix rows are the source of truth; the test table is derived from it.
- Denial responses: `403 forbidden-action` when the actor is known but unauthorized; `404 not-found` when existence itself is hidden (ownership boundaries).
- Every decision point logs actor, action, target, and outcome at debug level; privileged grants log at info with audit rows.
