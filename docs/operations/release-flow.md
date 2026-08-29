# Release flow

KrabiClaw uses one branch-driven GitHub Actions workflow and three Cloudflare Workers.

| Git event | Worker | Release-blocking validation |
| --- | --- | --- |
| Pull request to `staging` | `krabiclaw-preview` when affected | Tenant rendering/navigation plus affected guest or tenant MCP journeys |
| Push to `staging` | `krabiclaw-staging` | Read-only rendering on Pottery House, Kikuzuki, and NCLS aliases; read-only tenant MCP OAuth/content smoke |
| `staging` to `main` pull request | None | Reuses checks attached to the exact staging SHA |
| Push to `main` | `krabiclaw` | Read-only rendering/navigation on all three customer custom domains |

Each environment receives one normal `wrangler deploy`. Preview uses one fixed, shared D1 resource; it may apply disposable fixtures and run writes. Staging applies migrations but never sweeps, resets, reseeds customers, provisions E2E identities, or performs guest/MCP writes. Production is never seeded, reset, or mutated by test automation.

A database-epoch cutover additionally uses the temporary maintenance deployment
defined in [release-and-outage-prevention.md](release-and-outage-prevention.md).
It is not part of an ordinary schema migration or application release.

Production deployment and verification are separate jobs in the same workflow. The deploy job builds once, performs the single Wrangler deployment, then applies forward-compatible migrations and refreshes search. The verification job waits until all three custom domains expose that exact Nuxt build and its referenced assets, then runs read-only browser coverage. Retrying a failed verification job never redeploys production.

For migration safety, preview reset behavior, database epoch transitions, incident recovery, and detailed browser/MCP verification requirements, see [release-and-outage-prevention.md](release-and-outage-prevention.md).
