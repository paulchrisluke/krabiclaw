# CMS navigation and editing patterns

**Status: Contract**

The vocabulary the dashboard CMS is built from. It exists so a new screen is a
choice between named, already-built patterns rather than a fresh invention, and
so review can say "that is a hub, hubs do X" instead of arguing from taste.

Airbnb's host tools are the reference, captured in
[cms-redesign-packet](cms-redesign-packet/). The goal is **parity of behaviour**,
not pixel copying, and where Airbnb has no equivalent this document says so
rather than forcing an analogy.

## The two axes

Navigation questions are almost always one of these two, and confusing them is
what produced the CMS's earlier inconsistency.

**Chain** — how deep the content nests. Unbounded, driven by the domain: a hub
may open another hub. `site > location > products > category > dish` is five
levels and that is fine.

**Presentation** — how one node renders. Exactly two renderings, chosen by
viewport width, never by depth.

A node's place in the chain never changes how it renders, and its rendering
never limits how deep the chain goes.

## Chain vocabulary

| Term | Meaning | Example |
| --- | --- | --- |
| **Root** | The scope switcher. Not editable content. | Organization, site |
| **Hub** | A screen whose job is to route onward. Rows navigate. | Location, Menu |
| **Leaf** | A screen that edits one record and commits. | One dish |

A hub may contain another hub. A leaf never contains navigation to a deeper
editor — if you need one, the "leaf" is a hub and should be named as one.

Do not add a level to make a screen feel tidier. Add one when the child is a
thing the owner names, orders, or deletes independently.

## Presentation

| Width | Chrome | Detail |
| --- | --- | --- |
| `< md` (768) | Bottom nav | Sheet over the list |
| `≥ md` | Top nav | — |
| `≥ lg` (1024) | Top nav | Pane beside the list |

`md` swaps navigation chrome. `lg` swaps index/detail topology. One component
owns both renderings of a node; there is no separate mobile screen and no
JavaScript breakpoint.

## Editing states

**List editor** (`DashboardListEditor`) — a list of records.

- *Browse*: rows are the content, and the row body navigates or opens.
- *Edit*: the same rows in place, grown controls. Nothing navigates, so a
  half-finished edit cannot be stranded behind a back button.
- *Select* (`selectable`): edit mode swaps the per-row remove control for a
  checkbox, and the header carries the count and the actions.

**Grid editor** (`DashboardGridEditor`) — media. Browse, manage, and a
full-bleed takeover for bulk selection.

**Item sheet** (`DashboardListItemDialog`) — the leaf. Sheet on mobile, dialog
above, commit bar at the bottom, destructive action opposite the commit.

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

**Membership is a navigable row, not a field.** A record's parent renders as
`Category ›` and opens the same Move flow used for bulk selection. The free-text
box it replaced silently forked a new category on a typo.

**A control must not be able to build an invalid state.** If the server rejects
a combination, the form should make it unrepresentable rather than allow it and
then refuse to save. Price is one three-way choice — amount, wording, or
nothing — because those are the only three states the server accepts.

**The picture leads.** Rows lead with a thumbnail; a leaf leads with the image
large. When there is no image, show a muted icon in the *same footprint* so a
list does not reflow between rows that have one and rows that do not.

**Unsupported routes 404.** Capability gating happens in
`middleware/dashboard.global.ts` and throws a Nuxt 404. Never redirect and never
render a fallback.

**Empty is a state, not a bug.** A category with no items, or a location with no
categories, renders its own empty state. Containers that cannot be empty (the
old model could not express an empty category) are a modelling error.

## Naming

Use the tenant's vocabulary, not the schema's. `ProductPresentation` maps the
vertical onto what the owner calls things — a restaurant reads Menu, Section,
Dish where the database says products and categories. Plurals live there too;
appending `s` produces "dishs".
