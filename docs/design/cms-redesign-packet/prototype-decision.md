# Tenant CMS visual-language decision

## Selected direction

Option A, refined as a visual-outline editor.

On desktop, the Page editor establishes this working model:

1. Global dashboard navigation appears as a top bar. It uses the same primary routes as the mobile bottom bar.
2. The Page Editor route owns the left Nuxt UI sidebar. Each large navigation card previews the content it opens: hero imagery and copy, the actual CTA treatment, image thumbnails, rich text, or compact page metadata.
3. Selecting a sidebar card opens its read view in the main panel. Selecting an individual field opens the focused field editor.
4. Selection carries the strongest contrast. Inactive cards and surrounding navigation remain visually quiet.

On mobile, the global top bar is replaced by the matching bottom navigation. The Page Editor sidebar content becomes the initial full-page outline, followed by the read view and a standardized single-field editor sheet.

The editor sheet contains only the field label, its input, Cancel, and Save. Validation or constraint text belongs there only when it is required to complete the edit.

## Navigation

The prototype uses Home, Calendar, Website, and Inbox as the shared primary route set. Desktop renders those routes in the top bar. Mobile renders the same routes in the bottom bar, followed by Menu. Lower-frequency destinations stay behind Account or Menu.

## Visual rules to carry forward

- Make every outline card visually communicate its content type before its label is read.
- Let card height and composition follow the content rather than a generic row template.
- Keep read views separate from focused field editors.
- Use typography, spacing, dividers, and focus states to communicate field selection and editability.
- Keep app, sidebar, and editor on the same near-white or near-black base surface.
- Avoid gradients and background changes used only to manufacture hierarchy.
- Prefer progressive disclosure over dense control surfaces on narrow viewports.
- Keep the global route model identical across desktop top navigation and mobile bottom navigation.
- Let each CMS route own its contextual sidebar. Do not stack it beside another persistent app sidebar.
- Keep mobile outline and read views separate from editing.
- Reuse one field-sheet pattern for text inputs and text areas.
- Treat chevrons and icons as secondary affordances, not the visual language of the outline.
- Prefer spacing and dividers to nested cards and repeated borders.
- Do not place explanatory copy beside self-explanatory controls.
- Show counts, limits, and metadata only when they affect the current decision.
- Show a route title once per viewport. On mobile, the navbar replaces the body heading after drill-in.
- Do not preselect a card on the mobile outline; selection begins when the user opens a route.
- Make mobile field routes content-first cards, while desktop read views remain flat and divided.
- Preserve navigation history across outline, read view, and field editor states so browser Back follows the same hierarchy as the visible back controls.

## Prototype

Run `yarn prototype:cms-visual`, then open the existing Page editor route with `?variant=A`.

The prototype uses real local tenant data, accepts local-only field edits, and never calls a write endpoint. Options B and C remain directly addressable through the route query as comparison artifacts, but the selected Option A no longer carries an on-screen variant switcher.
