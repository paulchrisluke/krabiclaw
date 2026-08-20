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
disposable fixtures and run writes. Staging applies migrations but never sweeps,
reseeds customers, provisions E2E identities, or performs guest/MCP writes.
Production is never seeded or mutated by test automation.

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
disposable data. Staging and production verification is read-only.

Releases enter staging and production through reviewed branch merges. During an
outage, restore the last known-good Worker from Cloudflare deployment history
without changing D1 data, then repair the source through the normal branch flow.
