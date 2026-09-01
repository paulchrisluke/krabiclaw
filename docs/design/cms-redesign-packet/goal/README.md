# Goal: Airbnb Hosting Listing Editor

Reference screenshots from Airbnb's own listing editor, used only for the navigation/layout patterns called out in `principles/README.md` — large photo cards, single-field-per-screen editing, drill-down navigation, bottom Cancel/Save bars, large text areas. Mobile viewport (~390–420px wide).

**Captured: 30 screenshots.**

## Privacy note

One screenshot (`details/location/index.jpg`) shows a real host's address and photo. This listing belongs to Airbnb's own demo/reference host account, not a KrabiClaw customer, and is publicly viewable on airbnb.com in the ordinary course of using the product.

## Route → file table

| Screenshot | Route | What's on screen |
|---|---|---|
| `hosting/listings/index.jpg` | `/hosting/listings` | Listings list — large full-width photo cards |
| `.../editor/[listingId]/details/index-your-space-tab.jpg` | `/details` — "Your space" tab | Hub screen: Photo tour, Title, Description, Amenities, Pricing, Availability, Location, etc. as list rows |
| `.../details/index-your-space-tab-description-amenities.jpg` | same, scrolled | Description and Amenities rows |
| `.../details/index-your-space-tab-pricing.jpg` | same, scrolled | Pricing row + guest-facing price preview |
| `.../details/index-your-space-tab-location.jpg` | same, scrolled | Location, Co-hosts rows |
| `.../details/index-your-space-tab-house-rules.jpg` | same, scrolled | House rules, Guest safety rows |
| `.../details/index-your-space-tab-cancellation.jpg` | same, scrolled | Cancellation policy, Custom link rows |
| `.../details/title/index.jpg` | `/details/title` | Single-field screen: listing title, character counter, bottom Cancel/Save |
| `.../details/photo-tour/index.jpg` | `/details/photo-tour` | Photo grid with room-by-room grouping |
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
| `.../details/guest-safety/index.jpg` | `/details/guest-safety` | Safety considerations checklist |
| `.../details/cancellation-policy/index.jpg` | `/details/cancellation-policy` | Policy tier selection (Flexible/Moderate/Firm/Strict) |
| `.../details/custom-link/index.jpg` | `/details/custom-link` | Custom listing URL slug field |
| `.../details/instant-book/index.jpg` | `/details/instant-book` | Instant Book toggle + guest requirements |
| `.../details/accessibility/index.jpg` | `/details/accessibility` | Accessibility features checklist |
| `arrival/index.jpg` | `/arrival` ("Arrival guide" tab) | The tab's own hub screen only — see gap below, its children were opened during navigation but not individually captured |

## Known gaps (identified, not captured — blocked on browser session, see root README)

- **Arrival guide's child editors** — check-in method, house manual, Wi-Fi details, and directions were each opened while navigating this tab (confirmed reachable) but the session expired before their individual screens were captured. Only the hub screen (`arrival/index.jpg`) exists in this packet.
- **Guest safety's own sub-children** — the Guest safety screen lists items (e.g. "Not suitable for children and infants," climbing/security-camera disclosures) that may open their own detail screens on Airbnb; this pass only captured the top-level Guest safety list.
- **Photo-tour per-room editing state** — `photo-tour/index.jpg` captures the room-grouped grid; drilling into an individual room's photo-reorder/caption editor was not captured.
- **Preferences page** — a "Guest requirements/Preferences" screen reachable from the Your space or Listings tab was not captured.
- **Publishing/setup states** — this listing is already live and fully set up; a new/incomplete-listing "finish setup" state was not captured (would require a second, unpublished listing).
