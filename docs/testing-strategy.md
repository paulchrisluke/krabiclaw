# Testing strategy

Browser and deployed MCP behavior are the release signal. Static checks and unit tests are supporting diagnostics, not proof that a customer can use the product.

For release-qualified surfaces and validation requirements, see [docs/operations/release-and-outage-prevention.md](operations/release-and-outage-prevention.md).

## Feedback loop

`config/e2e-impact-map.mjs` maps changes to `tenant-public`, `guest-journeys`, or `tenant-mcp`. Documentation-only changes skip preview. A deployed preview always runs tenant rendering/navigation, then affected guest/MCP specs. High-impact or unclassified runtime changes run all retained E2E files.

Staging and production are read-only. Staging does not reseed or provision test accounts. Guest and MCP write suites run only on fresh local data or disposable preview data.

## Unit-test standard

Keep unit tests only when they exercise narrow behavior more clearly than a browser can: validation boundaries, cancellation-token semantics, tenant access decisions, canonical content transforms, parsers, and migration safety. Delete or reject tests that scan source text, assert wiring strings, mock an end-to-end workflow, or duplicate a retained E2E journey with lower confidence.

Focused commands:

```bash
yarn test:e2e:tenant-rendering
yarn test:e2e:guest-journeys
yarn test:e2e:mcp
yarn test:unit
```

Local E2E uses the exact Node version, fresh local migrations/fixtures, a production Nuxt/Nitro build, and `.output/server/index.mjs` through normal local Wrangler. Do not substitute `nuxt dev` or a mock server and call it deployed-path proof.
