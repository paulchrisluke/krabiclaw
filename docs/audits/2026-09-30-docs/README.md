# Docs layout, copy controls, and search audit — #1178

Audited 2026-09-30 against live public pages in the owner's Chrome browser. Source inspected at staging `979591131`; this baseline records evidence and remediation specifications. The subsequent application changes and before/after evidence are in [IMPLEMENTATION.md](IMPLEMENTATION.md). Existing `/docs/*` slugs, the canonical docs collection, and shared article renderer remain the implementation boundary. Tenant-host routing work in #1175 stays separate.

## Reproduction and evidence

Desktop viewport: **1440 × 900**. Mobile viewport: **390 × 844** (375px usable document width with scrollbar). Screenshots are viewport captures (the browser export may trim scrollbar edges; actual pixel sizes are in `screenshot-manifest.json`); filenames ending `-mobile` use mobile dimensions. Public content changed during this audit: initial representative article captures precede the separately published illustrations. `illustrations-*` and `published-illustrations*.json` are the later read-only verification. Account/avatar regions and the personalized Stripe card are masked. No CMS, settings, onboarding, invitation, or publication actions were performed.

All URLs below use `https://krabiclaw.com`. Every category has `category-{slug}-{desktop,mobile}.jpg` captures and live viewport measurements in `category-viewports.json`. The full 20-article and five-category inventories, headings, text lengths, links, viewport metrics and response headers are in [evidence](evidence/). Unsigned HTTP GETs complement browser observations; they verify server-rendered public content without executing JavaScript.

| Surface | Exact path | Evidence |
| --- | --- | --- |
| Landing | `/docs/` | `krabiclaw-index-desktop.jpg`, `krabiclaw-index-mobile.jpg`, `krabiclaw-mobile-menu.jpg` |
| Getting Started (4 articles) | `/docs/category/getting-started` | `category-inventory.json` |
| Build & Edit (4) | `/docs/category/build-and-edit` | `category-inventory.json` |
| Run Your Business (7) | `/docs/category/run-your-business` | `krabiclaw-category-desktop.jpg`, `krabiclaw-category-mobile.jpg` |
| AI Assistants (3) | `/docs/category/ai-assistants` | `category-inventory.json` |
| Account & Settings (2) | `/docs/category/integrations` | `category-inventory.json` |
| Long onboarding article | `/docs/deploy-your-site` | `deploy-your-site-desktop.jpg`, `deploy-your-site-mobile.jpg` |
| AI prompt and callout | `/docs/make-your-first-site-edit` | `make-your-first-site-edit-{desktop,mobile}.jpg`, `copy-control-*` |
| Publishing article | `/docs/publish-a-post` | `publish-a-post-{desktop,mobile}.jpg` |
| Long integration/setup article | `/docs/mcp-setup` | `mcp-setup-{desktop,mobile}.jpg` |
| Account/roles article | `/docs/invite-your-team` | `invite-your-team-{desktop,mobile}.jpg` |

Representative article metrics are in `article-inventory-desktop.json` and `article-inventory-mobile.json`. Each sampled article has one H1 and no document-level horizontal overflow. Headings and body text remain readable; breadcrumbs expose collection/category, the sidebar expands the current category, and desktop articles provide a sticky section list. Clicking “Check the public result” on the long onboarding article reached its matching fragment with the heading at y≈119px, below the sticky header. Mobile articles omit the section list. The callout on the first-edit article renders correctly. No real fenced-code block was exercised independently of an AI prompt, so a normal code-block regression check remains required in implementation.

## Verified findings and proposed changes

### F1 — High: two copy owners enhance one AI prompt

**URL:** `/docs/make-your-first-site-edit`. Open at either viewport and scroll to the AI assistance prompt. The card has its intended **Copy prompt** action, plus an injected **Copy code** icon inside the prompt. On mobile the icon sits near the last text line, rather than in the top-right corner. Its measured hit area is 31.67 × 31.67px; the prompt has only 12.72px padding. See [desktop](evidence/copy-control-desktop.jpg), [mobile](evidence/copy-control-mobile-before.jpg), and copied state in `copy-control-mobile-copied.jpg`.

`composables/useCopyableCodeBlocks.ts:15` enhances every `pre`, including the AI component's raw-text `pre`. `components/content/ContentAiAssistanceSection.vue:30` already owns the prompt's action. This confirms the duplicate-owner cause. The injected button declares `top-2 right-2`, but live computed offsets are about top318px/right172px on mobile and top114px/right457px on desktop. The exact CSS-cascade/build reason for those offsets remains a hypothesis, not a proven root cause.

**Behavior:** injected mouse/repeated copy and keyboard activation copy the complete prompt accurately after the async clipboard operation finishes. Native keyboard focus is visible. An immediate first clipboard read preceded completion; the later read matches exactly (`copy-behavior.json`). The intended Copy prompt button independently copies the same full prompt accurately. Successful injected feedback is an icon change; its accessible name remains “Copy code”, without an announced success message. Clipboard-denial behavior was not forced in the owner's browser. Source confirms silent failure in the enhancer and no catch in `copyPrompt` (`ContentAiAssistanceSection.vue:93`).

**Quick fix specification:** give each block one owner. Restrict generic enhancement to actual Markdown `pre > code` blocks, or explicitly exclude structured AI assistance blocks. Keep the prompt component's named action. Use a stable header/action region, reserve text space, and provide ≥44px practical hit area, visible keyboard focus, Copy/Copied/error text and an accessible status announcement. Copy the full source text even when visually collapsed. Verify denied/unavailable clipboard in an isolated test environment; do not request browser permission changes in production.

### F2 — Medium: index and categories retain blog-card density

**URLs:** `/docs/`, `/docs/category/run-your-business`; the shared index pattern applies across the five categories. A publication date and repeated category chip precede every title/excerpt. At 1440px the landing main region is ~3394px tall; later category headings are several screens below the first group. At 390px only the first guide is fully visible below the featured Start here block in the initial viewport. Long titles/excerpts clamp, hiding useful task distinctions. Dates shown on index cards are July publication dates while refreshed articles correctly say Updated Sep 30.

**Specification:** preserve one featured start task, then use compact grouped task links with full titles and short optional descriptions. Remove per-card category duplication inside an already named category; omit publication dates or consistently show updated dates. Target 2–3 task links visible beneath the start block on mobile, and five clearly scannable category entry points on desktop. Reuse `components/blog/ArticleIndex.vue` with collection-aware presentation; do not add a competing docs data stack. Keep full text available to assistive technology and at narrow widths.

### F3 — Medium: mobile wayfinding loses section access and task names

**URLs:** long `/docs/deploy-your-site`, `/docs/mcp-setup`, plus article progression. Desktop TOC works, but `components/blog/ArticlePage.vue:45` hides it below `xl`; no mobile section picker replaces it. Search exists inside the hamburger menu, together with marketing navigation, rather than as a persistent docs action. Previous/next task names truncate (`ArticlePage.vue:31,38`). See `article-progression-mobile.jpg` and `krabiclaw-mobile-menu.jpg`.

**Specification:** provide a compact “On this page” disclosure below the mobile title/breadcrumbs; keep search one obvious action away; let previous/next titles wrap or stack vertically. Preserve the current reading order and heading-anchor implementation. Check keyboard opening, closing, selected section, sticky-header offsets and screen-reader names. Existing desktop article width/spacing is serviceable; do not widen prose merely to fill unused space.

### F4 — Low: generic docs landing metadata

`/docs` has title “Docs | Krabiclaw” and description “Documentation from Krabiclaw.” Article titles and descriptions are specific and present in SSR. Improve the landing description to name the supported tasks and audience through the existing metadata owner. This is a snippet-quality recommendation, not evidence of an indexing failure.

## Current official references and design guidance

Compared the live [Stripe docs home](https://docs.stripe.com/) and [startup guide](https://docs.stripe.com/get-started/use-cases/startup), plus [Vercel docs home](https://vercel.com/docs) and [getting-started guide](https://vercel.com/docs/getting-started-with-vercel), at both viewports. Evidence is `stripe-*` and `vercel-*`.

| Dimension | Reference observation | Krabiclaw direction |
| --- | --- | --- |
| Landing hierarchy/density | Stripe groups short task links under product headings. Vercel highlights task entry points and separates code examples from navigation. | Compact task groups; retain one start action. |
| Typography/spacing/width | Clear title/body/secondary hierarchy; constrained article reading areas with navigation outside prose. | Keep current readable article width; reduce index-card padding and metadata noise. |
| Navigation/search/breadcrumbs | Prominent search and dedicated docs navigation; article hierarchy remains recognizable. | Maintain category breadcrumbs/sidebar; improve mobile search visibility and section access. |
| Copy controls | Vercel's visible example action sits in its block header/corner, with space reserved around the content. | One stable, named action per prompt/code block; no duplicate inline icon. |
| Progression/TOC | Guides expose task/section structure independently of long body content. | Full previous/next task names and mobile section picker. |

These are observed design references, not a requirement to copy their product breadth, font choices or full navigation systems. Screenshots of reference pages contain masked personalized regions.

## Search and crawlability

[SEO evidence](evidence/seo-evidence.json) records capture time, exact request URLs, redirects, selected headers, canonicals, metadata, headings, SSR text and schema types.

- All 26 canonical docs URLs (index + five categories + 20 articles) return **200**. All 20 article links occur in both the landing HTML and sitemap; no missing or orphaned article was found in that comparison.
- `robots.txt` does not disallow `/docs`. Meta robots and X-Robots-Tag permit index/follow. The sitemap lists docs URLs with current last-modified values. This rules out the specific observed state of a blanket noindex or missing sitemap, not all possible Google indexing problems.
- Meaningful article text and headings are server rendered: sampled article lengths range from ~1306 to ~6097 characters. The landing has one H1, category hierarchy, links and descriptions without JavaScript. Site navigation and footer link to docs; the collection/category/sidebar and article progression provide additional internal links.
- Index/categories expose CollectionPage, ItemList and BreadcrumbList; articles expose TechArticle, WebPage and BreadcrumbList. MCP setup additionally exposes HowTo. Presence is verified; full rich-result eligibility and Google's interpretation were not validated.
- HTTP and `www` requests redirect once to HTTPS apex. Slash variants return 200 with the matching slashless canonical. `https://krabiclaw.krabiclaw.com/docs` also returns 200 with apex canonical. A redirect would consolidate serving URLs more strongly, but canonical tags already nominate apex. Confirm intended host behavior in #1175 before any routing change. [Google's canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) distinguishes signals from Google's eventual selection; [robots guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro) explains why crawl allowance alone is not index proof.

### Search observation and access limit

One query, `https://www.google.com/search?q=krabiclaw+docs&hl=en`, on 2026-09-30 in Chrome at 390×844, showed a Sign in link and Vietnam search context. GitHub was the first organic result; a tenant-domain “Create your KrabiClaw account” result appeared next. The platform docs were not among the visible first-page organic results. The AI overview linked account setup. See `google-query-mobile.jpg` and the location-redacted `google-query.txt`. This is session-specific evidence, not a global rank measurement or proof that styling causes ranking.

Search Console opened its public introduction with Start now/sign-in; no authorized property/report was available. No credentials, reconnects or property verification were attempted. **Owner evidence needed:** for the apex property, export Pages indexing reasons and sitemap processing status; inspect `/docs`, `/docs/deploy-your-site`, and `/docs/mcp-setup` for last crawl, fetch/render status, user-declared vs Google-selected canonical; export Performance for query “krabiclaw docs” with country/device/date filters. Compare the tenant result's selected canonical only within the separate #1175 investigation. Until then, canonical selection, crawl freshness, impressions and exclusion reasons remain unverified.

## Published illustration verification (separate content work)

All seven native images now load on these public pages: notifications (2), invite (1), brand (1), media (1), first edit (1), first-site onboarding (1). Desktop natural dimensions are nonzero, images are complete, and each fits the ~724px article width. At 390px they fit ~341px with document width375; no horizontal page overflow. Captions and descriptive alt text render. No stale image cache was observed. The onboarding illustration occupies a substantial vertical area, but remains proportional and readable; wide multistep illustrations shrink on phones and should be inspected at full size when used for detailed instructions. Exact asset URLs, dimensions and checks are in `published-illustrations.json` and `published-illustrations-mobile.json`; screenshots are `illustrations-*`. No content changes or duplicate images were inserted by this audit.

## Prioritized follow-up acceptance checklist

### Quick control fixes (F1)

- [ ] Exactly one action per AI prompt and per genuine code block at 390, 768 and 1440px; no action overlaps text or drifts after route changes.
- [ ] Mouse, Tab/Enter and repeated clicks copy the complete correct source; collapsed text does not truncate copying.
- [ ] Copy/Copied/failure status is visible and announced; focus remains visible; denial/unavailable clipboard is verified in an isolated environment.
- [ ] Existing Markdown code block enhancement remains functional; inline code is not enhanced.

### Docs presentation (F2/F3)

- [ ] Reuse canonical collection/renderer and preserve all slugs/CMS blocks; no content migration or parallel documentation stack.
- [ ] Five categories remain discoverable; compact task links retain full task names at phone width.
- [ ] Mobile search, section disclosure and full previous/next labels work by keyboard; fragment targets clear sticky headers.
- [ ] Long headings, fenced code, AI prompts, callouts and all seven current illustrations fit without page overflow; check 390/768/1440px and long/short content.
- [ ] Validate shared blog/template surfaces before merging collection-aware changes.

### SEO follow-up (F4 and unverified hypotheses)

- [ ] Improve landing metadata through its existing owner; keep SSR H1/body/links, schema and canonical URLs.
- [ ] Owner provides Search Console evidence listed above before attributing ranking to canonical selection or requesting reindexing.
- [ ] Any host-normalization change is coordinated with #1175 and tested against tenant intent, HTTPS/slash variants and sitemap targets.
- [ ] Recheck sitemap/link parity, index/follow headers, rendering and canonicals after relevant implementation changes.

## Validation limits

This is a documentation/evidence-only PR. Runtime application files and published content are unchanged; no dependency install, local application tests, deployment, ranking guarantee, Search Console write or settings mutation is appropriate here. Verification consists of real-browser screenshots/DOM measurements, clipboard interaction, link/fragment observation, unsigned SSR/headers/sitemap inventory, source corroboration and repository diff/evidence checks. Clipboard error, independent fenced-code rendering, formal accessibility/contrast measurement, field Core Web Vitals and Search Console property data remain implementation/owner follow-ups rather than claimed passes.
