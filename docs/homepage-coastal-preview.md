# Coastal homepage preview — #1185

The preview uses the approved painterly Krabi coast, limestone karsts, warm studio pavilions, Aries upper-left and Scorpius upper-right. It retains all 30 exact hero export dimensions and six layer roles. The original CMS placements remain intact. Development and staging enable the owner-approved preview; a built Worker can opt in with `NUXT_PUBLIC_HOMEPAGE_COASTAL_PREVIEW=true`. Production defaults off. Disabling the flag restores the current CMS sources/layout/share image, verified through local Worker SSR.

The live preview has one semantic H1 with the existing ChatGPT / Claude / MCP rotation, the exact CMS description, and Start free with the existing `/signup` destination. Copy and button share z2 and the existing scroll compensation; later art occlusion is intentional. Covered or not-yet-inspected button pixels disable interaction via inert/pointer safety. Reduced motion removes compensation and retains a readable static accent. The prior below-scene duplicate copy/action is removed in the preview. Subsequent CMS sections retain their order.

Homepage content reuses the header/footer's `max-w-304` and `px-6` containers. Artwork stays full bleed. At375/376px the complete copy stack is 197 px;390 px is 177 px;320 px is 223 px due wrapping. The narrow CTA has a 44 px hit height. The inherited 320 px header flex overflow is fixed with tighter gaps and a smaller wordmark.

## Asset provenance and rollback

[Approved package](https://drive.google.com/file/d/1yJkAZsV56IbtXu7ufJIewjYVR7UuXNOh/view): `krabiclaw-coastal-responsive-v3.zip`, 27,707,374 bytes, modified 2026-10-01T00:03:55Z. ZIP SHA-256 `46f6d7050f954f58dacbf6de286eaef6e73cc8d39343af9213f1124b76d641cd`. Fresh supported Drive materialization, ZIP integrity and all 32 file hashes/dimensions passed. [New manifest](../public/homepage-pilot/asset-manifest.json), [independent measurements](assets/homepage-coastal/asset-verification.json), [original URLs/dimensions/renderer contract](assets/homepage-coastal/original-manifest.json).

The preview bundles hero assets by breakpoint, the 128 px next-row transition, the clean 1200×630 share background and the finished Satori card. Existing original placements are not overwritten. Original delivered PNGs and earlier pilot bytes were preserved in the local inventory/rollback workspace. Flag-off is the immediate rollback.

Foreground full-width opaque pure-black rows: xxs31, xs132, sm164, md100, lg139. The foreground cover crop is unbounded with viewport width; at 5120 px it stops above the source black band. A bottom gradient on the existing foreground plus a 2 px overlap and the black-topped next-row artwork guarantees a black boundary independently of that crop. This keeps six hero planes. The gradient is a visible seam safeguard, not a claim that 139 source rows cover every viewport.

## Verified local behavior

Using Node 24.18.1, the production Worker build and actual Chromium renderer passed 108 states: widths 320,375,376,390,599,600,768,959,960,1208,1263,1264,1366,1903,1904,2543,2544,5120; initial/intermediate/exit scroll; normal/reduced motion. All30 currentSrc values rendered with six planes. Every initial CTA passed trial click, hit testing and Tab focus. Separate Tab/Enter navigation opened signup. Rotation produced ChatGPT, Claude and MCP; reduced motion stayed on ChatGPT. One H1, no repeated intro copy/actions, no horizontal document overflow. Every sampled fully covered seam row was pure black, excluding scrollbar pixels. These are sampled scroll checks, not exhaustive continuous-scroll proof.

[Worker summary](assets/homepage-coastal/worker-qa-summary.json), [behavior](assets/homepage-coastal/worker-behavior.json), [flag-off SSR](assets/homepage-coastal/default-off.json). The full108 screenshots/measurements remain in the task workspace; no private account UI or credentials were included in evidence. Full repository quality, production build/Worker import guard and six focused social-card tests passed.

![Desktop initial preview](assets/homepage-coastal/desktop.png)

![Mobile initial preview](assets/homepage-coastal/mobile.png)

Known art detail: the artist documents six inherited lg low-alpha pixels near scene coordinate (1170,647). A conservative source pixel-center sample finds nine pixels below 16/255 (five fully transparent) around x1168–1174,y646–648; browser interpolation renders a small dark woodland detail. The original pavilion/woods bytes are unchanged, the black background is retained, and this is separate from the seam. [Magnified actual screenshot](assets/homepage-coastal/lg-opening.png). Wider ends of some ranges frame more forest/pavilion, and 5120 px starts sky-heavy because the inherited scene ratio remains unchanged.

## Homepage Satori card

Fresh public SSR already has Home's title, description and canonical. Its public OG image is currently raw legacy chef-crab art because the platform organization has `social_share` and no generated `social_card`. Other pages have generated cards. This is not blank metadata or a proven Satori text-rendering failure.

The platform organization's generation input now reads the authored English Home hero. Static wording includes every accent: “Automate your website using ChatGPT, Claude, MCP”. The exact hero description and current brand mark render over the approved coastal background with the existing navy scrim. Other organizations retain their current card-input behavior. The finished 1200×630 PNG was inspected and its served Worker bytes match SHA-256 `05ee3f8a358ccbd807681170cf035c3bd448172141bc3687debc15756d3eb7df`.

![Finished share card](../public/homepage-pilot/social/home-social-card.png)

The preview's SSR points to the finished bundled card. A later authorized production step must assign approved source artwork to organization `social_share` and regenerate/assign its `social_card`; no production CMS mutation, merge or deployment is included here. After a CMS copy change, regenerate the preview/card rather than retaining stale baked output. Source artwork has no baked typography.

Size/overdraw: all 30 hero PNGs total about 14 MB on disk; a browser selects six at its breakpoint, not all 30. Preserve exact dimensions and alpha for this review. Future measured optimization can convert delivery format/cache appropriately and limit pixel-mask cache to active breakpoint; do not normalize exports or add additional hero planes. Five full-scene transformed boxes still have the inherited overdraw budget.
