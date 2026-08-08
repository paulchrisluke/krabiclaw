# Immutable release-candidate contract

This document defines the evidence required for issue #554 releases. A green
check or a successful deploy command is not release approval. The candidate is
the immutable source SHA checked out by the workflow (`github.sha`), the one
Cloudflare Worker Version uploaded from that checkout, its static assets, the
database migration state, and the browser/benchmark evidence collected against
that version.

## Required identities

Every candidate run records all of the following in
`candidate-manifest.json`:

- the full 40-character source SHA;
- the Worker name, immutable Worker version ID, version tag, and deployment
  percentages;
- the immutable `.output` build artifact used for the upload;
- applied and pending migrations (with their output) before and after the reset;
- candidate and post-promotion asset/provenance verification;
- a read-only test-mode Stripe webhook endpoint preflight captured before any
  staging mutation, proving exactly one enabled destination at the normalized
  staging URL, the exact application event set, and redacted endpoint identity;
- browser evidence, including the URL, desktop/mobile coverage, route matrix,
  and any failure artifacts; and
- a post-promotion test-mode Stripe organization checkout canary (at 100% of
  the candidate, using disposable `e2e-` state, hosted Checkout, Better Auth
  subscription, app billing/entitlement projection, processed webhook, and
  invoice ledger evidence with redacted provider IDs); and
- a genuine baseline/candidate comparative benchmark with 25 samples per run,
  the source SHA and Worker version for both runs, deterministic request/query
  metrics, and the comparison result.

The manifest must make it possible for a reviewer to follow one source SHA to
one build artifact, one Worker Version, one migration snapshot, and one set of
browser and benchmark results. Missing, ambiguous, or indirectly inferred
identity is a failed candidate.

## Staging sequence

The full validation workflow is explicit `workflow_dispatch` only. Its
quality, test, and one production-build jobs run in parallel without touching
staging. The candidate job then holds the `shared-staging-candidate` lock for
the entire sequence:

1. Run the read-only test-mode Stripe webhook endpoint preflight before any
   staging mutation. It must use the existing `STRIPE_SECRET_KEY_TEST` secret,
   refuse live keys, and fail on endpoint count or event-set drift.
2. Capture the current staging deployment and baseline Worker version.
3. Capture migration state, apply the migration check and staging migrations,
   reset/reseed the idempotent fixtures, and capture applied/pending state
   again.
4. Check that the pre-provisioned test-mode staging secret names exist. The
   candidate never runs `secret put`: publishing a secret creates a new Worker
   version outside the immutable upload chain.
5. Upload the candidate Worker Version exactly once, tagged with the full
   source SHA. A normal deploy retry is forbidden because it would create an
   untracked candidate.
6. Deploy the baseline at **100%** and the candidate at **0%**. The required
   split is baseline 100% and candidate 0%. Pin requests to
   each version with Cloudflare's version-override header for verification and
   the 25-sample baseline/candidate comparison.
7. Run the complete browser E2E matrix against the candidate override. A
   timeout, browser error, missing route, or incomplete inspection is
   unverified.
8. Promote the candidate to **100%** only after every preceding gate passes,
   purge the deployment HTML cache, and verify the staging custom domain and
   assets without an override. Run the named Saya/Blawby desktop and mobile
   browser projects once more against that deployed custom-domain version.
9. Run the explicit test-mode Stripe checkout canary against the promoted
   custom-domain candidate with no version override. Provider webhooks cannot
   carry the 0% override, so this gate is post-promotion by design; a failure
   follows the existing EXIT-trap baseline restoration path.

If any command fails after the candidate is present in a deployment, the job
detects that deployed candidate and restores the baseline to 100% before
exiting. A failure before the split does not create a compensating deployment.
This is the restore baseline failure path. The manifest records whether
restoration succeeded; a failed restoration
requires operator intervention and blocks promotion.

## Pull requests and ordinary pushes

The required PR/push workflow may run local checks and an isolated preview
deployment for representative browser tests. It must not migrate, reseed, or
deploy the shared staging Worker, and it must never deploy production. There is
no path filter that can silently skip the Pages editor, billing, links, or
Blawby representative coverage.

## Production release

Production release is a separate manual workflow with two operations. The
first dispatch runs `preflight` only: it consumes a candidate manifest from a
completed staging run and proves the manifest's source SHA, staging Worker
version, migration evidence, asset verification, browser evidence, and
comparative benchmark without writing production. It records the actual
production pending migration output in the job summary, runs
`migrate:check`/Worker dry-runs, and recomputes the `.output` file count, tree
hash, and server-entry hash against the staging manifest.

After reviewing that report, an operator must make a second explicit dispatch
with `operation=deploy` and the successful preflight run ID. The deploy job
attests that separate run, SHA, workflow, manifest, migration evidence, and
build hash before entering the production mutation step. There is no automatic
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
tag is not silently treated as provenance.

The scheduled nightly E2E workflow is read-only telemetry only. It checks out
the configured deployed source SHA and requires a successful full-lane run ID
containing that SHA's immutable `.output` artifact, plus the base URL and
Worker version ID. It pins all browser requests to that version, compares
deployed assets byte-for-byte with the retained candidate artifact, and runs
only Saya/Blawby public surface checks. It does not mutate shared staging, seed
or migrate a database, deploy, purge, call a provider, or write production
data.

## Reporting states

Final reports keep these states separate:

- **Landed** — the source SHA and intentional commits exist in the repository;
- **Deployed** — that exact SHA's Worker version and migrations are present in
  the named environment; and
- **Verified** — the exact deployed candidate was opened in the required real
  browser matrix and has complete route, asset, console, migration, and
  benchmark evidence.

An item without direct evidence is marked **❌**. Staging verification does not
prove production verification, and a production Worker with no source-SHA
provenance is not release-approved.
