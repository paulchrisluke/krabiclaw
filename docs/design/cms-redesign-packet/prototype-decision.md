# Tenant CMS visual-language decision

## Selected direction

Option A, refined as a visual-outline editor.

On desktop, the Page editor establishes this working model:

1. The left column is the page outline. Each card previews the content it represents: hero imagery and copy, the actual CTA treatment, image thumbnails, rich text, or compact page metadata.
2. The selected card opens into a flat editing surface on the right. Controls live directly on the page surface instead of inside another card or dashboard panel.
3. Selection carries the strongest contrast. Inactive cards and surrounding navigation remain visually quiet.

On mobile, the same model becomes progressive disclosure: page outline, complete read view, then a standardized single-field editor sheet.

The editor sheet contains only the field label, its input, Cancel, and Save. Validation or constraint text belongs there only when it is required to complete the edit.

## Navigation

The prototype reduces site-level navigation to Home, Website, Inbox, and Account. Lower-frequency destinations are grouped under More on desktop and reached through overview pages on mobile.

## Visual rules to carry forward

- Make every outline card visually communicate its content type before its label is read.
- Let card height and composition follow the content rather than a generic row template.
- Keep the detailed editor flat; use typography, spacing, dividers, and focus states to communicate editability.
- Keep app, sidebar, and editor on the same near-white or near-black base surface.
- Avoid gradients and background changes used only to manufacture hierarchy.
- Prefer progressive disclosure over dense control surfaces on narrow viewports.
- Keep mobile overview and read views separate from editing.
- Reuse one field-sheet pattern for text inputs and text areas.
- Treat chevrons and icons as secondary affordances, not the visual language of the outline.
- Prefer spacing and dividers to nested cards and repeated borders.
- Do not place explanatory copy beside self-explanatory controls.
- Show counts, limits, and metadata only when they affect the current decision.

## Prototype

Run `yarn prototype:cms-visual`, then open the existing Page editor route with `?variant=A`.

The prototype uses real local tenant data, accepts local-only field edits, and never calls a write endpoint. Options B and C remain in the throwaway branch only as comparison artifacts; they are not implementation targets.
