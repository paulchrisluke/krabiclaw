# Release flow

KrabiClaw uses one branch-driven GitHub Actions workflow and three Cloudflare Workers.

| Git event | Worker | Release-blocking validation |
| --- | --- | --- |
| Pull request to `staging` | `krabiclaw-preview` when affected | Tenant rendering/navigation plus affected guest or tenant MCP journeys |
| Push to `staging` | `krabiclaw-staging` | Read-only rendering on Pottery House, Kikuzuki, and NCLS aliases; read-only tenant MCP OAuth/content smoke |
| `staging` to `main` pull request | None | Reuses checks attached to the exact staging SHA |
| Push to `main` | `krabiclaw` | Read-only rendering/navigation on all three customer custom domains |

Each environment receives one normal `wrangler deploy`. Preview uses one fixed, shared D1 resource; it may apply disposable fixtures and run writes. Staging applies migrations but never sweeps, resets, reseeds customers, provisions E2E identities, or performs guest/MCP writes. Production is never seeded, reset, or mutated by test automation.

Preview must keep persistent Workers Logs and traces enabled in `wrangler.toml`,
with invocation logs and 100% sampling. This is permanent environment
configuration, not a temporary debugging toggle. After an E2E failure, inspect
the Playwright trace and the preview Worker's Cloudflare Observability records
for the failing request's timestamp and request ID before deciding whether to
retry. Preserve relevant evidence before Cloudflare's retention window expires;
enabling logging cannot recover requests from an earlier unlogged deployment.

For media failures, correlate `mcp_tool_failed` (tool, request ID, Ray ID,
duration, error chain) with the same invocation's `media_attachment_failed`,
`media_upload_failed`, and `media_cleanup_failed` records. Upload records identify
the provider, asset, failed stage, byte count, and stage timings; completion
records distinguish successful storage/persistence from cleanup. Attachment URLs
are redacted from error messages and stacks; diagnostic records omit tool
arguments, credentials, and file contents.

A database-epoch cutover additionally uses the temporary maintenance deployment
defined in [release-and-outage-prevention.md](release-and-outage-prevention.md).
It is not part of an ordinary schema migration or application release.

## Release-owner emergency override

The release owner may explicitly authorize an emergency promotion while a
qualification check is incomplete when production already has a material
customer-facing regression and waiting would prolong the incident. The
authorization must name the release, acknowledge the incomplete gate, and
require immediate post-deploy verification. Agents and operators may not infer
this override from urgency; it must be given directly for the current release.

Record the override in the promotion pull request or merge record, including
the customer impact, the waived or incomplete checks, and the verification
that will run after deployment. This override does not permit bypassing a known
reproducible first-party failure, database-epoch safeguards, migration safety,
or production data and write restrictions.

Production deployment and verification are separate jobs in the same workflow. The deploy job builds once, performs the single Wrangler deployment, then applies forward-compatible migrations and refreshes search only when indexed content definitions or document-generation code changed. The verification job waits until all three custom domains expose that exact Nuxt build and its referenced assets, then runs read-only browser coverage. Retrying a failed verification job never redeploys production.

For migration safety, preview reset behavior, database epoch transitions, incident recovery, and detailed browser/MCP verification requirements, see [release-and-outage-prevention.md](release-and-outage-prevention.md). For the canonical migration workflow, see [docs/database/migrations.md](../database/migrations.md).

## Dependency batches

Open Dependabot PRs are a bounded queue, not a complete inventory of outdated
dependencies. Before assembling a batch, inspect the application manifest and
lockfile against registry release metadata. Respect
the 30-day release-age gate, pinned toolchain versions, dependency patches,
and peer requirements. Record the exact included versions and every deferred
upgrade with its reason in the integration PR.

`yarn build` explicitly runs the existing Worker patch and generated-code check
after Nuxt finishes. Yarn 4 does not execute arbitrary `postbuild` hooks; keep
required build steps in the command CI actually invokes.

Dependabot checks every other Monday at 02:00 UTC using its supported Fugit
cron expression (`0 2 * * mon%2`). Routine npm updates, including majors, form
one group. Better Auth and TypeScript remain separate
because their documented blockers require independent qualification. GitHub
Actions updates form one group on the same schedule.

Known major-version holds belong in Dependabot's `ignore` rules as well as the
integration PR. `@types/node` stays on its proven major until a toolchain upgrade
is qualified; `better-sqlite3` stays on version 12 while pinned Better Auth
requires `^12`. Minor and patch updates remain eligible. Remove each major hold
when the corresponding toolchain or auth upgrade is qualified. Group exclusions
alone do not hold a dependency: they allow it to return as an individual PR.

Routine releases must be at least 30 days old. Dependabot's cooldown and the
root Yarn configuration enforce the same window. Existing locked versions are
retained, not downgraded
merely because this policy became stricter. Preserve pinned runtime versions,
reviewed dependency patches, and their peer requirements when selecting a batch.

Security updates bypass Dependabot's routine schedule/cooldown, and the existing
weekly dependency security audit remains enabled. If an urgent security fix is
younger than 30 days, review the exact advisory, package, and fixed version before
using Yarn's per-command age-gate exception. Do not disable the repository gate
or add a permanent blanket preapproval to make the update install.

Grouping does not authorize merging or waive validation.

Qualify the combined branch through local checks and one full preview run before
merging to staging. Close superseded bot PRs only after the integration lands.
An auth update that changes schema or network-security contracts requires that
work to be designed and qualified explicitly; never upgrade one auth plugin in
isolation or suppress its incompatible peer requirements.

## Search indexing

Staging and production deploys compare the push's before/after commits in the
existing `ai-search-sync.ts` command. Full refreshes run only for changes to its
explicit indexed-input list: the knowledge catalog, index builder, content-block
renderer/storage reader, platform scope, and blog/doc path mappings. Dependency,
logging, styling, and unrelated application changes skip refresh. The staging
read-only search smoke still runs on every deployment.

Content-edit handlers retain their existing indexing triggers. They currently
request a full rebuild; this deployment gate does not introduce a second index
or an incremental indexing implementation.

Provision `PLATFORM_SEARCH_REINDEX_SECRET` once through the existing environment
secret setup, rather than rewriting it on every deployment. When provisioning a
new search instance, changing search bindings, importing indexed content outside
the application, or applying a data migration that changes indexed records, run
`yarn ai-search:sync:staging` (or the production command during an authorized
production release) explicitly. Omitting `--changed-since` requests a full refresh.
Update the indexed-input list whenever the index builder gains a new source.
`--dry-run` reports the decision without contacting Cloudflare.
