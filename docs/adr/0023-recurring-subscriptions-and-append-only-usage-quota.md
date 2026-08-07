# ADR 0023: Recurring subscriptions and append-only usage quota

Status: Accepted

## Context

KrabiClaw historically contained one-time AI credit purchases, manually
fulfilled service add-ons, and automatic card top-ups alongside the recurring
Better Auth Stripe subscription integration. Those paths created a second
product model and allowed a payment event to mutate customer capacity outside
the subscription entitlement projection.

## Decision

- Better Auth's organization subscription is the billing authority.
- Stripe recurring plans and the application-owned entitlement policy define
  the available plan capacity; prices remain unchanged by this decision.
- Usage is recorded in the append-only `usage_events` ledger.
- Plan grants, approved resets, and manual grants are recorded in the
  append-only `usage_quota_grants` ledger.
- `ai_credits` remains a derived enforcement balance and historical usage
  summary, not a customer-purchasable wallet.
- New one-time credit checkout, service-addon checkout, and auto-top-up writers
  are removed. Historical tables, rows, and read-only fulfillment views are
  retained for auditability.
- Historical one-time checkout metadata is acknowledged by the webhook worker
  and ignored; it cannot create new capacity or fulfillment rows.

## Consequences

Customers manage capacity through their recurring organization plan. Platform
operators use the owner-only quota reset endpoint for an auditable correction;
they do not hand-edit D1 or resubscribe customers. Existing payment, usage,
past-due grace, webhook retry, checkout return, and Stripe-plan-cache behavior
remain covered by the billing regression suite.
