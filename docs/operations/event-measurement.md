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

`signupCohort` groups signups by the signup event's own snapshot and follows the
user through the organizations they own to onboarding and first payment. It never
rewrites the later events' own attribution. `attribution` groups sessions and
outcome events by each one's own snapshot.

## Value

Amounts are stored in minor units with an ISO currency in the event payload
(`value`) and converted to major units once, in `utils/ga4-projection.ts`.

- `quoted` (bookings): the price the guest was shown. It is `unit_amount x
  party_size` for the selected variant, resolved with `resolveVariantPrice`
  (`shared/prices.ts`) at booking creation and snapshotted; a later price edit
  never revalues it. Experience seats are priced per person, as the product page
  states. A variant with no offer has no value, not a zero. A quote is not revenue.
- `purchase`: `value` is the invoice total excluding tax (GA4 ecommerce `value`);
  `collected_minor` is `amount_paid`, tax included. Report both.
- `refund`: the refunded amount, linked to the invoice (`transaction_id`); every
  refund ID is its own event, so partial refunds stay distinct and a redelivery is
  not a second refund.

Purchases are typed `initial_subscription` (the first positive payment the
customer ever made, including the first charge after a zero-value trial),
`subscription_renewal`, `upgrade`, `downgrade` or `plan_change`, from Stripe's
paid-invoice history, not a shadow lifecycle. Invoice IDs are unique within the
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
| `no_consent_context` | no visitor request or GA client ID, so consent cannot be observed |
| `consent_rejected` | the visitor's Zaraz consent cookie declines the `kc_analytics` purpose |
| `failed` | provider error (`detail` has the reason) |

Measurement Protocol (signup, onboarding and the Stripe family): the API secret
(`GA4_API_SECRET`) belongs to the platform organization's property. For signup and
onboarding the consent and GA client come from the visitor's own request: only the
Zaraz consent cookie and the `_ga` cookies are read, and a request without a
consenting visitor sends nothing and records `no_consent_context` or
`consent_rejected`. For Stripe the client ID is the one captured in the visitor's
consenting browser; it is never synthesized from a user ID. A `failed` Stripe
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
2. Password and social signup, real onboarding, Stripe test payment, first
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
