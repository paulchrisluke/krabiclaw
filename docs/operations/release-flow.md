# Release flow

KrabiClaw uses one branch-driven GitHub Actions workflow and three independent
Cloudflare Workers.

| Git event | Worker | Validation |
| --- | --- | --- |
| Pull request to `staging` or `main` | `krabiclaw-preview` | Representative Playwright coverage |
| Push to `staging` | `krabiclaw-staging` | Full Playwright suite |
| Push to `main` | `krabiclaw` | Read-only production browser smoke |

Each deployment is a normal `wrangler deploy` to its environment. Cloudflare
retains ordinary deployment history.

The checks job runs the repository's migration lint once. Each deployment job
then builds, performs one normal Worker deploy, and uses native
`wrangler d1 migrations apply`; Wrangler owns the applied-migration history.
Runtime removals land before their contract migration so the environment never
runs an older Worker against columns that have already been dropped.
Preview fixtures are reset and seeded for PR isolation. Staging keeps its
persistent fixtures and sweeps only disposable E2E artifacts. Production is
never seeded by CI.

Releases enter staging and production through reviewed branch merges. During an
outage, use Cloudflare's deployment history without changing D1 data, then
repair the source through the normal `staging` to `main` flow.
