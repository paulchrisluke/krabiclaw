# Payments shared-schema inventory at owner pause

Read-only inventory for the deletion-first CMS/shared-contract review. No deletion or new schema change is authorized by this document. Payments draft #1213 resumed on the verified dependency successor on 2026-10-02; this records the implemented surfaces for review, not a claim that every structure must be retained.

## Canonical dependencies reused

- Product → Variant → Price → Session → Booking remains the catalog/booking chain. No Consultation table, alternate Price owner or ReservationOptions was added. Booking operational identity is `bookings.id`; legacy request-based public IDs retain compatibility.
- Foundation `product_booking_configs` supplies confirmation mode, optional collection, timezone and tenant calendar group. Its `sessionAllocationPredicate` is the capacity/overlap authority; Payments adds active unexpired holds to that same allocation boundary. Guest-thread operations remain the booking lifecycle dispatcher.
- Existing `stripe_connected_accounts` and `stripe_catalog_mappings` remain seller account/catalog projections. Payments tightens native responsibility/readiness validation rather than creating another connected-account registry.
- Better Auth `organization.stripeCustomerId` remains the operating customer authority. Better Auth owns subscriptions and its own webhook. The Payments billing account snapshots the financial customer/Metronome relationship for servicing; it does not replace subscription billing.
- Shared booking controller/components and current CMS product/variant/price editor are reused. Foundation service-page product binding preserves service content/images/SEO; all templates must consume the same product booking configuration. Payments introduces no template-specific financial table.
- Calendar is an outbound operational-booking projection; Payments does not infer availability from Google events.

## Added durable structures needing shared review

The Payments migration adds fourteen structures:

| Structure | Current responsibility / overlap to assess |
| --- | --- |
| `payments` | Minimal scoped native financial identity and cached state; immutable price snapshot overlaps catalog fields by design. Review unused subject tags `reservation`/`invoice`; no corresponding new checkout flow was added. |
| `payment_attempts` | Checkout request/idempotency and expiring provider handoff, separate from payment status. |
| `payment_checkout_holds` | Expiring allocation before payment; quantity/price/time/calendar snapshots repeat catalog/session fields. Converted Booking remains canonical operational record. |
| `payment_orders`, `payment_order_lines` | Physical one-time order and immutable lines; catalog identity/price repeated as historical snapshots. No shipping engine or recurring buyer subscription. |
| `payment_refunds`, `payment_disputes` | Minimal native servicing status/identity, not a balance ledger. |
| `payment_usage_events` | Durable delivery/idempotency and unsettled credit outbox; Metronome owns rating/invoices. |
| `payment_billing_accounts` | Operating customer/Metronome relationship and contract servicing state; review immutable customer snapshot alongside `organization.stripeCustomerId`. |
| `payment_authorizations` | Actor-bound expiring financial browser approval; assess alignment with shared write-confirmation conventions. |
| `payment_claims` | Hashed guest purchase possession proofs linked to existing user identity; no separate buyer User model. |
| `payment_fee_reports`, `payment_cost_snapshots` | Provider report progress and attributable revision deltas; Stripe remains financial authority. |
| `payment_servicing_tenants` | Minimal account/mode tombstone to service retained financial links after canonical tenant deletion. Review alongside shared deletion/retention policy. |

No account/tenant/catalog deletion should cascade through required financial records. Existing canonical tenant cleanup was adjusted to retain servicing relationships and null removable buyer identity while preserving protected financial parents. This must be reviewed with CMS cleanup before changing deletion behavior.

## API/controller paths and legacy separation

- New dashboard/account/MCP payment endpoints call `server/domain/payments/*`; payment Checkout/capture/refund/claim state has one domain implementation. Dashboard reads expose the same financial identities used by MCP.
- `/api/stripe/payments/webhook` handles connected financial events; existing `/api/stripe/connect/webhook` handles Accounts v2 thin readiness events. Better Auth subscription events remain in its canonical handler. These are separate provider contracts, not alternate subscription handlers.
- The one shared Stripe client constructor has stable canonical and explicit Payments preview purposes. Search found no additional application `new Stripe` constructor.
- Existing paid booking rejection is extended through the canonical guest-thread operation's financial handoff. Payment/refund/booking/fulfillment states are deliberately distinct; approval/cancellation does not allocate capacity a second time.
- Existing service/Blawby/experience-link replacement belongs to Foundation #1211, not a second Payments booking adapter. Payments consumes the shared controller, including service `showPartySize=false` and server-session timezone.

## Dependency boundary

Current integrated Foundation is `a7fd549e` through MCP `61f4ada75e361ef4fe839c05d7a3c531cd074c15` and Calendar `4a8df9e82b525a2dfb619c36aac94b82ccf1d259`. Foundation migration `0004` and Calendar `0005` remain unchanged; canonical tooling regenerated Payments as additive `0006`. Only the verified dependency successor is incorporated; no unfinished service/schedule UI redesign is imported. Root should review its canonical catalog/editor/deletion contracts before further Payments integration. Current draft remains stacked; no retarget, merge, deployment or deletion was performed at the pause.
