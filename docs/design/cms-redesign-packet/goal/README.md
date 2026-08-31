# Goal: Airbnb Hosting Listing Editor

Reference captures from `airbnb.com/hosting/listings/editor/49487067/...` (a listing not owned by KrabiClaw — used purely as an interaction-pattern reference). Mobile viewport, top nav + bottom tab bar (Today / Calendar / Listings / Messages / Menu).

## Route index

| Screenshot | Route | What's on screen |
|---|---|---|
| `hosting/listings/index.jpg` | `/hosting/listings` | Listings list — large card per property/experience with status badge (Published / Setup incomplete) |
| `.../editor/[listingId]/details/index-your-space-tab.jpg` | `/hosting/listings/editor/[id]/details` — "Your space" tab | Listing overview: Unlisted status banner, then one card per field group (Photo tour, Number of guests, Description, Amenities, Pricing, Discounts, Availability, Location, About the host, Co-hosts, House rules, Guest safety, Cancellation policy, Custom link) |
| `.../details/index-your-space-tab-pricing.jpg` | same route, scrolled | Pricing / Discounts / Availability / Number of guests cards |
| `.../details/index-your-space-tab-description-amenities.jpg` | same route, scrolled | Number of guests / Description / Amenities cards |
| `.../details/index-your-space-tab-location.jpg` | same route, scrolled | Location (map) / About the host cards |
| `.../details/index-your-space-tab-house-rules.jpg` | same route, scrolled | House rules / Guest safety cards |
| `.../details/index-your-space-tab-cancellation.jpg` | same route, scrolled | Cancellation policy / Custom link cards |
| `.../details/photo-tour/index.jpg` | `/hosting/listings/editor/[id]/details/photo-tour` | Photo tour: room-by-room photo cards, "View your tasks" nudge, one card per space (Bedroom, Additional photos) |
| `.../details/description/index.jpg` | `/hosting/listings/editor/[id]/details/description` | Description hub: further split into Listing description / Your property / Guest access / Interaction with guests / Other details to note — each its own row |
| `.../details/description/listing-description/index.jpg` | `/hosting/listings/editor/[id]/details/description` (field open) | The actual textarea: full-screen, large text area, live character counter (482/500), Cancel/Save bar |
| `.../details/amenities/index.jpg` | `/hosting/listings/editor/[id]/details/amenities` | Amenities: full list with icon + one-line description per item, Edit / Add actions in the header |
| `.../details/pricing/index.jpg` | `/hosting/listings/editor/[id]/details/pricing` | Pricing: just the price range and a Smart Pricing toggle — nothing else on screen |

## Pattern summary (evidence, not judgment)

- **One concern per screen.** "Description" isn't one screen — it's a hub of five distinct fields, each with its own screen. "Pricing" shows only price + Smart Pricing, nothing else.
- **Large cards, large text.** The overview tab uses full-width photo cards; the description field is a large, uninterrupted text area with just a character counter, no other chrome competing for attention.
- **Drill-down depth is 2-3 levels**, e.g. Your space → Description (hub) → Listing description (field), each level narrowing scope.
- **Bottom Cancel/Save bar** appears on every editable field screen, consistently positioned.
- **Top nav + bottom tab bar** (Today/Calendar/Listings/Messages/Menu) rather than a sidebar — noted by the user as a minor/optional difference, not a priority for this redesign.
