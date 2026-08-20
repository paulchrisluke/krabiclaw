# Release flow

KrabiClaw uses one branch-driven GitHub Actions workflow and three independent
Cloudflare Workers.

| Git event | Worker | Validation |
| --- | --- | --- |
| Pull request to `staging` | `krabiclaw-preview` | Core plus affected Playwright coverage selected from the diff |
| Push to `staging` | `krabiclaw-staging` | Core plus affected Playwright coverage selected from the pushed commits |
| `staging` to `main` pull request | `krabiclaw-staging` | Full Playwright release qualification |
| Push to `main` | `krabiclaw` | Read-only production browser smoke |

Each deployment is a normal `wrangler deploy` to its environment. Cloudflare
retains ordinary deployment history.

The platform uses `preview.krabiclaw.com` and `staging.krabiclaw.com`. Public
tenant verification uses `<subdomain>-preview.krabiclaw.com` and
`<subdomain>-staging.krabiclaw.com`, routed to the same environment Worker.
These direct hosts are the browser and manual-QA contract; deployed checks do
not select tenants through request headers.

The checks job runs the repository's migration lint once. Each deployment job
then builds, performs one normal Worker deploy, and uses native
`wrangler d1 migrations apply`; Wrangler owns the applied-migration history.
Runtime removals land before their contract migration so the environment never
runs an older Worker against columns that have already been dropped.
Preview and staging both sweep disposable E2E artifacts and deterministically
reapply Demo, Pottery House, Kikuzuki, and NCLS from their typed definitions
before fixture-dependent browser coverage. Staging provisioning is limited to
protected fixed IDs, refuses unexpected ownership, and records D1 time-travel
information before applying the fixtures. Production is never seeded by CI.

Staging also provisions the durable human-review identity
`staging-review@staging.krabiclaw.test` after the curated fixtures. Its password
comes from the `STAGING_REVIEW_PASSWORD` secret in the `staging` GitHub
Environment. Ordinary provisioning restores editor and site-team memberships
for Pottery House, Kikuzuki, and NCLS without rotating the password or deleting
sessions. Rotation is explicit and separate from ephemeral E2E credentials.

`config/e2e-impact-map.mjs` is the executable impact map. Documentation-only
changes do not deploy a Worker. Narrow changes run the permanent core browser
sentinels plus the mapped subsystem specs. Schema, migration, Worker, test
harness, and unclassified runtime changes fail safe to the full suite. Changing
an E2E spec always selects that exact spec.

The full suite is a release-candidate gate rather than a tax on every staging
commit. Opening or updating the ordinary `staging` to `main` pull request
rebuilds and deploys its exact staging head, provisions deterministic fixtures,
and runs the complete suite against `staging.krabiclaw.com`. Production may not
be promoted until that exact-head qualification passes.

Releases enter staging and production through reviewed branch merges. During an
outage, use Cloudflare's deployment history without changing D1 data, then
repair the source through the normal `staging` to `main` flow.
