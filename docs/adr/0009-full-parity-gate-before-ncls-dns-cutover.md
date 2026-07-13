# Require Full Parity Before NCLS DNS Cutover

NCLS is both a real tenant migration and the proving case for KrabiClaw's professional-service platform support, so DNS cutover must wait for more than visual homepage parity. KrabiClaw will require a passing verification report covering routes, redirects, SEO/schema, media/files, consultation CTA and tracking, pricing/calculator behavior, articles, legal/compliance content, and post-import editability before `northcarolinalegalservices.org` moves to KrabiClaw.

Visual acceptance is automated across the global shell and every migrated public route, not only the homepage. Deterministic section-level comparisons use the pinned React baseline and allow at most 0.5% differing pixels with a small color threshold for antialiasing; route, SEO, behavior, media, and editability checks remain independent automated gates.

## Considered Options

- Full parity gate: slower, but matches the migration and platform-validation goals.
- Launch-critical routes only: faster, but risks SEO, ads, legal content, and editability regressions.
- Soft launch only: useful staging tactic, but not sufficient as the production DNS gate.

## Update: automated visual gate removed (2026-07-13)

The automated section-level screenshot pixel-diff (`capture-blawby-screenshots.mjs` / `compare-blawby-screenshots.mjs` in `e2e-smoke`) has been removed from CI. It pinned against a live external site (`northcarolinalegalservices.org`) via ETag, which drifted independently of any KrabiClaw change and repeatedly blocked unrelated PRs on re-review of an unmoving target rather than a real regression.

Visual acceptance for this migration is now a manual step: Paul Chris Luke visually reviewed the deployed preview and approved it. Route, SEO, behavior, media, and editability checks (`client:verify:blawby`, `client:verify:ncls-seo`) remain automated gates in CI.
