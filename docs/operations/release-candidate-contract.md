# Immutable release-candidate contract

This document defines the evidence required for issue #554 releases. A green
check or a successful deploy command is not release approval. The candidate is
the immutable source SHA checked out by the workflow (`github.sha`), the one
Cloudflare Worker Version uploaded from that checkout, its static assets, the
database migration state, and the browser evidence collected against
that version.

## Required identities

Every candidate run records all of the following in
`candidate-manifest.json`:

- the full 40-character source SHA;
- the Worker name, immutable Worker version ID, version tag, and deployment
  percentages;
- the immutable `.output` build artifact used for the upload;
- applied and pending migrations (with their output) before and after the reset;
  the pre-apply proof must show the remote `d1_migrations` rows are an exact
  ordered prefix of the checkout's SQL filenames (including a hashed pending
  suffix), while post-apply proves the exact full filename set and order. The
  local SHA-256 values attest the checked-out source files only; D1 does not
  expose historical SQL checksums and the manifest must not imply that it does;
- candidate and post-promotion asset/provenance verification;
- an explicit immutable route inventory covering every published platform,
  Demo, Pottery House, Kikuzuki, and NCLS route (including all location,
  menu/item, experience/detail, service/article, and reviewed redirect
  contracts), with every listed route's HTML, Nuxt metadata, and referenced
  asset bytes compared with the downloaded production artifact;
- a read-only test-mode Stripe webhook endpoint preflight captured before any
  staging mutation, proving exactly one enabled destination at the normalized
  staging URL, the exact application event set, the pinned inbound event
  rendering version (`STRIPE_WEBHOOK_API_VERSION`) either explicitly on the
  endpoint or via a direct endpoint response's exact `Stripe-Version` header
  from a request without a version override when the endpoint inherits the
  account default (with the returned endpoint
  identity, URL, status, and null `api_version` bound to the inventory), and
  redacted endpoint identity. Evidence records the version source and effective
  version. The outbound Stripe client remains pinned independently to
  `STRIPE_API_VERSION`; these versions must not be conflated;
- one short post-promotion browser journey over normal, unoverridden traffic that opens each seeded tenant homepage, clicks a
  real navigation link, and verifies the destination content, stylesheet,
  console, and first-party request health; and
- a post-promotion test-mode Stripe organization checkout canary (at 100% of
  the candidate, using disposable `e2e-` state, hosted Checkout, Better Auth
  subscription, app billing/entitlement projection, processed webhook, and
  invoice ledger evidence with redacted provider IDs); and
- a read-only test-mode recurring Stripe catalog plan preflight tied to the
  same source SHA; the plan must contain zero operations for the candidate to
  proceed. A nonzero plan is recorded as `blocked_drift` and uploaded for a
  separate reviewed test-mode apply; it is never silently treated as passed;
The manifest must make it possible for a reviewer to follow one source SHA to
one build artifact, one Worker Version, one migration snapshot, and one set of
browser results. Missing, ambiguous, or indirectly inferred
identity is a failed candidate.

## Staging sequence

The full validation workflow is explicit `workflow_dispatch` only. Its
quality, test, and one production-build jobs run in parallel without touching
staging. The candidate job then holds the `shared-staging-candidate` lock for
the entire sequence:

1. Run the read-only test-mode Stripe webhook endpoint preflight before any
   staging mutation. It must use the existing `STRIPE_SECRET_KEY_TEST` secret,
   refuse live keys, and fail on endpoint count or event-set drift.
   The recurring catalog dry-run follows the same read-only boundary: any
   nonzero operation plan writes reviewed evidence and blocks before baseline
   capture or staging traffic mutation.
2. Capture the current staging deployment and baseline Worker version.
3. Capture migration state and run the migration safety check. Relationship
   preservation failures and silent row-loss patterns block before any database
   write; intentional schema removals are permitted.
4. Check that the pre-provisioned test-mode staging secret names exist. The
   candidate never runs `secret put`: publishing a secret creates a new Worker
   version outside the immutable upload chain.
5. Upload the candidate Worker Version exactly once, tagged with the full
   source SHA. Uploading does not change traffic or database state; a normal
   deploy retry is forbidden because it would create an untracked candidate.
6. Immediately before the first remote migration/reset/seed write, persist the
   durable `databaseMutationAttempted` marker, apply migrations, reset/reseed
   the idempotent fixtures, and capture applied/pending state again. The old
   Worker remains at 100%, but any later failure is an intervention-required
   database state; the workflow never claims or attempts a database rollback.
7. Deploy the baseline at **100%** and the candidate at **0%**. The required
   split is baseline 100% and candidate 0%. Pin requests to
   each version with Cloudflare's version-override header for verification and
   the 25-sample baseline/candidate comparison.
8. Run the complete browser E2E matrix against the candidate override. A
   timeout, browser error, missing route, or incomplete inspection is
   unverified.
9. Promote the candidate to **100%** only after every preceding gate passes,
   purge the deployment HTML cache, and verify the staging custom domain and
   assets without an override. Run the named Saya/Blawby desktop and mobile
   browser projects once more against that deployed custom-domain version.
10. Run the explicit test-mode Stripe checkout canary against the promoted
   custom-domain candidate with no version override. Provider webhooks cannot
   carry the 0% override, so this gate is post-promotion by design; a failure
   follows the existing EXIT-trap baseline restoration path.

If any command fails before a Worker traffic mutation, the job records the
failure and creates no compensating Worker deployment. Immediately before the
first baseline/candidate or promotion mutation it writes a durable traffic
mutation marker. After that marker, the job treats traffic state as unknown on
any failure; deployment-status lookup failures or ambiguous assignments force
an exact **restore baseline** attempt. The manifest records the marker,
restoration result, and intervention evidence; an uncertain or failed
restoration blocks promotion.

The candidate evidence upload is also a release gate. If that upload fails
after a traffic mutation, an always-running follow-up reads the local manifest,
restores only its declared baseline when needed, proves the baseline at 100%
with the candidate at 0% or absent, purges the staging cache, and leaves the
run failed for operator review even when restoration succeeds. A separate
always-run recovery artifact upload persists the restoration/intervention JSON;
the job summary records whether that second evidence transport also failed.

## Pull requests and ordinary pushes

The required PR/push workflow may run local checks and an isolated preview
deployment for representative browser tests. It must not migrate, reseed, or
deploy the shared staging Worker, and it must never deploy production. There is
no path filter that can silently skip the Pages editor, billing, links, or
Blawby representative coverage.

The deployed public browser gate opens every route in the curated
platform/Saya/Blawby inventory on desktop and mobile. The mutable Blawby
`/links` page is not treated as a permanently published route: the locked
staging candidate runs its publish → API 200 → host-bound page 200 lifecycle
(with cleanup) at the 0% override and again after promotion. Production
consumes that exact staging lifecycle evidence; production's public inventory
remains read-only.

The **Zaraz GA4 Backfill Plan** workflow is read-only as well. It accepts only
preview or staging targets, reads the target D1 connections and current
zone-level Zaraz configuration, and emits a plan without applying it. The
legacy `yarn zaraz:ga:backfill` alias is blocked; there is no production Zaraz
operator apply path.

## Production release

Production release is a separate manual workflow with two operations. The
first dispatch runs `preflight` only: it consumes a candidate manifest from a
completed staging run and proves the manifest's source SHA, staging Worker
version, migration evidence, asset verification, and browser evidence without
writing production. It records the actual
production pending migration output in the job summary, runs
`migrate:check`/Worker dry-runs, and recomputes the `.output` file count, tree
hash, and server-entry hash against the staging manifest.

After reviewing that report, an operator must make a second explicit dispatch
with `operation=deploy` and the successful preflight run ID. The deploy job
attests that separate run, SHA, workflow, manifest, migration evidence, and
build hash before entering the production mutation step. The preflight also
uses the production live Stripe key in a read-only endpoint census, proving the
exact `https://krabiclaw.com/api/billing/webhook` destination, pinned
`STRIPE_WEBHOOK_API_VERSION`, and exact ten-event set; it uploads only redacted
evidence as `production-stripe-webhook-preflight-<source-sha>`. A deploy
dispatch must download and attest that exact successful live-mode artifact; a
missing artifact, key leak, endpoint/version drift, or event-set mismatch
blocks deployment. (The current production endpoint census has seven events,
so this gate remains intentionally failing until the endpoint is separately
corrected.) There is no automatic
edge from preflight to deployment. Migration, version upload, split rollout,
cache purge, promotion, and browser verification also run in the named
`production` environment. Before any deploy mutation, the workflow proves
through the GitHub Environments API that the environment exists, has at least
one valid required reviewer, and has `prevent_self_review` enabled. A missing,
inaccessible, or weaker environment fails closed. A green preflight is not
deployment approval. The production job holds the old version at **100%** while its
candidate is **0%**, runs one combined desktop/mobile browser gate, promotes
only after that gate, purges cache, then repeats the deployed custom-domain
verification and browser gate with no version override, then records the
production AI Search synchronization result. Any post-split failure
restores the old version to 100%. A push to `main` never deploys production
automatically.

If a staging baseline is an intentionally untagged legacy Worker, the full
lane requires a successful Actions run with `headSha` equal to the baseline
SHA, workflow name `CI (Required PR Lane)`, push event, and an exact log line
`Current Version ID: <baseline-version-id>`. A
nonempty baseline tag that differs from the supplied SHA is rejected; an empty
tag is not silently treated as provenance. This is a one-time bridge for a
historical run whose then-current workflow actually deployed that staging
version. The repaired required lane cannot create or attest a new shared
staging baseline; after the locked full lane first succeeds, subsequent
baselines must carry their full source-SHA Worker tag.

The scheduled nightly E2E workflow is read-only telemetry only. It checks out
the configured deployed source SHA and requires a successful full-lane run ID
containing that SHA's immutable `.output` artifact, plus the base URL and
Worker version ID. It requires that exact source and Worker version to be the
normally serving, unoverridden deployment, compares deployed assets
byte-for-byte with the retained candidate artifact, and then runs only
Saya/Blawby public surface checks without a version override. It repeats the
identity and asset proof after browser coverage so a mid-run deployment change
fails closed instead of silently attributing mixed traffic to the configured
nightly identity. A stale nightly identity also fails closed instead of testing
an inactive retained version.
The workflow does not mutate shared staging, seed or migrate a database,
deploy, purge, call a provider, or write production data.

## Reporting states

Final reports keep these states separate:

- **Landed** — the source SHA and intentional commits exist in the repository;
- **Deployed** — that exact SHA's Worker version and migrations are present in
  the named environment; and
- **Verified** — the exact deployed candidate completed the real browser
  navigation journey with asset, console, and migration evidence.

An item without direct evidence is marked **❌**. Staging verification does not
prove production verification, and a production Worker with no source-SHA
provenance is not release-approved.

Direct production rollback, remote migration, and remote seed aliases are
blocked. Normal production releases use the protected, manifest-gated
workflow that records the exact source SHA and evidence chain.

Emergency rollback uses the separate **Production rollback
(exact-target, manifest-gated)** workflow. Dispatch it with the exact current
Worker version ID, exact target Worker version ID, exact 40-character source
SHA for that target, and an incident reason. Modern targets require an exact
source-SHA Worker tag. The one reviewed legacy target that predates tags and
`/api/deployment` is hard-bound to its exact source SHA, Worker version,
historical successful release run and deploy window, and provider creation
timestamp; there is no generic untagged fallback. The unprotected preflight
checks the current traffic assignment, target provenance, one build, and route
inventory without trying to route or HTTP-test an inactive version.

Only the protected `production` mutation job may place the declared current
version at 100% and target at 0%. It waits for the override to become available,
proves the target's exact source/build/assets and Saya/Blawby desktop/mobile
routes, and only then promotes the target to 100%. It purges the HTML cache and
repeats readiness, source/build/asset, and browser proof over normal
unoverridden traffic. The legacy target uses its hard-bound release evidence
plus byte-for-byte target-build assets in place of a nonexistent provenance
endpoint. The workflow never guesses a previous version or writes
database/fixture/provider state. If a status lookup or later gate is ambiguous
after traffic mutation, it restores only the explicitly declared current
version and emits intervention evidence; the run remains failed until an
operator reviews it.

An artifact-upload failure after a successfully verified emergency rollback is
not itself a reason to route traffic back to the incident version. The workflow
fails, re-reads production traffic, and proves the declared rollback target is
still the only version at 100%. It leaves that known-good target serving while
the missing durable artifact is investigated; ambiguity in the traffic check
still fails closed for operator intervention.
