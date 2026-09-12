# CMS navigation and editing patterns

**Status: Contract**

The vocabulary the dashboard CMS is built from. It exists so a new screen is a
choice between named, already-built patterns rather than a fresh invention, and
so review can say "that is a hub, hubs do X" instead of arguing from taste.

Airbnb's host tools are the reference. The goal is **parity of behaviour**, not
pixel copying, and where Airbnb has no equivalent this document says so rather
than forcing an analogy.

**There are no exceptions to this document.** Products, bookings, posts, Q&A,
photos and every surface added later obey the same rules. A screen that cannot
be built from the patterns here is a gap in this document to be argued and
written down — not a one-off. Every previous "this one is different" is what
produced the inconsistency the redesign exists to remove.

## The two axes

Navigation questions are almost always one of these two, and confusing them is
what produced the CMS's earlier inconsistency.

**Chain** — how deep the content nests. Unbounded, driven by the domain: a hub
may open another hub. `site > location > products > collection > dish` is five
levels and that is fine.

**Presentation** — how one node renders. Exactly two renderings, chosen by
viewport width, never by depth.

A node's place in the chain never changes how it renders, and its rendering
never limits how deep the chain goes.

## Chain vocabulary

| Term | Meaning | Example |
| --- | --- | --- |
| **Root** | The scope switcher. Not editable content. | Organization, site |
| **Hub** | A screen whose job is to route onward. Rows navigate, and each row previews its current value. | Location, Menu, one dish |
| **Leaf** | A screen that edits **one concern** and commits. | A dish's price, a post's body |

A hub may contain another hub. A leaf never contains navigation to a deeper
editor — if you need one, the "leaf" is a hub and should be named as one.

Do not add a level to make a screen feel tidier. Add one when the child is a
thing the owner names, orders, or deletes independently.

## Leaf size

**A leaf edits one concern.** One field, or one small set of controls that
answer a single question. If a screen needs more than about three controls, it
is not a leaf — it is a hub, and its fields belong one level deeper.

This is the rule the CMS kept breaking. It is measured, not felt: count the
controls. Airbnb's own leaves, at 1440px, are

| Screen | The entire detail pane |
| --- | --- |
| Title | one input and a `44/50` counter |
| Listing description | one textarea and a `482/500` counter |
| House rules | four rows, each an ✕/✓ pair — no fields at all |
| Pricing | one value row, one toggle, one link |

**A pane that would need many fields becomes an index instead.** Airbnb's
Description screen is not a form with five textareas; it is five rows —
Listing description, Your property, Guest access, Interaction with guests,
Other details to note — each previewing its current value in two lines, each
opening its own leaf.

So when a form grows, the answer is never a smaller control or a tighter
column. It is another level.

## Canvas

The only surface exempt from leaf size. Long-form article writing, and nothing
else.

**A canvas edits the artifact directly.** The writer types into the rendering
readers will see. There is no field list because there are no fields; the body
is the control.

**The exemption is from leaf size, and from nothing else.** A canvas is a level
of the chain like any other: it renders inside the shell, it computes its own
frame mode, and it re-roots. Full-bleed means the writing column fills its own
pane — never that the canvas replaces the application. A surface that escapes
the frame takes the tenant's rail, navbar and place in the chain with it, which
is what re-rooting exists to prevent.

The canvas carries no Cancel/Save bar, because you cannot cancel an hour of
writing. It leads its level the way a photograph leads a product: the article
first, then the rows that describe it.

**The exception covers the writing and nothing around it.** Category, tags,
excerpt, publishing time, visibility, slug, canonical URL and search appearance
describe the post rather than being it. They are fields, and they obey leaf
size: an index of rows, each previewing its value, each opening its own leaf.

**The test: is the control editing the artifact, or describing it?** Editing it
is a canvas. Describing it is a field, and fields decompose.

## Presentation

| Width | Chrome | Detail |
| --- | --- | --- |
| `< md` (768) | Bottom nav | Full-screen sheet: ✕ top-left, centred title, commit bar pinned at the base |
| `≥ md` | Top nav | — |
| `≥ lg` (1024) | Top nav | Pane beside the index |

`md` swaps navigation chrome. `lg` swaps index/detail topology. One component
owns both renderings of a node; there is no separate mobile screen and no
JavaScript breakpoint.

**The two columns show the deepest two levels, not the first two.** Depth is
unbounded, and opening a child re-roots the frame: the index column becomes the
screen you were just on, and the detail column becomes the child. Airbnb's
listing editor does this — at `details/description` the left column reads
"Listing editor"; open Listing description and the left column *becomes*
"Description" while the right holds the textarea. The back control moves up one
level, never to the root.

A fixed two-level frame is what forces a deep chain to collapse into one long
pane, which is how the CMS grew its large forms.

### How a level knows which column is its own

`useEditorFrame(basePath)` answers it from the level's own base path and the
current route. No level knows anything about its descendants, and no level
counts a depth that is not its own.

| Mode | When | What the level renders |
| --- | --- | --- |
| `index` | nothing below me is open | my content, as my parent's detail column |
| `pair` | one of my children is open | my content as the index column, the child as the detail |
| `yield` | something deeper than my child is open | nothing but the route beneath me |

Two consequences that are easy to get wrong:

- **A level in `yield` renders no rail.** An ancestor that kept drawing its own
  index while a grandchild drew another pair put three columns on screen and
  left the leaf 348px of a 1280px window.
- **A level in `index` draws no panel or navbar.** The outermost level on screen
  owns that chrome; a nested one would draw a second header inside the pane.

Every level in a chain must be a route parent, so it has a `<NuxtPage />` to put
its child into. The sibling `index.vue` beneath it renders nothing — with no
child open, the parent is already showing its own content.

Anything that fires when a level "has no detail" has to check for `index`
specifically. The location hub opens its first section when it has nothing in
its pane, and in `yield` that condition is also true — which threw the tenant
out of whatever they had open, on every page load.

## Creating

Adding a record asks only for what names it, or what the contract will not
accept it without — nothing more. Everything else is a section of the record
once it exists and has an id to hang media, prices and translations on.

It is a level, not a sheet: `Add` navigates to `new` in the record's own slot,
which renders the record's hub with only the sections the contract needs. Its
commit names where it is going — `Start with Title`, then `Next: <section>`
while any remain, and `Create <record>` on the last one — so the tenant reads
what is left rather than a banner listing it. The commit creates the record and
navigates to its real id. `useCreateWalk` is the one implementation of that
walk; an editor supplies its sections, their order and what blocks each.

A create level is the record's own level, so it draws no second panel or
navbar of its own. The draft belongs to the record, not to the leaf: moving
between sections remounts the level, so it lives in `useState` keyed to the
record, never in a plain `reactive`.

## Committing

Cancel on the left, Save on the right, pinned to the base of the detail pane
(the sheet below `lg`). Save is disabled until there is something to save.
Dismissing discards the draft.

## Editing states

**List editor** (`DashboardListEditor`) — a list of records.

- *Browse*: rows are the content, and the row body navigates or opens.
- *Edit*: the same rows in place, grown controls. Nothing navigates, so a
  half-finished edit cannot be stranded behind a back button.
- *Select* (`selectable`): edit mode swaps the per-row remove control for a
  checkbox, and the header carries the count and the actions.

**Grid editor** (`DashboardGridEditor`) — media. Browse, manage, and a
full-bleed takeover for bulk selection.

**Item sheet** (`DashboardListItemDialog`) — one leaf. Sheet on mobile, dialog
above, commit bar at the bottom, destructive action opposite the commit.

It carries a leaf, which means it is subject to the leaf-size rule: a sheet is
not a licence to stack a record's whole field set because it is not a route.
A record with many fields opens a hub of rows; each row's sheet holds one
concern.

A slideover is the same. Being an overlay rather than a route changes where a
level is drawn, never how large it may be. A pane holds an index and swaps to
one leaf at a time.

## Rules that have earned their place

Each of these replaced something that was actually wrong.

**Reorder is a mode, not a write per press.** Rearranging stays local while the
edit state is open and commits one complete order when it closes. The previous
per-press commit plus full reload is what made ordering feel broken. Order
endpoints therefore take the *whole intended order* and reject a partial one —
there is no insert-before arithmetic anywhere.

**Move is a separate action from Reorder.** Move changes which parent a record
belongs to and takes a multi-selection. Reorder changes sequence within one
parent. Overloading one control with both is what forced single-item moves.

Airbnb has Move and no Reorder at all — room order is fixed by room type. Menu
sections must be orderable, so Reorder is a deliberate addition, not parity.

**Membership is a navigable row, not a field.** A Product's collections render
as rows and open the same Move flow used for bulk selection. The free-text box
they replaced silently forked a new grouping on a typo. Membership is plural:
one Product can sit in several collections, so the row states which ones rather
than implying a single parent.

**A control must not be able to build an invalid state.** If the server rejects
a combination, the form should make it unrepresentable rather than allow it and
then refuse to save. A price belongs to a variant, so the editor asks for a
price per variant and never offers a product-level amount the server has
nowhere to put.

**The picture leads.** Rows lead with a thumbnail; a leaf leads with the image
large. When there is no image, show a muted icon in the *same footprint* so a
list does not reflow between rows that have one and rows that do not.

**Unsupported routes 404, and so does a record that is not there.** Capability
gating happens in `middleware/dashboard.global.ts` and throws a Nuxt 404. Never
redirect and never render a fallback.

A missing record and a failed request are not the same event and do not get the
same answer. A record that is not there is not a page, so it 404s. A request
that failed is a state the surface shows, because the record may well still
exist. Rendering "not found" inside the pane for both made a deleted record look
like a broken editor, sitting in a frame with a rail, a navbar and a commit bar
for something that does not exist. `isNotFoundError` in `utils/errors.ts` is the
one place that tells them apart.

**Empty is a state, not a bug.** A collection with no Products, or a location
with no collections, renders its own empty state. Containers that cannot be
empty are a modelling error.

## Naming

Use the tenant's vocabulary, not the schema's. `ProductPresentation` maps the
vertical onto what the owner calls things — a restaurant reads Menu, Section,
Dish where the database says products and collections. Plurals live there too;
appending `s` produces "dishs".
