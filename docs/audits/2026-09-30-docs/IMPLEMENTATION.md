# Docs implementation — #1178

Implemented on `audit/docs-quality-1178` after merging staging `8d1b435a1`. The original [audit](README.md) is the live-site baseline. After captures use the production-built Cloudflare Worker on `http://localhost:3118`, backed by the canonical local snapshot containing the published docs and seven illustrations. No CMS content, slugs, deployment, or membership changes were made.

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
