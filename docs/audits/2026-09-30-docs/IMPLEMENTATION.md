# Docs implementation — #1178

Implemented on `audit/docs-quality-1178` after merging staging `7f05fd6c5` (including its independent lightbox keyboard fix). The original [audit](README.md) is the live-site baseline. After captures use the production-built Cloudflare Worker on `http://localhost:3118`, backed by the canonical local snapshot containing the published docs and seven illustrations. No CMS content, slugs, deployment, or membership changes were made.

## Changes

- Reused the shared article components for compact docs task rows and two-column desktop category groups. Removed repeated category chips/dates and title/description clamping for docs; blog presentation is retained.
- Added persistent mobile docs search and a keyboard-accessible collapsible contents list using the existing heading/anchor owner. Previous/next tasks wrap and stack. Scrolling no longer overwrites the address fragment. Docs titles scale for narrow screens and tutorial images retain their natural aspect ratio.
- Restricted generic copy enhancement to Markdown `pre > code`, leaving AI prompts with their existing single action. Both copy owners expose success/failure text and accessible announcements; code controls reserve space and have a 44px minimum height. Explicitly included the composable in Tailwind scanning: its omitted source was the misplaced control styling cause. Renderer now preserves CMS collapse settings.
- Consolidated ItemLists into the existing page graph. CollectionPage.mainEntity references the canonical list, whose real entries have positions, WebPage identities and URLs, and an accurate count. Tenant article collections use their tenant publisher identity. Empty breadcrumbs are omitted. HowTo steps accept visible name-only steps and use their actual visible text; no synthetic FAQs, ratings, or steps were added.

## Before / after

| Surface | Before, live public site | After, local production Worker |
| --- | --- | --- |
| Index desktop | [Before](evidence/krabiclaw-index-desktop.jpg) | [After](after/index-desktop.jpg) |
| Index mobile | [Before](evidence/krabiclaw-index-mobile.jpg) | [After](after/index-mobile.jpg) |
| Category desktop | [Before](evidence/category-getting-started-desktop.jpg) | [After](after/category-desktop.jpg) |
| Category mobile | [Before](evidence/category-getting-started-mobile.jpg) | [After](after/category-mobile.jpg) |
| Article desktop | [Before](evidence/make-your-first-site-edit-desktop.jpg) | [After](after/article-desktop.jpg) |
| Article mobile | [Before](evidence/make-your-first-site-edit-mobile.jpg) | [After](after/article-mobile.jpg), [contents expanded](after/article-mobile-contents.jpg) |
| Prompt desktop | [Before](evidence/copy-control-desktop.jpg) | [After](after/copy-desktop.jpg) |
| Prompt mobile | [Before](evidence/copy-control-mobile-before.jpg) | [After](after/copy-mobile.jpg) |

Viewports are 1440×900 and 390×844; browser screenshot exports trim scrollbar edges. Baseline article captures precede the owner's independent CMS illustration refresh, so the changed wording/images are not application changes from this PR. [Illustration readback](after/illustration-checks.json) confirms all seven images load across the six published articles; each has nonzero natural dimensions and no desktop horizontal overflow.

## Verification

- Production `yarn build`, including generated Worker checks: passed.
- `yarn quality` (typecheck, lint, SFC, data-loading, notification/email parity and platform locales): passed.
- Unit tests: 222 passed. D1 integration tests: 70 passed. Migration tests: two passed.
- Targeted Chromium suite `platform-blog-ssr.spec.ts`: four passed. This includes actual SSR JSON-LD on all 26 docs routes (index, five categories, 20 articles), connected canonical identities, unique identifiers, accurate visible lists, breadcrumbs, article dates/publisher, and visible HowTo text. Mobile testing covers keyboard contents disclosure, full task names, no horizontal overflow, and repeated real-browser clipboard copies of the full prompt with exactly one copy control.
- Migration lint, committed schema drift, MCP submission check, and discovery/unauthenticated MCP checks: passed. Authenticated MCP checks skipped because no bearer token was provided; no credentials were requested.
- Manual Chrome inspection of index/category/article at desktop and mobile, expanded contents and copied feedback: passed.

These are rendered JSON/semantic assertions, not a promise of search ranking or a Google rich-result validation. The owner's browser permissions were not modified; clipboard denial and a standalone Markdown code block were not manually exercised. Search Console remains owner-managed. No merge or deployment was performed.


## Revision 2 — owner visual feedback

The first implementation retained too much blog-card styling. The revised platform docs surface now uses a white reading canvas, system typography, compact expanded category navigation, a single primary start link, and plain task links in three desktop columns. It retains KrabiClaw's coral identity. There are no bordered index/category cards. Article prose uses a quieter 16px reading scale, a bounded reading column, and compact text-only author metadata. Tenant docs inherit their theme colors while sharing the plain task layout and navigation; platform blog keeps its existing article cards and dark identity.

Platform docs/blog now have a collection header with a desktop search field rather than the marketing pill. Mobile presents the wordmark, an accessible 44px search action and menu, with no conversion CTA crowding the reading header and no duplicate search bar in article content. Existing menu search remains an alternate entry to the same dialog. Escape now closes the dialog from any focused control, rather than only its input.

[Previous desktop](after/index-desktop.jpg) → [revised desktop](revision-2/docs-index-desktop.png). [Previous mobile](after/index-mobile.jpg) → [revised mobile](revision-2/docs-index-mobile.png). [Article desktop](revision-2/docs-article-desktop.png), [article mobile](revision-2/docs-article-mobile.png), [category mobile](revision-2/docs-category-mobile.png), [mobile search](revision-2/docs-search-mobile.png).

Rebuilt production Worker, repeated quality checks and five Chromium tests passed for this revision. The new runtime check verifies one visible mobile header search action, no content search bar, keyboard opening/Escape closing, 19 non-featured task links, and no mobile horizontal overflow. Existing canonical-schema, mobile contents and real prompt clipboard checks continue to pass. No schema/CMS writes or deployment were made.

### Proposed search follow-up across themes

Use one collection-aware header contract for platform, Saya and Blawby blogs/docs: desktop search field, mobile 44px magnifier beside the menu, existing menu search as a secondary entry, and one shared dialog/state. Keep tenant searches scoped to their own organization and active collection; platform docs search can offer Docs/Blog/Help groups. Use short trigger labels (Search docs/Search blog) and explain the broader scope inside the dialog. Apply each theme's typography/colors to the dialog and results. Preserve keyboard shortcuts, autofocus, focus return, Escape and arrow-key navigation. Verify keyboard/mobile behavior, empty/error/results states and tenant isolation for each theme before rollout. This is a plan; tenant header/search changes have not been implemented in this revision.
