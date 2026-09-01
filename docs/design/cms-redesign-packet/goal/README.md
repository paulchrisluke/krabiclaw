# Goal: Airbnb Hosting Listing Editor

Reference screenshots from Airbnb's own listing editor, used only for the navigation/layout patterns called out in `principles/README.md` — large photo cards, single-field-per-screen editing, drill-down navigation, bottom Cancel/Save bars, large text areas.

**Captured: 48 screenshots** across two capture sessions — 30 on 2026-08-31/09-01 (CSS viewport width not independently verified for that session — see Viewport note below), 18 more on 2026-09-01 evening (verified 500×701 CSS px, device pixel ratio 2 — see Viewport note).

Every screen listed in the original request has now been captured: Arrival guide's full set of child editors, Guest safety's child editors, a Photo tour room/caption editor, Preferences and guest requirements, and an authorized incomplete-listing/unpublished state. Nothing below is listed as blocked — the only prior "blocked by session expiry" framing was inaccurate; these were simply not yet done, and are done now.

## Viewport note

The 2026-09-01 evening batch (18 files, listed below) was measured directly: `window.innerWidth` 500, `window.innerHeight` 701, `window.devicePixelRatio` 2 — i.e. an effective 1000×1402 physical pixel capture at CSS 500×701. The original 30-file batch from the prior session used a different browser instance that's no longer available to re-measure; session notes from that pass describe deliberately reproducing "~500px raw width" mobile layouts, consistent with this batch, but its exact height and device-pixel-ratio were not logged and can't be retroactively confirmed. Do not read the two batches as using different viewports — the best available evidence is that they match — but only the second batch's numbers are independently verified.

## Privacy note

One screenshot (`details/location/index.jpg`) shows a real host's address and photo. This listing belongs to Airbnb's own demo/reference host account, not a KrabiClaw customer, and is publicly viewable on airbnb.com in the ordinary course of using the product.

## The reference listing's actual state

Correcting an earlier assumption in this README: the listing used throughout ("Entire Residential Home Downtown Chattanooga", id `49487067`) is **not** fully live and set up. Its `preferences/status` shows **Unlisted**, and its Photo tour shows **1 open task** (the Bedroom room has no photo yet). This is an authorized, pre-existing draft on the account already used for every other capture in this packet — nothing was created or published to get the incomplete-setup screens below.

## Route → file table

| Screenshot | Route | What's on screen |
|---|---|---|
| `hosting/listings/index.jpg` | `/hosting/listings` | Listings list — large full-width photo cards |
| `.../editor/[listingId]/index-incomplete-setup.jpg` | `/details`, top of page | Photo tour card showing "10 photos" preview + **"You have 1 task"** — the listing's actual incomplete-setup indicator |
| `.../details/index-your-space-tab.jpg` | `/details` — "Your space" tab | Hub screen: Photo tour, Title, Description, Amenities, Pricing, Availability, Location, etc. as list rows |
| `.../details/index-your-space-tab-description-amenities.jpg` | same, scrolled | Description and Amenities rows |
| `.../details/index-your-space-tab-pricing.jpg` | same, scrolled | Pricing row + guest-facing price preview |
| `.../details/index-your-space-tab-location.jpg` | same, scrolled | Location, Co-hosts rows |
| `.../details/index-your-space-tab-house-rules.jpg` | same, scrolled | House rules, Guest safety rows |
| `.../details/index-your-space-tab-cancellation.jpg` | same, scrolled | Cancellation policy, Custom link rows |
| `.../details/title/index.jpg` | `/details/title` | Single-field screen: listing title, character counter, bottom Cancel/Save |
| `.../details/photo-tour/index.jpg` | `/details/photo-tour` | Photo grid with room-by-room grouping (captured earlier session) |
| `.../details/photo-tour/index-with-task.jpg` | same | Same hub, later capture, with the "View your tasks" incomplete-setup banner visible |
| `.../details/photo-tour/additional-photos/index.jpg` | `.../photo-tour/additional-photos` | One room's photo grid (4+ photos) |
| `.../details/photo-tour/additional-photos/photo-edit-detail.jpg` | `.../photo-tour/additional-photos/{photoId}` | **Per-photo caption/edit state**: delete, "Add a visual description" field with a 250-char textarea, "Move from [room]?" reassignment |
| `.../details/photo-tour/photos/index.jpg` | `.../photo-tour/photos` | All-photos grid with a "Cover photo" badge — Airbnb's manual reorder/cover-photo surface. Its own "Arrange photos" AI-sort suggestion modal was dismissed via "No thanks," not applied, so the order shown is unmodified |
| `.../details/description/index.jpg` | `/details/description` | Description **hub** — sub-list: Listing description / Your property / Guest access / Interaction with guests / Other details to note |
| `.../details/description/listing-description/index.jpg` | `.../description/listing-description` | Full-screen textarea, live character counter |
| `.../details/description/your-property/index.jpg` | `.../description/your-property` | Full-screen textarea child field |
| `.../details/description/guest-access/index.jpg` | `.../description/guest-access` | Full-screen textarea child field |
| `.../details/description/interaction-with-guests/index.jpg` | `.../description/interaction-with-guests` | Full-screen textarea child field |
| `.../details/description/other-details/index.jpg` | `.../description/other-details` | Full-screen textarea child field |
| `.../details/amenities/index.jpg` | `/details/amenities` | Category-grouped checklist, icon + label per row |
| `.../details/pricing/index.jpg` | `/details/pricing` | Base price field + fee breakdown |
| `.../details/number-of-guests/index.jpg` | `/details/number-of-guests` | Stepper field (guests/bedrooms/beds/bathrooms) |
| `.../details/discounts/index.jpg` | `/details/discounts` | Weekly/monthly/new-listing discount toggles |
| `.../details/availability/index.jpg` | `/details/availability` | Booking window + calendar sync settings |
| `.../details/location/index.jpg` | `/details/location` | Map pin + address fields (see privacy note above) |
| `.../details/host/index.jpg` | `/details/host` ("About the host") | Host bio, years hosting, response rate |
| `.../details/co-hosts/index.jpg` | `/details/co-hosts` | Co-host list + invite action |
| `.../details/house-rules/index.jpg` | `/details/house-rules` | Checked-in/out times, standard + additional rules |
| `.../details/guest-safety/index.jpg` | `/details/guest-safety` | Guest safety **hub** — 3 sub-list rows: Safety considerations / Safety devices / Property info |
| `.../details/guest-safety/safety-considerations/index.jpg` | `.../guest-safety/safety-considerations` | Toggle list: "Not a good fit for children 2–12," "for infants under 2," pool/hot-tub gate, nearby water, each with a Learn-more link |
| `.../details/guest-safety/safety-devices/index.jpg` | `.../guest-safety/safety-devices` | Toggle list: exterior security camera, noise decibel monitor, carbon monoxide alarm, etc. |
| `.../details/guest-safety/property-info/index.jpg` | `.../guest-safety/property-info` | Toggle list: stairs, potential noise, pets on property, no parking, each with an "Add details" affordance |
| `.../details/cancellation-policy/index.jpg` | `/details/cancellation-policy` | Policy tier selection (Flexible/Moderate/Firm/Strict) |
| `.../details/custom-link/index.jpg` | `/details/custom-link` | Custom listing URL slug field |
| `.../details/instant-book/index.jpg` | `/details/instant-book` | "Use Instant Book" / "Approve all bookings" — Booking settings screen |
| `.../details/accessibility/index.jpg` | `/details/accessibility` | Accessibility features checklist |
| `arrival/index.jpg` | `/arrival` ("Arrival guide" tab) | Hub screen, first capture (Check-in method, Wi-Fi details rows) |
| `arrival/index-full-hub.jpg` | same | Fuller hub capture from the later session: Check-in/Checkout combined card, Directions, Check-in method with a "Connect your lock" prompt |
| `arrival/index-scrolled.jpg` | same, scrolled | Wifi details, House manual, House rules cards |
| `arrival/check-in-out/index.jpg` | `/arrival/check-in-out` | **Check-in and Checkout are one combined editor**, not two — Check-in window (start/end time) + Checkout time, one Cancel/Save bar |
| `arrival/directions/index.jpg` | `/arrival/directions` | Empty-state textarea, "Shared once a booking is confirmed" |
| `arrival/check-in-method/index.jpg` | `/arrival/check-in-method` | "Connect your lock for smooth check-ins" card + method selector |
| `arrival/wifi-details/index.jpg` | `/arrival/wifi-details` | Network name / password fields, "Shared 24–48 hours before check-in" |
| `arrival/house-manual/index.jpg` | `/arrival/house-manual` | Empty-state textarea, same 24–48-hour share timing |
| `preferences/index.jpg` | `/preferences` (via the listing editor's settings-gear icon) | Preferences **hub**: Listing status, Languages, Guest requirements, Local laws, Taxes, Airbnb.org stays |
| `preferences/status/index.jpg` | `/preferences/status` | **The actual publishing-state screen** — Listed vs. Unlisted choice, this listing is currently Unlisted |
| `preferences/guest-requirements/index.jpg` | `/preferences/guest-requirements` | "Require a profile photo" toggle + the fixed list of requirements every Airbnb guest must meet |

## What's still not captured, and why

- **Photo reorder via drag** — the manual reorder surface (`photo-tour/photos`) is captured showing the Cover-photo badge, but an actual drag-in-progress or a changed order wasn't captured, since doing so would have modified this real, shared draft listing's photo order without authorization to make that change. The all-photos grid and its "Cover photo" designation are the closest observable evidence of the ordering mechanism without mutating it.
- **A second, more visibly "in-progress" listing** — this account also has an "In progress" Experience listing ("Practice wellness with a fitness coach") visible on `/hosting/listings`, not explored further since the home listing's own Unlisted/1-task state already satisfied the incomplete-setup requirement.
