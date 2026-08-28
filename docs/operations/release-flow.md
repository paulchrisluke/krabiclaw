# Release flow

KrabiClaw uses one branch-driven GitHub Actions workflow and three Cloudflare
Workers.

| Git event | Worker | Release-blocking validation |
| --- | --- | --- |
| Pull request to `staging` | `krabiclaw-preview` when affected | Tenant rendering/navigation plus affected guest or tenant MCP journeys |
| Push to `staging` | `krabiclaw-staging` | Read-only rendering on Pottery House, Kikuzuki, and NCLS aliases; read-only tenant MCP OAuth/content smoke |
| `staging` to `main` pull request | None | Reuses checks attached to the exact staging SHA |
| Push to `main` | `krabiclaw` | Read-only rendering/navigation on all three customer custom domains |

Each environment receives one normal `wrangler deploy`. Preview may apply its
disposable fixtures and run writes. Its isolated D1 database may be wiped in
place when a PR rewrites migration history that has not reached staging or
production. The guarded reset drops preview application schema and its ledger,
replays the full migration chain, and then requires fixture provisioning,
deployment, and verification. Staging applies migrations but never sweeps, resets,
reseeds customers, provisions E2E identities, or performs guest/MCP writes.
Production is never seeded, reset, or mutated by test automation.

Production deployment and verification are separate jobs in the same workflow.
The deploy job builds once, performs the single Wrangler deployment, applies
migrations, and refreshes search. The verification job waits until all three
custom domains expose that exact Nuxt build and its referenced assets, then runs
read-only browser coverage. Retrying a failed verification job never redeploys
production.

The only release-qualified surfaces are:

- Pottery House, Kikuzuki, and NCLS public rendering and navigation;
- Pottery experience booking and contact, plus Kikuzuki reservation;
- tenant MCP OAuth, isolation, reads, writes, content, and media.

Admin, dashboard, CMS/editor, ChowBot, billing/back-office, staging-review,
site-administration, platform marketing, and platform MCP behavior are not
release-qualified surfaces. Their failures do not receive synthetic browser
coverage in the release workflow.

`config/e2e-impact-map.mjs` has exactly three groups: `tenant-public`,
`guest-journeys`, and `tenant-mcp`. Documentation-only changes skip preview.
High-impact and unclassified runtime changes run the complete retained eight-file
inventory; narrower changes run tenant public coverage plus affected groups.

Preview writes use fixed customer/MCP fixtures and `@playwright.example` guest
identities. `scripts/reset-e2e-artifacts.ts` supports only local and preview
disposable data. The sweep resets rows, not schema history. Rewritten
preview-only migration history requires a guarded in-place schema wipe and full
migration replay; replacement resources, standalone `d1_migrations` edits, and
remote schema patches are forbidden. Staging and production verification is
read-only.

Releases enter staging and production through reviewed branch merges. During an
outage, restore the last known-good Worker from Cloudflare deployment history
without changing D1 data, then repair the source through the normal branch flow.
