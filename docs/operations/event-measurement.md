# Event measurement

One tenant-scoped event contract measures every business outcome, whatever the
theme or entry surface. Native reporting is the D1-backed report
(`server/utils/analytics-report.ts`) served identically by the dashboard API, the
MCP tool `get_organization_analytics` and CMS Insights. Google Analytics 4 is an
optional destination for the same facts.

## The catalog

`utils/organization-conversion-events.ts` is the only catalog: producer, allowed
stages, subject entity, value semantics, conversion type, GA4 projection and the
one GA4 sender for each event. The writer
(`server/utils/organization-conversions.ts`) enforces it; the schema
(`analytics_events_shape_check`, `analytics_events_conversion_entity_unique`)
enforces the shape and the once-per-subject rule.

| Native event | Subject (entity) | Counted | GA4 event | GA4 sender |
| --- | --- | --- | --- | --- |
| `sign_up` | user | once per registered user (`databaseHooks.user.create.after`; anonymous guests, login, provider linking and existing-user invitation acceptance never reach it) | `sign_up` | Measurement Protocol |
| `onboarding_complete` | organization | once per organization, when `activateOrganization` commits `onboarding_status = 'active'` | `tutorial_complete` | Measurement Protocol |
| `contact_submit` | request | persisted enquiry | `generate_lead`, `conversion_type=contact` | browser (Zaraz web API) |
| `reservation_submit` | request | persisted reservation | `reservation_submit`, `conversion_type=reservation` | browser |
| `booking_submit` | request | persisted booking, with its quoted value | `booking_submit`, `conversion_type=booking` | browser |
| `purchase` | invoice | Stripe `invoice.paid` with a positive amount | `purchase` | Measurement Protocol |
| `refund` | refund | Stripe refund with status `succeeded` | `refund` | Measurement Protocol |
| `consultation_cta_click`, `product_order_external_click`, `link_click`, `donation_click` | handoffs | every click; a handoff is not a booking, payment or donation | same name | browser |

`view_item` (`Product Viewed`) and `begin_checkout` (`Checkout Started`) are sent
from the product page through Zaraz's ecommerce API and are GA4-only.

Exactly one sender owns each outcome. Never send the application name and the GA4
name for the same fact.

## Measuring organization

The measuring organization is the business whose outcome is measured. KrabiClaw's
acquisition events (`sign_up`, `onboarding_complete`, `purchase`, `refund`) are
recorded on the platform organization (`getPlatformOrganization`); the subscribing
organization is the subject (`entity_id`, `metadata.subscribing_organization_id`).
Customer booking, reservation and contact events are recorded on the customer's
own organization. Subscription revenue therefore never appears in a customer's
report, and a customer's outcomes never fall back to KrabiClaw.

## Attribution

Only a request that already carries `kc_session_id` and `kc_visitor_id` gives an
event a browser session and an immutable snapshot of that session's last-touch
attribution (source, medium, campaign, term, content, click IDs). Everything else
(Stripe webhooks, MCP, dashboard operators, scheduled work) is recorded as a
nonbrowser event with no session and no attribution; nothing mints a browser
session from server headers. The report exposes the count as
`coverage.outcomeEventsWithoutAttribution`.

Revenue is attributed without a browser session: checkout stores the visitor's
native attribution on the subscription intent
(`stripe_ga4_subscription_intents.attribution_json`, read from their `kc_session_id`
session), and the payment a webhook records later carries that snapshot
(`attributedValue`), found through the subscription and checkout kind whatever the
intent's status or expiry, so a first payment after a trial still carries it. Refunds carry their purchase's snapshot. Renewals have no
snapshot of their own; they belong to the signup cohort.

`signupCohort` groups signups by the signup event's own snapshot and follows the
organization the user originated (the first owner, recorded as
`metadata.originating_user_id` on the first onboarding or purchase event; every later
event of that organization, including refunds, reuses that recorded relationship, so
ownership changes never rewrite a result) to onboarding, first
payment and cohort revenue, counting only outcomes after the signup. It never
rewrites the later events' own attribution. `attribution` groups sessions by their
current last touch and counts, in the same group, the sessions that completed an
outcome, so its rate never exceeds 100%. `outcomeAttribution` groups outcome events
by their own snapshot and carries counts only.

## Value

Amounts are stored in minor units with an ISO currency in the event payload
(`value`) and converted to major units once, in `utils/ga4-projection.ts`.

- `quoted` (bookings): the price the guest was shown. It is `unit_amount x
  party_size` for the selected variant, resolved with `resolveVariantPrice`
  (`shared/prices.ts`) at booking creation and snapshotted; a later price edit
  never revalues it. Experience seats are priced per person, as the product page
  states. A variant with no offer has no value, not a zero. A quote is not revenue.
- `purchase`: `value` is the invoice total excluding tax (GA4 ecommerce `value`);
  `collected_minor` is `amount_paid`, tax included. Report both. Items carry each
  invoice line's exact integer total (`amount_minor`), net of its discounts, pretax
  credits and included tax; GA4's unit `price` is derived as total / quantity, so a
  line of 1,000 across three seats neither throws nor rounds. Items are kept only
  when they sum exactly to `value`; otherwise the purchase is sent without items,
  never with a balancing item.
- `refund`: keeps the purchase's basis. `value` is the refunded share of the
  tax-exclusive value (pro rata by cash, exact for a full refund) and
  `collected_minor` is the cash returned, tax included. Stripe does not itemize a
  refund, so items are sent only for a full refund; a partial refund names none.
  It is linked to the invoice (`transaction_id`) and carries the purchase's
  attribution. Every refund ID is its own event, so partial refunds stay distinct
  and a redelivery is not a second refund.

Purchases are typed `initial_subscription` (the first positive payment the
customer ever made, by payment time (`status_transitions.paid_at`, ties broken by
invoice id) rather than invoice creation order, including the first charge after a zero-value trial),
`resubscription` (a new subscription by a customer who has paid before),
`subscription_renewal`, `upgrade`, `downgrade` or `plan_change`, from Stripe's
paid-invoice history, not a shadow lifecycle. Every paid subscription invoice is a
purchase; only invoices outside the subscription lifecycle (for example manual
ones) are not. Invoice IDs are unique within the
seller's Stripe account, which is the measuring organization's namespace.

Currencies are never summed together. `net` is collected minus refunded per
currency, both including tax.

## Report definitions

- `sessionConversionRate` = sessions that completed the event / eligible sessions
  in the range (null when there are none). `events` is frequency; the two are
  different metrics.
- Signup is per user; onboarding and payment are per organization.
  `signupCohort.onboardedSignups` counts a signup as converted when a linked owned
  organization reached the outcome by `observedThrough`. `onboardedBusinesses` and
  `firstPaidBusinesses` count organizations directly and include invitation and
  existing-user journeys.
- `coverage.measurementContractStartedAt` is the first event written by this
  contract. Earlier history has no values, creative content or nonbrowser events
  and is not reconstructed.

## Google Analytics delivery

The destination is always the measuring organization's own connected property
(`organization.integrations_json.google_analytics`) on its canonical host. There
is no environment-level property (`GA4_MEASUREMENT_ID` was removed) and no
platform Zaraz tool: KrabiClaw is configured like any tenant by
`reconcileZarazAnalytics` (`server/utils/zaraz-analytics.ts`), which deletes any GA4
tool that is not a tenant's and sets the zone's `settings.ecommerce`.

Every attempt writes its outcome to the native event (`payload.ga4_delivery`),
surfaced as `coverage.ga4Delivery`:

| Status | Meaning |
| --- | --- |
| `sent` | accepted by the transport |
| `not_configured` | no integration, no measurement ID or host, or no API secret |
| `disconnected` | the property connection is not active |
| `no_consent_context` | no visitor request, no answered consent, or no GA client ID, so consent cannot be observed |
| `consent_rejected` | the visitor's Zaraz consent cookie declines the `kc_analytics` purpose |
| `failed` | provider error (`detail` has the reason) |

Measurement Protocol (signup, onboarding and the Stripe family): the API secret
(`GA4_API_SECRET`) belongs to the platform organization's property. For signup and
onboarding the consent and GA client come from the visitor's own request: only the
Zaraz consent cookie and the `_ga` cookies are read, and a request without a
consenting visitor sends nothing and records `no_consent_context` or
`consent_rejected`. For Stripe the client ID is the one captured in the visitor's
consenting browser; it is never synthesized from a user ID. An identifier is not
consent, so it is enforced at both ends: the browser reads GA identifiers only while
the analytics purpose is accepted, `POST /api/billing/analytics-intent` stores them
only when the request's own Zaraz consent cookie says accepted, and withdrawing
consent is reconciled by `POST /api/billing/analytics-consent`: the server reads the
request's own consent cookie and, for anything but "accepted", erases the identifiers
from the signed-in user's intents and from the Stripe customer and subscription
metadata they captured (`withdrawStripeGaIdentifiers`). It runs when the choice
changes (`zarazConsentChoicesUpdated`) and whenever the authenticated dashboard
mounts, so a choice made while signed out is honored when billing resumes; the
intent endpoint also erases what an earlier acceptance left behind before it merges
metadata. Native recording never depends on consent. A `failed` Stripe
delivery fails the webhook so Stripe redelivers; the native event is already
recorded and is returned on the retry.

### GA4 property setup contract (manual, in the GA4 UI)

Sending an event is not designating it a key event. The property's read-only
Better Auth connection does not authorize edits and no code requests
`analytics.edit`. In each property that should count these:

- Key events: `sign_up`, `tutorial_complete`, `generate_lead`, `reservation_submit`,
  `booking_submit`, `purchase`.
- Event-scoped custom dimensions: `conversion_type`, `value_basis`, `purchase_type`,
  `stage`, `page_type`, `location_id`, `item_id`, `item_name`, `item_variant`.
- `value` on `booking_submit` is a quoted amount, not revenue; ecommerce revenue
  exists only on `purchase`/`refund`. Custom booking events do not populate the
  ecommerce item reports.

## Verification handoff (not done from the code session)

The code session has no GA4 property, Stripe test mode, social login or
Zaraz-enabled environment. A desktop session must verify, recording the tested
SHA:

1. Run `reconcileZarazAnalytics` against the production zone (or the designated
   qualification zone): `ga-platform` is gone, `settings.ecommerce` is true and
   Confirm the
   `Product Viewed` / `Checkout Started` ecommerce events reach GA4 with the
   mapping Cloudflare documents only in general terms.
2. Consent: accept, pay, then withdraw and confirm the stored identifiers are gone and later payments/refunds record natively with delivery `no_consent_context`. Password and social signup, real onboarding, Stripe test payment, first
   payment after a trial, renewal and a partial refund produce the events in the
   table above and the `ga4_delivery` outcomes, in the designated GA4 property
   (DebugView plus a standard report). Validate the Measurement Protocol payload
   with Google's validation server, then confirm collection.
3. `ZARAZ_ANALYTICS=absent` environments never reconcile the zone, so they are not
   evidence of production Zaraz behavior (browser events, ecommerce).
4. Read the same range through the authenticated dashboard API, MCP
   `get_organization_analytics` and CMS Insights and compare fields.
5. Multi-organization isolation: platform subscription revenue on KrabiClaw only,
   tenant booking outcomes on the tenant only.

## Measurement never masks a committed result

`POST /api/public/contact`, `/api/public/reservations` and
`/api/public/products/:slug/book` commit the business record first. Measurement
is recorded after, and its outcome is returned beside the committed identity as
`measurement: { status: 'recorded' }` or `{ status: 'failed', reason }`; it never
turns a confirmed submission into an error the guest would retry.
