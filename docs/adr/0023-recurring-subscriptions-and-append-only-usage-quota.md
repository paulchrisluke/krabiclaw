# ADR 0023: Recurring subscriptions and append-only usage quota

Status: Accepted

## Context

KrabiClaw historically contained code and schema for one-time AI credit
purchases, manually fulfilled service add-ons, and automatic card top-ups
alongside the recurring Better Auth Stripe subscription integration. The
2026-08-09 production/provider census found no customer purchase, fulfillment,
or outstanding-obligation history for those products. Even unused, those paths
created a second product model and allowed a payment event to mutate customer
capacity outside the subscription entitlement projection.

## Decision

- Better Auth's organization subscription is the control-plane billing
  authority. `organization_billing` and entitlement rows are application-owned
  read projections written from that authority; they are not an independent
  subscription source and drift must be reported and reconciled rather than
  hidden by a frontend fallback.
- Stripe recurring invoices determine paid access and payment finality. They do
  not define quota cadence and do not grant AI credits directly.
- Prices and charge amounts remain unchanged by this decision.
- Usage is recorded in the append-only `usage_events` ledger.
- Plan grants, approved resets, and manual grants are recorded in the
  append-only `usage_quota_grants` ledger.
- `ai_credits` remains a derived enforcement balance and historical usage
  summary, not a customer-purchasable wallet.
- One-time credit checkout, service-addon checkout, and auto-top-up writers are
  removed. Their unused tables and columns are removed from the active schema;
  immutable applied migrations retain the historical definitions. There are no
  customer fulfillment obligations to preserve.
- Growth includes priority-support work requests and Facebook integration. The
  internal `managed_service` capability remains true for Growth. It is a
  capability key, not a saleable plan identity.
- Starter and Growth are the complete runtime plan model. Managed and SEO
  Accelerator existed only as unused Stripe catalog products. They must be
  archived and rejected by every runtime checkout, reconciliation, transfer,
  upsell, and entitlement path.
- Historical one-time checkout metadata is acknowledged by the webhook worker
  and ignored; it cannot create new capacity or fulfillment rows.
- A pending site handoff does not pause or delete the source owner's custom
  domains. Reminders are informational; acceptance and cancellation own the
  compare-and-set domain restoration/cleanup saga. This prevents an unpaid,
  abandoned invite from taking an already-owned website offline while keeping
  legacy paused-domain markers recoverable.

### Organization quota policy

- One organization subscription covers every site in the organization.
- Starter has 500 shared usage credits per UTC week. Growth has 2,000 shared
  usage credits per UTC week. A week starts Monday at 00:00:00 UTC and ends at
  the following Monday. There is no unlimited runtime plan.
- A finite plan materializes one idempotent `plan` grant for the effective plan
  and UTC week. The grant is the exact base allowance, not an additive top-up,
  and unused allowance never carries into the next week.
- The current effective plan is derived from the Better Auth-owned subscription
  projection, payment finality, paid-through date, cancellation timing, trial
  expiry, and the documented past-due grace period. A missing subscription is
  the intentional Starter state; a malformed or contradictory projection is an
  operational error.
- Immediate upgrades take effect in the current UTC week. Usage already
  recorded in that week counts against the upgraded allowance; the new plan
  grant does not create 2,000 credits in addition to earlier weekly usage.
- Scheduled downgrades and cancellations retain paid access through the
  effective paid period. When the effective plan becomes Starter, the Starter
  weekly baseline applies and usage already recorded in that UTC week still
  counts against it.
- Trial and past-due access can receive the plan's weekly grant only while the
  shared effective-access resolver says the paid plan is usable. An expired or
  malformed trial does not retain paid quota.

### Consumption, manual grants, and resets

- AI inference, customer-triggered Google Places calls, and chargeable WhatsApp
  sends consume the same finite organization balance. Every successful debit
  records the canonical credit quantity in `usage_events`; provider/resource
  details remain explicit event dimensions or metadata. A non-blocking provider
  action that proceeds after quota is
  exhausted is recorded as an uncharged over-limit event and cannot silently
  mint capacity.
- Per-chat session limits apply to AI inference within the current UTC week.
  Admission, balance deduction, session-cap enforcement, the usage event, and
  the legacy usage-detail projection must use one D1 batch/conditional admission
  boundary. A pre-read is only a user-facing hint, not the concurrency guard.
- A `manual` grant is additive only within its declared current UTC week. It
  expires at the period end and never becomes a lifetime wallet balance.
- A `reset` grant establishes the exact remaining balance for its declared
  current UTC week. It does not delete or rewrite earlier grants or usage. A
  reset to zero remains zero until a later approved adjustment, effective-plan
  transition, or the next weekly plan grant.
- Plan and reset grants are baseline events; manual grants are additive events.
  When an effective-plan transition creates more than one plan baseline in one
  week, the latest baseline wins. Manual grants made before that transition do
  not silently carry to the new plan.
- Operator adjustment is a platform billing control-plane permission, not
  tenant ownership or impersonation. Dry-run is the default. Apply requires the
  exact reviewed organization, action, period, reason, actor, expected current
  state, and approval token; reusing the idempotency key cannot apply twice.

### Historical reconciliation

- Legacy `ai_usage_log` and `ai_credits.lifetime_used` data are retained.
  Missing canonical usage events are backfilled only through the approved,
  idempotent reconciliation operation.
- An existing balance without a canonical period key is legacy state. Runtime
  must not silently refill or overwrite it. The reconciliation plan preserves
  its remaining balance with an auditable current-period reset, then normal
  weekly grants begin at the next period boundary.
- Legacy credit top-up, service add-on, and auto-top-up schema is removed after
  the production census found no recorded or still-open customer obligation.
  Historical applied migrations remain immutable. Any pre-apply census must
  fail closed on an unexpected row rather than dropping, fulfilling, or
  replacing it automatically.

## Consequences

Customers manage capacity through their recurring organization plan. Platform
billing operators use the dry-run and approved-apply quota operation for an
auditable correction; they do not hand-edit D1, impersonate a tenant owner, or
resubscribe customers. Dashboard and API copy reports the UTC-week period,
plan allowance, period usage, remaining balance, and lifetime usage separately;
it never reconstructs a fictitious "total granted" value by adding a current
period balance to lifetime usage. Existing payment, usage, past-due grace,
webhook retry, checkout return, and Stripe-plan-cache behavior remain covered by
the billing regression suite.
