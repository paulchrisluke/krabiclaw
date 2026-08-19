# Release flow

KrabiClaw uses one branch-driven GitHub Actions workflow, three long-lived
Cloudflare Workers, and four fixed release-E2E Workers.

| Git event | Worker | Validation |
| --- | --- | --- |
| Ordinary/affected pull request to `staging` | `krabiclaw-preview` | Core plus affected Playwright coverage selected from the pull request |
| High-impact pull request to `staging` | `krabiclaw-preview`, `krabiclaw-e2e-1` through `krabiclaw-e2e-4` | Small deployed-preview contract smoke plus the complete Playwright inventory across four isolated shards |
| Push to `staging` | `krabiclaw-staging` | Core plus affected Playwright coverage selected from the pushed commits |
| `staging` to `main` pull request | `krabiclaw-e2e-1` through `krabiclaw-e2e-4` | Four isolated Playwright shards |
| Push to `main` | `krabiclaw` | Read-only production browser smoke |

Each deployment is a normal `wrangler deploy` to its environment. Cloudflare
retains ordinary deployment history.

The platform uses `preview.krabiclaw.com` and `staging.krabiclaw.com`. Public
tenant verification uses `<subdomain>-preview.krabiclaw.com` and
`<subdomain>-staging.krabiclaw.com`, routed to the same environment Worker.
Release E2E uses `e2e-1.krabiclaw.com` through `e2e-4.krabiclaw.com`, each
with its own deployed Worker and mutable Cloudflare resources. These direct
hosts are the browser and manual-QA contract; deployed checks do not select
tenants through request headers.

The checks job runs the repository's migration lint once. Pull-request browser
jobs share one exact-head Worker artifact. Each deployment job performs one
normal Worker deploy and uses native
`wrangler d1 migrations apply`; Wrangler owns the applied-migration history.
Runtime removals land before their contract migration so the environment never
runs an older Worker against columns that have already been dropped.
Preview and the four E2E lanes sweep disposable E2E artifacts and
deterministically reapply Demo, Pottery House, Kikuzuki, and NCLS from their
typed definitions before fixture-dependent browser coverage. Staging receives
deterministic deployment fixtures for human review but is not reset by release
E2E. Staging provisioning is limited to protected fixed IDs, refuses unexpected
ownership, and records D1 time-travel information before applying the fixtures.
Production is never seeded by CI. Pushes to staging retain the conditional
OAuth/MCP smoke and core-plus-affected Playwright coverage against the stable
staging Worker. Staging remains the human-review environment and is never used
as destructive release-E2E scratch space.

The durable staging-review identity is `staging-review@staging.krabiclaw.test`.
Its password is maintained in the team password manager and mirrored to the
GitHub Environment secret `STAGING_REVIEW_PASSWORD` for the staging deployment
job; GitHub is a delivery copy, not the human-retrievable source of truth. The
identity is provisioned by `scripts/provision-staging-review-auth.ts` after the
curated staging fixtures. Ordinary E2E credential rotation never deletes its
sessions or credential account. To rotate it deliberately, update both secret
stores and run the provisioner with `--rotate-password`.

`config/e2e-impact-map.mjs` is the executable impact map. Documentation-only
changes do not deploy a Worker. Narrow changes run the permanent core browser
sentinels plus the mapped subsystem specs on preview. Schema, migration,
Worker, test-harness, and unclassified runtime changes fail safe to the full
suite: preview runs only its small deployed contract smoke while the complete,
unchanged browser inventory runs across all four isolated lanes. Changing an
E2E spec always selects that exact spec.

The full suite is parallel infrastructure, not a serial preview tax. A
high-impact pull request to `staging`, and the ordinary `staging` to `main`
release pull request, build the exact head once, upload that artifact, and
deploy it to four fixed E2E environments. Each lane applies migrations, sweeps
and seeds only its own resources, provisions ephemeral auth, refreshes its
lane-specific AI Search instance, verifies routing, dev-route access, credential
login, active-organization selection, and session retrieval, and only then runs
one Playwright shard with `workers=1`. Ephemeral auth provisioning clears the
lane-local Better Auth JWKS rows whenever the lane secret rotates so retained
encrypted signing keys cannot outlive their encryption secret. Staging remains
the stable human-review deployment for the candidate. Production may not be
promoted until all four exact-head shards pass.

Cloudflare's documented primitives are named Wrangler environments and
per-environment bindings ([Workers environments](https://developers.cloudflare.com/workers/wrangler/environments/),
[Durable Object environments](https://developers.cloudflare.com/durable-objects/reference/environments/),
[Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/),
and [AI Search bindings](https://developers.cloudflare.com/ai-search/api/instances/workers-binding/)).
The fixed four-lane, shard-to-environment mapping and its lifecycle are
KrabiClaw CI architecture built on those primitives, not a Cloudflare reference
architecture.

Releases enter staging and production through reviewed branch merges. During an
outage, use Cloudflare's deployment history without changing D1 data, then
repair the source through the normal `staging` to `main` flow.
