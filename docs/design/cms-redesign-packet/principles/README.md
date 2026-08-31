# Principles: Navigation & Layout Patterns Observed

Descriptive comparison only — what each surface actually does today. Not a scoring of good vs. bad; that call is for the redesign discussion, not this packet.

## 1. Card size and density

| | Current (KrabiClaw) | Goal (Airbnb) |
|---|---|---|
| List entry cards (Sites, Locations) | Large, full-width photo cards — already matches | Large, full-width photo cards |
| Settings entry cards | Compact list rows, one field summary per row | Same — compact rows, one field summary per row |
| Content entry cards (Menu) | Compact rows: thumbnail + name + category + price, 105 in a row | N/A directly comparable — Airbnb's nearest analog (Amenities) uses icon + name + one-line description per row |

## 2. Screen scope (fields per screen)

- **Current — Settings surfaces** (Site Settings, Location Settings): one screen = one field group (Localization, Hours, Discovery, Notifications, Profile). Each opens from a list row, edits, and returns via Cancel/Save.
- **Current — Content surfaces**: mixed scope per screen.
  - Photos: whole grid on one screen (expected — it's a media library).
  - Menu: whole 105-item list on one screen; per-item editing wasn't reached via a click in this pass (see below).
  - Posts: AI composer + full list share one screen.
  - Q&A: empty-state + full "Add Q&A" form (question textarea + answer textarea) share one screen.
- **Goal — all editable fields**: hub screens split further into single-field screens. Description alone is 5 screens deep (hub → Listing description / Your property / Guest access / Interaction with guests / Other details to note).

## 3. Navigation depth

- Current: 2 levels typical (list → detail), e.g. Sites → Site → Locations list → Location → tab → item. Settings goes 3 levels (Settings list → field screen).
- Goal: 3 levels typical for content fields (Your space tab → field hub → single field), consistently.

## 4. Text areas

- Current — Q&A: two stacked plain textareas (Question, Answer) inline on the list screen, no visible character limit shown.
- Goal — Description: one full-screen textarea per field, with a live character counter (`482/500 available`), nothing else competing on screen.

## 5. Save/cancel affordance

- Current — Settings field screens (Localization, Hours, Profile, Notifications): bottom bar with Cancel (left) / Save (right), consistently.
- Current — Q&A form: single "Add question" button, no separate Cancel.
- Goal — every field screen: same bottom Cancel/Save bar pattern, consistently, including inside a full-screen text editor.

## 6. Top-level navigation shape

- Current: sidebar-style top bar + bottom tab bar (Today / Calendar / Sites / Inbox) once inside the dashboard shell.
- Goal: top nav (back arrow + title + contextual action) + bottom tab bar (Today / Calendar / Listings / Messages / Menu).
- Called out by the user as a minor difference, not the redesign's focus.

## 7. Bug found during capture

Clicking a row in the current Menu list (`.../products`) did not visibly open a per-item edit screen in this pass — the row highlighted (focus state) but appeared to stay on the list. Traced to source: `components/products/ProductEditor.vue` renders the edit form as a sibling of the product list inside a grid that's only two-column at the `lg` breakpoint; below that, the form stacks below the full product list (105 rows in this case) with no scroll-into-view. The click handler and edit logic work correctly — the form was just rendering off-screen. Filed as [#709](https://github.com/paulchrisluke/krabiclaw/issues/709) with an exact fix (move the form into a `USlideover`, matching the pattern already used in `BlogPostEditor.vue`).
