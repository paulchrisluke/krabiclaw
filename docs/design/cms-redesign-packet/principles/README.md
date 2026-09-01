# Principles: Navigation & Layout Patterns Observed

Descriptive comparison only — what each surface actually does today. Not a scoring of good vs. bad; that call is for the redesign discussion, not this packet.

Covers what's captured in `current/README.md` against the Airbnb reference in `goal/README.md` — see both READMEs for exactly what's captured, excluded, and still blocked pending a session re-login.

## 1. Card size and density

| | Current (KrabiClaw) | Goal (Airbnb) |
|---|---|---|
| List entry cards (Sites, Locations) | Large, full-width photo cards | Large, full-width photo cards — matches |
| Settings-style entry cards (Site/Location Settings, Brand, Search & analytics) | Compact text rows, no icons, no photos, tight vertical spacing | Larger icon-led or photo-led cards, generous spacing, one field group each |
| Content entry cards (Menu, Amenities) | Menu: thumbnail + name + category + price, 105 in a row | Amenities: icon + name + one-line description, more breathing room per row |

Correction from an earlier pass of this packet: Settings surfaces were described as "close to the Airbnb reference" — that referred only to the *navigation shape* (see §2 below), not the visual density. Visually, Settings/Brand rows here are noticeably tighter and plainer than anything in the Airbnb reference. Don't read "same shape" as "looks the same."

## 2. Screen scope (fields per screen)

- **Settings-style surfaces** (Site Settings, Location Settings, Brand): one screen = one field group. Each opens from a list row, edits, and returns via Cancel/Save. "Search and analytics" goes a level deeper still — it opens into its *own* sub-list (Google Analytics / Search verification / Search visibility) before reaching an actual field.
- **The page content editor** (`sites/[site]/pages/[pageId]`, e.g. the About Us page): title, short description, and every content block (Hero, Heading, Rich text ×2, Image, …) live on **one continuous scrolling page**. Clicking a Rich text block expands it in place into a large textarea — still the same page, still stacked among every other block. This is the closest current-CMS equivalent to Airbnb's Description/Amenities/Pricing fields, and it's structured the opposite way: one page holding everything, vs. Airbnb's one field per screen.
- **Content surfaces at the location level**: mixed scope per screen.
  - Photos: whole grid on one screen (expected — it's a media library).
  - Menu: whole 105-item list on one screen; per-item edit form exists but renders off-screen below the list on mobile (bug, [#709](https://github.com/paulchrisluke/krabiclaw/issues/709)).
  - Posts: AI composer + full list share one screen.
  - Q&A (both site- and location-level), Testimonials, Links: empty-state/list + full "Add" form share one screen, rather than the add flow getting its own screen.
- **The Blog post editor** (`sites/[site]/blog/new`) keeps its main writing surface large and uncluttered (title + Markdown body, near-zero chrome) by pushing Category/Tags/Excerpt/Publishing into a settings slideover — but the *mechanism* differs from Airbnb, not just the visuals. Airbnb splits each field into its own full screen (hub → single field, back-navigation, one Cancel/Save bar per screen). The Blog editor keeps you on one persistent canvas and brings a slideover to you, with a single top-bar "Publish now" action and no per-field Cancel/Save. Same instinct (don't let secondary fields crowd the main content), different implementation — see §8.
- **Goal — all editable fields**: hub screens split further into single-field screens. Description alone is 5 screens deep (hub → Listing description / Your property / Guest access / Interaction with guests / Other details to note).

## 3. Navigation depth

- Current: 2 levels typical (list → detail), e.g. Sites → Site → Locations list → Location → tab → item. Settings/Brand go 3 levels (list → field screen); "Search and analytics" goes 4 (Settings → Search and analytics → sub-list → field).
- The page editor is 1 level deep but very tall — no further drill-down, everything expands in place instead.
- Goal: 3 levels typical for content fields (Your space tab → field hub → single field), consistently.

## 4. Text areas

- Current — Q&A (site and location level): two stacked plain textareas (Question, Answer) inline on the list screen, no visible character limit.
- Current — page editor Rich text blocks: textarea expands in place within the block list, no character counter, competing visually with sibling blocks above/below.
- Current — Blog post body: full-screen Markdown textarea, closest match to the goal pattern.
- Goal — Description: one full-screen textarea per field, with a live character counter (`482/500 available`), nothing else competing on screen.

## 5. Save/cancel affordance

- Current — Settings-style field screens (Localization, Hours, Profile, Notifications, Search verification, etc.): bottom bar with Cancel (left) / Save (right), consistently.
- Current — page editor: single top-of-page "Save" button, no per-block save/cancel — saving is all-or-nothing for the whole page.
- Current — inline "Add" forms (Q&A, Testimonials): single submit button, no separate Cancel in most cases.
- Goal — every field screen: same bottom Cancel/Save bar pattern, consistently, including inside a full-screen text editor.

## 6. Top-level navigation shape

- Current: sidebar-style top bar + bottom tab bar (Today / Calendar / Sites / Inbox) once inside the dashboard shell.
- Goal: top nav (back arrow + title + contextual action) + bottom tab bar (Today / Calendar / Listings / Messages / Menu).
- Called out by the user as a minor difference, not the redesign's focus.

## 7. Bug found during capture

Clicking a row in the current Menu list (`.../products`) did not visibly open a per-item edit screen in this pass — the row highlighted (focus state) but appeared to stay on the list. Traced to source: `components/products/ProductEditor.vue` renders the edit form as a sibling of the product list inside a grid that's only two-column at the `lg` breakpoint; below that, the form stacks below the full product list (105 rows in this case) with no scroll-into-view. The click handler and edit logic work correctly — the form was just rendering off-screen. Filed as [#709](https://github.com/paulchrisluke/krabiclaw/issues/709) with an exact fix (move the form into a `USlideover`, matching the pattern already used in `BlogPostEditor.vue`).

## 8. Internal reference points for the redesign — two different mechanisms, neither identical to Airbnb

Two patterns already exist side by side in the current codebase, and they solve "keep secondary fields from crowding the main content" in genuinely different ways. Neither is a direct match for Airbnb; both are worth knowing about before picking a direction.

| | Settings/Brand pattern | Blog editor pattern | Airbnb |
|---|---|---|---|
| Where metadata lives | Its own screen, reached by drilling down | A slideover over the current screen | Its own screen, reached by drilling down |
| How you get there | Tap a list row | Tap a settings icon | Tap a card |
| Save model | Cancel/Save bar per field screen | One top-bar "Publish now" for the whole post, no per-field save | Cancel/Save bar per field screen |
| Leaves the main view? | Yes, every time | No — canvas stays open behind the slideover | Yes, every time |

Settings/Brand matches Airbnb's *navigation mechanism* (sequential screens, per-field save) but not its visual density (§1). The Blog editor matches neither Airbnb's mechanism nor its density, but does share the underlying goal of an uncluttered primary content area. Picking a direction for the redesign means choosing (or blending) between these three, not assuming one of the two existing patterns already *is* the Airbnb pattern.

The page content editor (`pages/[pageId]`) and the Menu editor are the two surfaces furthest from all three reference points — worth prioritizing if the redesign is scoped incrementally.
