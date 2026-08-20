# CI / E2E guardrails

## Release-qualified scope

CI blocks releases only for customer tenant sites, guest conversion journeys,
and tenant MCP/ChatGPT behavior. It does not qualify admin, dashboard, CMS,
ChowBot, billing/back-office, staging-review, site-administration, platform
marketing, or platform MCP surfaces.

The retained Playwright inventory is:

- `tenant-rendering.spec.ts`
- `tenant-client-navigation.spec.ts`
- `tenant-guest-journeys.spec.ts`
- `mcp-authorization.spec.ts`
- `mcp-content.spec.ts`
- `mcp-media.spec.ts`
- `mcp-owner-tools.spec.ts`
- `oauth-discovery.spec.ts`

## Environment rules

- Pull requests deploy preview only when one of the three impact groups is
  affected. Preview runs tenant rendering/navigation plus selected guest or MCP
  coverage.
- Preview is the only shared remote environment where tests may sweep, reseed,
  provision synthetic auth, or write guest/MCP data.
- A staging push performs one build, one deploy, migrations, and read-only tenant
  rendering/MCP checks. It never sweeps, reseeds, or provisions auth.
- The `staging` to `main` PR starts no second release cycle.
- Production performs read-only checks against the three real customer domains.
- Cloudflare credentials remain scoped to Cloudflare mutation steps.

Guest writes are hard-restricted to local hosts and `preview.krabiclaw.com`.
Every guest email uses `@playwright.example`, and throwaway MCP sites use an
`e2e-` marker so the next local/preview cleanup can remove cancelled-run state.

## Failure triage

Do not increase timeouts as the first response. Reproduce through the production
build and normal local Wrangler path, identify the first responsible request,
and fix the application, fixture, or environment contract. Console errors,
hydration mismatches, failed first-party requests, unexpected 4xx responses, and
all 5xx responses are failures in retained customer tests.

Unit tests are retained only for narrow executable behavior such as validation,
authorization predicates, canonical transforms, and migration safety. Do not add
source-string assertions or mocked duplicates of customer E2E journeys.
