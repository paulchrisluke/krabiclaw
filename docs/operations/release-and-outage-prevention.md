# Release and Outage Prevention

This is a mandatory operating contract for every LLM or human conversation that
changes, reviews, deploys, or releases KrabiClaw. `AGENTS.md` and `CLAUDE.md`
link here so a new conversation starts with the same incident lessons and
release gates.

## The release rule

Green CI is necessary, but it is not release approval. A user-facing release
is not safe to merge or promote until the exact deployed candidate has been
opened in a real browser and the required route matrix has been inspected.
Unit tests, typecheck, lint, migration checks, scripted E2E, a production build,
and a green GitHub check cannot substitute for that browser gate.

The deployed representative E2E job is a prerequisite for reporting browser
validation: pending, failed, cancelled, or missing means the candidate is not
browser-validated. That job is representative only and still does not replace
the complete route-by-route browser matrix for a high-risk release.

One timeout, closed tab, blank or partial section, broken image/video, console
error, wrong tenant identity, wrong URL, or incomplete inspection is
**unverified** and blocks the release. Never report browser validation as passed
when it was only inferred from CI or a local script.

## Start every new task or conversation with a state snapshot

Before reasoning from an earlier conversation, fetch and record:

1. The working branch, clean/dirty status, `origin/staging`, `origin/main`, and
   the exact deployed Worker SHA for each environment.
2. Every relevant PR's base, head, merge status, and source-PR ancestry. A
   merged integration PR does not prove that all source-PR work survived.
3. The current migration and seed state. For content migrations, record source
   row counts, canonical tenant-page/locale/document/revision/block counts, and
   any unmapped or rejected records before treating legacy-table removal as
   safe.
4. A status table with these separate states: code landed, staging deployed,
   staging browser verified, production deployed, production browser verified,
   and deferred operational work.

Do not carry forward a prior agent's claim of “green,” “deployed,” “complete,”
or “verified” without checking the underlying commit, deployment, logs, and
browser evidence.

## Required release sequence

1. Read the PR reviews and the product goal together. Convert every deferred
   item into an explicit issue or acceptance criterion; do not silently turn a
   partial implementation into a completed feature.
2. Keep billing, content/migrations, renderer changes, and UI polish in separate
   reviewable PRs. If an integration PR is necessary, keep the source PRs and
   their surviving work traceable until they are safely re-landed or explicitly
   superseded.
3. Run focused local validation and a production build. For any public,
   dashboard, CMS, auth, billing, or renderer change, use a real browser locally
   when practical, but treat local evidence as preparation rather than deployed
   release evidence.
4. Deploy the exact candidate to staging. Wait for required checks, then run the
   full browser matrix below against the deployed staging host.
5. Promote only after staging is browser-verified. After production deploy,
   identify the exact production SHA and repeat the relevant browser matrix on
   production. A staging pass does not prove the production deployment is good.
6. Close the issue or describe the work as complete only when code, migrations,
   deployed runtime, browser evidence, and operational acceptance all pass.

## Mandatory browser gate

Use a fresh browser context and inspect every published public route
individually. Use the live sitemap/navigation and fixture data to enumerate the
current route set; do not test only the homepage or a representative subset for
a high-risk renderer, content, migration, or routing change.

For every route, verify:

- the final URL, redirects, tenant identity, title, and visible rendered copy;
- the complete section/block composition, with a full-page scroll;
- desktop and narrow/mobile responsive layout;
- every image, video, poster, font, and other first-party media asset loads and
  has the correct type and content;
- links, buttons, forms, reservations, contact, booking, and other route-local
  actions where published;
- browser console errors, failed first-party requests, hydration errors, blank
  sections, skeleton-only states, and late content disappearance.

The minimum high-risk tenant matrix is:

- platform marketing, docs, blog, templates, authentication, help, and legal
  routes;
- Demo: menu/items, experiences/details, both locations/subpages, reviews,
  Q&A, posts, photos, about, contact, reservations, and blog;
- Pottery House: all experience details, both locations/subpages, posts/blog,
  contact, reservations, reviews, Q&A, photos, and about;
- Kikuzuki: all published menu/item routes, locations/subpages, reservations,
  reviews, Q&A, posts, photos, about, contact, and published experiences;
- NCLS: services/details, pricing, blog/articles, contact/confirmation,
  schedule, donation, policies, notices, and legacy redirects.

If the route inventory changes, enumerate the new published routes rather than
assuming this list is still complete. A route that was not opened is not
verified.

## Migration and content safety

Preserve source data until a migration has proved its mapping. Before dropping
or retiring a legacy table or writer:

- run a dry-run or equivalent inventory grouped by tenant, locale, page/type,
  publication state, and media/reference;
- assert the expected canonical tenant pages, locale variants, content
  documents, revisions, and typed blocks, including representative client
  counts;
- fail loudly on an unmapped record; never silently drop content or turn an API
  error into an empty success;
- verify the deployed readers and seeders use the canonical source of truth;
- only then apply the destructive part of the migration and repeat a read-only
  post-migration census.

Historical migration files may retain legacy names because applied migration
history is immutable. Migration fixtures or tests that exercise that historical
SQL may also contain those names as inputs, but they are not active product
paths. New runtime code, seed writes, active fixtures, tests, and documentation
must make the distinction explicit and must not reintroduce legacy writers or
automated-translation product paths.
Manual customer-managed locale variants remain supported unless an approved
product decision removes them separately.

Never reseed or hand-mutate production data to hide a renderer or routing bug.
For an outage, preserve the database and stabilize the known-good renderer or
Worker first. Optional rollback checks can follow the emergency stabilization;
customer-facing downtime is not a reason to wait for them.

## Incident and rollback rules

When a deployed site is broken:

1. Declare the exact affected environment, SHA, routes, and observed symptom.
2. Compare the deployed renderer selection and runtime logs with the last
   verified release.
3. Restore the smallest known-good renderer/release path first, without
   dropping data or reseeding.
4. Re-open the affected routes in a real browser, including all affected client
   sites and responsive layouts.
5. Only after service is stable, audit the source/canonical data and repair the
   failed release in a narrow PR. Do not land the broad feature branch as an
   emergency fix.

## Handoff and issue hygiene

Every final handoff must state: what landed, what is deployed, which browser
matrix was actually opened, what remains unverified, and which operational or
product decisions are deferred. “Complete” means the acceptance evidence
exists; it does not mean the implementation compiles.

Close completed implementation issues only when their promised scope is
actually delivered. Keep operational follow-ups, pricing decisions,
compatibility-path removal, editor visual polish, and documentation cleanup in
explicit open issues rather than burying them in a merged PR description. The
current post-release follow-up for the Stripe operations, business-model
cleanup, visual Pages editor, and active legacy-naming audit is
[#554](https://github.com/paulchrisluke/krabiclaw/issues/554).
