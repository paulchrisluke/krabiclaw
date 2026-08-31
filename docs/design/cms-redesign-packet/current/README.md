# Current: KrabiClaw Dashboard CMS

All screenshots taken logged in as an admin impersonating tenant `richard.garrad18@gmail.com`, site "Kikuzuki Krabi Thailand" (two locations: Kikuzuki Japanese Robatayaki & Izakaya, Take Me Away by Kikuzuki). Mobile viewport.

## Route index

| Screenshot | Route | What's on screen |
|---|---|---|
| `sites/index.jpg` | `/dashboard/[org]/sites` | Sites list — one large card per site (photo + name) |
| `sites/[siteSlug]/index-my-site-locations-tab.jpg` | `/dashboard/[org]/sites/[site]` — "My site" tab | Site overview: Locations list as large photo cards |
| `sites/[siteSlug]/index-pages-tab.jpg` | same route — "Pages" tab | List of site pages (About, Home, Products, Order online, Experiences, Reservations, Blog) as icon rows |
| `sites/[siteSlug]/settings/index.jpg` | `/dashboard/[org]/sites/[site]/settings` | Site Settings — grouped cards (Domain, Localization, Currency, Notifications, Search & analytics, Facebook publishing) |
| `sites/[siteSlug]/settings/localization/index.jpg` | `/dashboard/[org]/sites/[site]/settings/localization` | Single-purpose drill-down screen: language list, Cancel/Save bar at bottom |
| `.../locations/[locationSlug]/index-my-location-tab.jpg` | `/dashboard/[org]/sites/[site]/locations/[loc]` — "My location" tab | Location overview: photo card + Guest activity / Hours / Discovery cards |
| `.../locations/[locationSlug]/content-tab.jpg` | same route — "Content" tab | Content list: Photos, Menu, Posts, Q&A cards, plus a "Manage" section (Reservations) |
| `.../locations/[locationSlug]/photos/index.jpg` | `/dashboard/[org]/.../locations/[loc]/photos` | Photo grid (3-column), tap-to-tag, upload/attach-existing actions |
| `.../locations/[locationSlug]/products/index.jpg` | `/dashboard/[org]/.../locations/[loc]/products` | Menu list — 105 flat rows (image, name, category, price). Rows did not open a per-item edit screen on this pass (see principles notes) |
| `.../locations/[locationSlug]/posts/index.jpg` | `/dashboard/[org]/.../locations/[loc]/posts` | Posts: AI composer card at top, list of published/scheduled posts below |
| `.../locations/[locationSlug]/qa/index.jpg` | `/dashboard/[org]/.../locations/[loc]/qa` | Q&A: empty state + inline "Add Q&A" form (question + answer textareas) on the same screen |
| _(not included)_ | `/dashboard/[org]/.../locations/[loc]/reservations` | Reservation requests list (guest name, date, party size). Screenshot omitted from this packet — contains real guest PII |
| _(not included)_ | `/dashboard/[org]/.../locations/[loc]/inbox` | Guest message threads list. Screenshot omitted from this packet — contains real guest PII |
| `.../locations/[locationSlug]/settings/index.jpg` | `/dashboard/[org]/.../locations/[loc]/settings` | Location Settings — grouped cards: Profile, Hours, Public content, Discovery, Notifications, Available features |
| `.../locations/[locationSlug]/settings/profile/index.jpg` | `/dashboard/[org]/.../locations/[loc]/settings/profile` | Single-purpose drill-down: all identity/contact fields for the location (name, slug, city, phone, etc.), Cancel/Save bar |
| `.../locations/[locationSlug]/settings/hours/index.jpg` | `/dashboard/[org]/.../locations/[loc]/settings/hours` | Single-purpose drill-down: per-day open/close time fields, Cancel/Save bar |
| `.../locations/[locationSlug]/settings/discovery/index.jpg` | `/dashboard/[org]/.../locations/[loc]/settings/discovery` | Single-purpose drill-down: Google Places connection, rating/review count, Place ID, Maps URL |
| `.../locations/[locationSlug]/settings/notifications/index.jpg` | `/dashboard/[org]/.../locations/[loc]/settings/notifications` | Single-purpose drill-down: WhatsApp notification phone, timezone |

## Notes on what these show

- The **Settings** surfaces (Site Settings, Location Settings) already follow a card-list → single-field-drilldown → bottom Cancel/Save pattern, close to the Airbnb reference.
- The **Content** surfaces (Photos, Menu, Posts, Q&A) are mixed: Photos and Posts use a grid/list with a lightweight top action bar; Menu is a long flat list (105 rows) with no per-item drill-down reached in this pass; Q&A puts its add-form inline on the same screen as the list rather than a separate screen.
- Card-based navigation (Sites list, Locations list, Settings lists) is already present in several places — the redesign question is less "introduce cards" and more "make Content surfaces (especially Menu) match the drill-down depth Settings already has."
