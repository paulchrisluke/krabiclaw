# Airbnb parity: schema and MCP handoff

**Status: Brief for the schema change — 2026-10-01.** Written for whoever
simplifies the booking schema and the MCP tools. The CMS presentation work
(theme, shells, row controls, Menu fixes) is done in PR #1200; this document
is what that work found it could not fix without changing the data model.

## The owner's rules

These are requirements, not preferences. Each one came from the owner after
the CMS drifted from it.

1. **Be exactly like Airbnb.** Host tools and the guest booking page are the
   reference for fields, flow and wording. Do not keep a concept Airbnb does
   not have because our schema already has it.
2. **MCP is canonical, and so are the site templates.** Every value the CMS
   edits must be writable by an MCP tool, and every value must be shown by a
   template or used by booking. A value that is neither is deleted, not
   given a screen.
3. **Products stay.** Product → Variant → Price is the Stripe commerce model
   (#1213 builds Checkout on it). Simplify around it; do not replace it.
4. **No invented scheduling rules.** The scheduling machinery was not asked
   for. Keep only what Airbnb's host calendar has.
5. **One source per value.** Capacity and duration are each stored in exactly
   one place.
6. **No CMS-only lifecycle.** No dirty tracking, no revert/restore paths, no
   draft state MCP does not have. A product's commit is "Publish".
7. **No invented copy.** Labels, sentences and summaries come from the
   template that renders the value, the MCP description, or the data.
8. **One PR per change**, verified in the browser, with screenshots before
   review.

## What Airbnb actually does

Captured 2026-10-01 from the owner's logged-in account. Screenshots are in
`goal/airbnb-experience/` (window-only captures) alongside the earlier
`goal/airbnb{,-desktop}/` library.

### What a guest sees on an experience (`guest-experience-*.jpg`, `guest-show-dates.jpg`)

Title, one paragraph, photos; rating; host; place; duration ("Around 3 hr 30
min"); language; **What's included**; **What you'll do** (the itinerary: a
titled, described step per activity); reviews; **Where we'll meet**; **About
me**; **Things to know**: guest requirements ("Guests ages 2 and up"),
activity level, what's included, accessibility features, and **one**
cancellation sentence ("Cancel at least 1 day before the start time for a
full refund"). The booking panel says "From $27 / guest · Free cancellation".

"Show dates" opens one list: guest count (adults, children), then dated time
slots, each with its time range and price per guest, some marked "Private
pricing available". Pick one, continue to checkout.

### What a host sets (`host-setup-*.jpg`, draft listing 7243913)

The setup flow is seven steps. Steps 3–6 were walked as a test host; step 6
requires accepting Airbnb's terms and was not accepted.

| Step | Screen | What it asks |
| --- | --- | --- |
| 3 | Photos | At least 5 photos, one cover |
| 4 | Itinerary | Up to 10 activities. Each: title (≤35), description (≥30), duration (minutes stepper), one photo |
| 5 | Pricing | Maximum guests; price per guest; private group minimum (skippable); review; **What's included** as a checklist (attraction tickets, a full meal, light bites, specialty drinks, pick-up & drop-off, transit fares, parking, equipment, keepsakes); discounts (limited-time, early bird, large group) |
| 6 | Details | Legal questions (national park, point of interest, vehicles, licensed transport) and terms |

Scheduling is **not** part of setup. After publishing (Airbnb Help 2645,
1934, 1565, 2595):

- **Calendar instances**: "Add the date and time, booking type (private or
  public), price, group size, and if you want to repeat the experience daily
  or weekly." Edits apply to one instance or all future ones; booked ones
  are untouched.
- **Two cutoff times** (Listing editor → Availability): a first-booking
  cutoff after which an unbooked instance is removed, and a new-guest cutoff
  after which more guests cannot join.
- **Cancellation**: fixed. One day (full refund until 24 hours before);
  some hosts may choose three days. No reschedule rule, no deposit.
- **Private groups**: a minimum price; max 30 guests private, 200 public.

For homes (the `goal/airbnb/` captures): advance notice, cancellation as a
named tier, instant book, house rules as ✕/✓. There is no restaurant table
reservation on Airbnb; reservations here should borrow the homes availability
shape, not invent one.

## What we have

Counts are from local D1, which is a pull of production
(`corepack yarn local:setup`).

| Concept | Rows |
| --- | --- |
| Restaurant reservations | 23 |
| Reservation policies (`location_reservation_configs`) | 6 |
| Bookable products (`product_booking_configs`) | 11 |
| Weekly schedule rules (`product_availability_rules`) | 131 |
| Generated sessions (`product_sessions`) | 960 |
| Experience bookings (`bookings`) | 3 |
| Product options | 0 |
| Attribute definitions (`metafield_definitions`) | 18 |
| Q&A documents | 134 |

### Experience booking

- **Capacity in three places**: `product_booking_configs.default_capacity` →
  `product_availability_rules.capacity` → `product_sessions.capacity`.
- **Duration in three places**: `product_booking_configs.duration_minutes`,
  `product_availability_rules.duration_minutes`, session `ends_at`.
- **Rule columns nothing writes**: `end_time`, `interval_minutes`,
  `interval_weeks`, `effective_from_date`, `effective_until_date`,
  `duration_minutes` on `product_availability_rules`; `replaceWeeklySchedule`
  resets saved rules to plain weekly ones (`server/utils/availability.ts:330`).
- **Open PRs add more**: #1211 migration `0002` adds `confirmation_mode`,
  `online_payment_required`, `online_timezone`, `calendar_group` to
  `product_booking_configs` and `organization.consultation_settings_json`.
- **MCP cannot set any of it**: no tool writes booking, session length,
  places or schedule. #1209 adds `list_product_booking_sessions`,
  `list_product_bookings`, `create_product_booking`, `get_product_booking`,
  `request_product_booking_change`, `cancel_table_reservation`,
  `request_table_reservation_change` — operations on bookings, still nothing
  that sets the schedule.
- **Core listing content is in a generic attribute bag**: tagline, what's
  included, what to bring, meeting point, pricing note and the booking
  cancellation policy are `metafield_definitions` handles the product page
  special-cases (`components/products/ProductDetailPage.vue:32-38, 100-156`).
  Airbnb has these as first-class fields; we have an "Attributes" list.
- **Itinerary does not exist**. Airbnb's central experience field has no
  equivalent.
- The dashboard's experience booking shows "No cancellation terms have been
  configured" because its policy is read from the location
  (`server/utils/dashboard-booking-details.ts:195-197`), while the guest saw
  the product's `booking.cancellation-policy` attribute.

### Restaurant reservations

`location_reservation_configs` has nine policy columns; the row's existence is
the on/off switch.

| Column | Guest sees it | Enforced |
| --- | --- | --- |
| `slot_capacity` | as remaining seats in the time picker | yes |
| `advance_notice_minutes` | no | yes (`server/utils/reservations.ts:338`) |
| `free_cancellation_until_minutes` | as a sentence | **no** — the guest cancel route never checks it (`server/api/public/booking-requests/[requestId]/cancel.post.ts`) |
| `reschedule_allowed`, `reschedule_cutoff_minutes` | as a sentence | **no** |
| `deposit_required`, `deposit_trigger_party_size` | as a sentence | **nothing collects a deposit** |
| `minimum_guest_age` | **no** (experience only, `server/utils/booking-policy-summary.ts:87`) | no |
| `accessibility_contact_required` | **no** (experience only, `:96`) | no |
| `additional_notes_html` | yes | — |

Also: `business_locations.max_capacity` is described by MCP `update_location`
as "set it to actually limit how many guests can book"
(`server/utils/mcp-tools/locations.ts:48`) and is enforced nowhere.
Reservation length is hard-coded at 120 minutes
(`server/api/public/reservations.post.ts:133`). Saving any calendar setting
creates the policy row and so silently opens reservations.
`utils/booking-policy-presets.ts` has no importers and contradicts
`shared/availability-settings.ts`.

## Contradictions between CMS, MCP and the site

| What | CMS | MCP / site | Evidence |
| --- | --- | --- | --- |
| Q&A | full create/edit/hide/delete | "Q&A is read-only; manage Google questions and answers in Google." | `server/utils/mcp-tools/qa.ts:7,20`; `server/utils/location-qa.ts:154` |
| Closure note | labelled "Guest message" | `block_dates`: "for the team; guests never see it"; the public page shows it | `mcp-tools/locations.ts:90`; `utils/formatters.ts:22` → `pages/locations/[slug]/index.vue:60-62` |
| Contact email | Brand → Contact details | "Public contact email shown to guests"; no template displays it | `mcp-tools/organizations.ts:132`; only `pages/reservations/index.vue:280-284` as a fallback |
| Brand rename | Brand name | silently re-allocates the subdomain | `server/utils/organization-settings.ts:311-312, 494-496` |
| Location name, description, slug, status, features | editable | no MCP tool | `mcp-tools/locations.ts:42-52` |
| Location description, price level | editable | never rendered | no template reference |
| Product tags | editable, translatable | never rendered | no template reference |
| Domains, languages, font, integrations, members, payouts, review visibility | editable | no MCP write tool | see the Menu audit in PR #1200 |
| MCP-only fields | none | `press_email`, `partnerships_email`, `catering_email`, `careers_email`, `seo_title`, `seo_description`, `canonical_url`, blog `seo_keywords`, page `path` | `mcp-tools/organizations.ts:135-141` |
| Currency | one field | two MCP tools write it | `set_default_currency`, `update_organization_settings.default_currency` |
| A cancelled reservation | still offers "Change reservation" | — | `current/reservation-details.jpg` |

## Proposed target (for the schema owner to decide)

Not prescriptive; the evidence above is. This is what "exactly like Airbnb,
products kept" points to.

**Experience** = a Product (kept for Stripe) whose listing fields are
first-class, not attributes: description, itinerary (ordered activities:
title, description, duration, photo), what's included (checklist),
meeting point, language, minimum age, activity level, accessibility features,
cancellation (1 or 3 days), group size, price per guest via its Variant/Price,
private group minimum.

**Calendar instance** = the only schedule record: product, date, start time,
duration (derived from the itinerary or set once), group size, price
override, private or public, optional repeat (daily/weekly) that expands
into instances. Two cutoffs on the product. Capacity and duration live on
the instance or the product, not both, and not on a rule table.

**Restaurant reservations** = advance notice, seats per time slot,
reservation length, one cancellation policy that is enforced (or none), and
notes. Delete the deposit, the separate reschedule cutoff, minimum age,
accessibility and `max_capacity` unless they are made real.

**MCP** = one write tool per concept above; the CMS edits exactly those
fields. Delete any page or column outside that list.

**Data moves**: 11 bookable products, 131 rules, 960 sessions and 3 bookings
move to the new shape; 6 reservation policies lose their dead columns. Use the
epoch process in `docs/operations/release-and-outage-prevention.md`.

## Screenshot index

| File | What it shows |
| --- | --- |
| `goal/airbnb-experience/guest-experience-0…4500.jpg` | The guest experience page, top to bottom |
| `goal/airbnb-experience/guest-show-dates.jpg` | Guest date/time picker with per-guest price |
| `goal/airbnb-experience/host-setup-01-photos.jpg` | Setup step 3, photos |
| `goal/airbnb-experience/host-setup-02/03-agenda.jpg` | Setup step 4, itinerary activities |
| `goal/airbnb-experience/host-setup-04-guest-count.jpg` | Maximum guests |
| `goal/airbnb-experience/host-setup-05/06/07-price.jpg` | Price per guest, private group minimum, review |
| `goal/airbnb-experience/host-setup-08-whats-included.jpg` | What's included checklist |
| `goal/airbnb-experience/host-setup-09-discounts.jpg` | Discounts |
| `goal/airbnb-experience/host-setup-10-legal-questions.jpg` | Legal questions and terms (not accepted) |
| `current/product*.jpg` | Our product editor: index, booking (the schedule grid), options, attributes, price |
| `current/location*.jpg`, `current/closure-exceptions.jpg` | Location index and fields; the closure note |
| `current/calendar-settings.jpg` | Calendar → Settings (hours, notice, seats, cancellation) |
| `current/qa.jpg` | The Q&A editor MCP calls read-only |
| `current/brand-contact.jpg` | Contact email that is never displayed |
| `current/reservation-details.jpg` | A cancelled reservation still offering Change |
| `current/menu-fixed-*.jpg` | The Menu pages after PR #1200's fixes |
