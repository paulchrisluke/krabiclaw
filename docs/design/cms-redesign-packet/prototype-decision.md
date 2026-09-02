# Tenant CMS visual-language decision

## Selected direction

Option A, refined as a progressive-detail interface.

The Page editor prototype establishes this hierarchy:

1. The page overview shows a compact list of page details and sections.
2. Opening an item shows its complete read view.
3. Opening an editable field presents a standardized single-field editor sheet.

The editor sheet contains only the field label, its input, Cancel, and Save. Validation or constraint text belongs there only when it is required to complete the edit.

## Navigation

The prototype reduces site-level navigation to Home, Website, Inbox, and Account. Lower-frequency destinations are grouped under More on desktop and reached through overview pages on mobile.

## Visual rules to carry forward

- Prefer progressive disclosure over dense control surfaces.
- Keep overview and read views separate from editing.
- Reuse one field-sheet pattern for text inputs and text areas.
- Reserve icons for navigation and meaning, not decoration.
- Prefer spacing and dividers to nested cards and repeated borders.
- Do not place explanatory copy beside self-explanatory controls.
- Show counts, limits, and metadata only when they affect the current decision.

## Prototype

Run `yarn prototype:cms-visual`, then open the existing Page editor route with `?variant=A`.

The prototype uses real local tenant data, accepts local-only field edits, and never calls a write endpoint. Options B and C remain in the throwaway branch only as comparison artifacts; they are not implementation targets.
