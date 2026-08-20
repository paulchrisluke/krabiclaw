# Testing strategy

Browser and deployed MCP behavior are the release signal. Static checks and unit
tests are supporting diagnostics, not proof that a customer can use the product.

## Product contracts

Release-blocking coverage proves:

1. Pottery House, Kikuzuki, and NCLS render and navigate at desktop/mobile widths
   with correct identity, content, media, navigation, footer, CTA, canonical data,
   styles, and stable hydration.
2. Guests can complete Pottery booking/contact and Kikuzuki reservation flows;
   writes persist and produce log-only owner notification records. NCLS exposes
   contact information and scheduling links but intentionally has no contact form.
3. Tenant MCP proves OAuth, tenant isolation, role visibility, reads, writes,
   canonical content, and media/ChatGPT attachment behavior.

Admin, dashboard, CMS/editor, ChowBot, billing/back-office, staging-review,
site-administration, platform marketing, and platform MCP are deliberately not
release-qualified.

## Feedback loop

`config/e2e-impact-map.mjs` maps changes to `tenant-public`, `guest-journeys`, or
`tenant-mcp`. Documentation-only changes skip preview. A deployed preview always
runs tenant rendering/navigation, then affected guest/MCP specs. High-impact or
unclassified runtime changes run all eight retained E2E files.

Staging and production are read-only. Staging does not reseed or provision test
accounts. Guest and MCP write suites run only on fresh local data or disposable
preview data.

## Unit-test standard

Keep unit tests only when they exercise narrow behavior more clearly than a
browser can: validation boundaries, cancellation-token semantics, tenant access
decisions, canonical content transforms, parsers, and migration safety. Delete or
reject tests that scan source text, assert wiring strings, mock an end-to-end
workflow, or duplicate a retained E2E journey with lower confidence.

Focused commands:

```bash
yarn test:e2e:tenant-rendering
yarn test:e2e:guest-journeys
yarn test:e2e:mcp
yarn test:unit
```

Local E2E uses the exact Node version, fresh local migrations/fixtures, a
production Nuxt/Nitro build, and `.output/server/index.mjs` through normal local
Wrangler. Do not substitute `nuxt dev` or a mock server and call it deployed-path
proof.
