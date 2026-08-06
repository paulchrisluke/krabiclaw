# ADR 0022: Uber-style restaurant ordering with a merchant-handoff boundary

Status: Accepted
Date: 2026-08-04
Issue: #248

## Context

Issue #248 originally described QR table ordering together with Stripe Connect, a restaurant order dashboard, and a kitchen display workflow. The repository currently has published menus, locations, Better Auth access, notifications, and Stripe SaaS billing, but no first-party QR-ordering domain. The current dashboard `Orders` page only edits external Grab, Uber Eats, and Foodpanda URLs.

The design discussion compared Toast and Uber Eats, then repeatedly risked expanding KrabiClaw into a POS/KDS/kitchen system. That would duplicate the operational systems restaurants already use and would move the product beyond the integration boundary we need for QR ordering.

## Decision

KrabiClaw follows the Uber Eats restaurant integration model and stops at the merchant handoff:

- KrabiClaw owns the guest QR experience, published Product/Price catalog, Ordering menu, Cart, Order rounds, Invoice/check, Payment records, inventory/availability contract, service-point context, guest status, and integration API.
- Each location has one active Integration destination for native order handoff. If it cannot receive orders, checkout fails closed. There is no automatic alternate receiver, internal kitchen queue, or silent fallback.
- The canonical handoff flow is notification → authoritative order retrieval → accept/deny → ready-time update → ready → cancel/complete, with separate integration-delivery state and merchant order/fulfillment state.
- The shared Invoice/check groups multiple immutable Order rounds. Open-check-capable destinations may receive unpaid rounds; payment remains a separate capability and state.
- Catalog, inventory, payment, and operational events use verified, idempotent, version-aware push events. Polling is not part of the contract. An unavailable item or provider error is an error, not a substitution or fallback path.
- The restaurant baseline does not include Uber’s separate retail substitution/partial-availability approval workflow. Item-level issue handling is only an optional capability when an explicitly supported integration provides it.
- Better Auth remains the only integration authentication boundary. Use its documented server API, OAuth 2.1/resource-server primitives, and API Key plugin where enabled. Do not add custom integration sessions, credential tables, token verifiers, or provider-specific webhook-auth infrastructure.
- Native station routing, Prep Stations, KDS screens, printers, kitchen tickets, expediter workflows, and POS replacement are outside this QR-ordering product boundary. They may be a separate future product.

The only KrabiClaw-specific adaptations to the Uber restaurant model are the QR/service-point context, Better Auth Anonymous guest continuity, open Invoice/check behavior across order rounds, and KrabiClaw’s catalog/payment domain records.

## Consequences

- The existing external ordering-link editor must move to location settings or remain a separate external-channel configuration surface; it is not the native Orders workspace.
- Native ordering activation requires a verified merchant handoff destination and reliable inventory/catalog/payment capabilities appropriate to the enabled flow.
- Integrations must preserve stable KrabiClaw IDs, provider mapping IDs when applicable, immutable snapshots, idempotency keys, and external references without making provider IDs the canonical commerce identity.
- Payment/provider eligibility and country rules remain separate from SaaS subscription billing. Payment webhooks update Payment/Invoice state and do not silently rewrite Order/Fulfillment state.
- The public SEO menu and interactive Ordering menu are distinct surfaces over shared published catalog data.

## Explicit non-goals

- Native KDS, kitchen station routing, prep tickets, printer/device management, or POS replacement
- Automatic provider failover or an internal operational fallback queue
- Retail/grocery-style substitutions as a restaurant baseline
- Polling provider inventory, catalog, payment, or status APIs
- A second guest-session, integration-session, credential, or token-verification system outside Better Auth
- Stripe Connect as a prerequisite for the payment-neutral order handoff slice
