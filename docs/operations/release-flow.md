# Release flow

KrabiClaw uses one branch-driven GitHub Actions workflow and three independent
Cloudflare Workers.

| Git event | Worker | Validation |
| --- | --- | --- |
| Pull request to `staging` or `main` | `krabiclaw-preview` | Representative Playwright coverage |
| Push to `staging` | `krabiclaw-staging` | Full Playwright suite |
| Push to `main` | `krabiclaw` | Read-only production browser smoke |

Each deployment is a normal `wrangler deploy` to its environment. Cloudflare
retains ordinary deployment history. The repository does not upload hidden
candidate versions, split traffic, send version-override headers, track Worker
UUIDs, create candidate manifests, or run a nightly release lane.

The checks job runs the repository's migration lint once. Each deployment job
then builds for its own environment and uses native
`wrangler d1 migrations apply`; Wrangler owns the applied-migration history.
Preview fixtures are reset and seeded for PR isolation. Staging keeps its
persistent fixtures and sweeps only disposable E2E artifacts. Production is
never seeded by CI.

The package exposes no staging or production deploy, migration, seed, or
rollback aliases. Releases enter those environments only through reviewed
branch merges. During an outage, use Cloudflare's deployment history without
changing D1 data, then repair the source through the normal `staging` to `main`
flow.
