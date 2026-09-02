# Release flow

KrabiClaw uses one branch-driven GitHub Actions workflow and three Cloudflare Workers.

| Git event | Worker | Release-blocking validation |
| --- | --- | --- |
| Pull request to `staging` | `krabiclaw-preview` when affected | Tenant rendering/navigation plus affected guest or tenant MCP journeys |
| Push to `staging` | `krabiclaw-staging` | Read-only rendering on Pottery House, Kikuzuki, and NCLS aliases; read-only tenant MCP OAuth/content smoke |
| `staging` to `main` pull request | None | Reuses checks attached to the exact staging SHA |
| Push to `main` | `krabiclaw` | Read-only rendering/navigation on all three customer custom domains |

Each environment receives one normal `wrangler deploy`. Preview uses one fixed, shared D1 resource; it may apply disposable fixtures and run writes. Staging applies migrations but never sweeps, resets, reseeds customers, provisions E2E identities, or performs guest/MCP writes. Production is never seeded, reset, or mutated by test automation.

`CLOUDFLARE_API_TOKEN` must grant account-level Workers Scripts Edit and D1 Edit permissions. It must also grant Zone Read and Workers Routes Edit for All Zones. A token limited to one named zone is not a release token.

CI deploys through `scripts/deploy-worker-ci.mjs`. The script rejects Wrangler route fallbacks and warnings about routes that Wrangler cannot delete. After deployment, the script reads the zone route catalog and requires an exact match with the routes for that Worker in `wrangler.toml`. Missing, stale, or misassigned routes fail the job.

Staging and production migration steps set `CI=true` and send an explicit `y` response to Wrangler. The jobs fail if Wrangler reports a permission fallback. Do not replace these checks with an interactive local migration command.

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

Production deployment and verification are separate jobs in the same workflow. The deploy job builds once, performs the single Wrangler deployment, then applies forward-compatible migrations and refreshes search. The verification job waits until all three custom domains expose that exact Nuxt build and its referenced assets, then runs read-only browser coverage. Retrying a failed verification job never redeploys production.

For migration safety, preview reset behavior, database epoch transitions, incident recovery, and detailed browser/MCP verification requirements, see [release-and-outage-prevention.md](release-and-outage-prevention.md). For the canonical migration workflow, see [docs/database/migrations.md](../database/migrations.md).
