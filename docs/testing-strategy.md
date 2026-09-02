# Testing strategy

Do not add a test by default. Add one only when it proves a named invariant more
directly than the existing build, browser, MCP, or database verification.

Browser and deployed MCP behavior are the release signal. Static checks and the
small unit suite are supporting diagnostics; they are not proof that a customer
can use the product. For release-qualified surfaces, follow
[release-and-outage-prevention.md](operations/release-and-outage-prevention.md).

## Choose the proof at the real boundary

Use the narrowest real boundary that proves the behavior:

1. Use typecheck, lint, or a canonical schema guard for structural rules.
2. Use a direct unit test for an isolated calculation, parser, normalization,
   serialization, validation rule, or security decision.
3. Use real local D1 and the Worker for persistence, transactions, and
   atomicity.
4. Use a browser against the local production Worker build for CMS and UI
   behavior.
5. Use disposable deployed-preview E2E for release-critical customer journeys.
6. Use an actual ChatGPT session only for ChatGPT-specific tool discovery,
   selection, attachments, and host-provided arguments.

Local browser verification uses the repository's exact Node version, fresh
local migrations and fixtures, a production Nuxt/Nitro build, and
`.output/server/index.mjs` through local Wrangler. Do not substitute
`nuxt dev`, component mocks, or a mock server and call it runtime proof.

## Unit-test admission rule

A new unit test must name the invariant it proves and must fail only when that
invariant is broken. It must exercise exported behavior directly, without
reconstructing the surrounding application.

Do not add or retain unit tests that:

- read Vue, TypeScript, or JavaScript source and match strings, imports, SQL,
  component markup, or wiring;
- mock internal database, auth, MCP executor, domain, composable, or API
  modules;
- copy their expected result from the implementation or restate a constant,
  schema declaration, framework configuration, or type;
- add a regression test merely because a bug occurred;
- assert query counts or implementation shape instead of observable behavior;
- duplicate a deployed E2E journey with lower confidence;
- simulate an end-to-end workflow with hand-built fakes.

Do not automatically replace a deleted mock test. When a real risk is not
covered at the correct boundary, verify that boundary as part of the affected
feature work.

`yarn lint:test-quality` enforces the mechanical rules and caps the unit suite.
The limits in that script are authoritative. Adding a valuable test above them
requires deleting lower-value coverage in the same change.

## Release feedback loop

`config/e2e-impact-map.mjs` maps runtime changes to `tenant-public`,
`guest-journeys`, or `tenant-mcp`. Documentation-only changes skip preview.
A deployed preview runs the affected retained Playwright specs. High-impact or
unclassified runtime changes run the full retained E2E suite.

Staging and production remain read-only. Guest and MCP write suites run only
against fresh local data or disposable preview data.

Focused commands:

```bash
yarn lint:test-quality
yarn test:unit
yarn test:e2e:tenant-rendering
yarn test:e2e:guest-journeys
yarn test:e2e:mcp
```

## 2026-09-01 reduction baseline

| Metric | Before | After |
| --- | ---: | ---: |
| Unit-test files | 101 | 37 |
| Unit tests | 458 | 180 |
| Unit-test lines | 8,803 | 2,907 |
| Internal module-mock files | 16 | 0 |
| Production source-scanning files | 15 | 0 |

The retained Playwright files are unchanged by this reduction.

## 2026-09-02 cap increases

The unit-test cap in `yarn lint:test-quality` moved from 180 to 190, then to
200, across the same review cycle — each increase made room for genuinely
boundary-appropriate coverage (isolated normalization/parsing/validation
logic: nullable-Product-price helpers, then MCP tool-annotation guard
combinations and the CIMD email-scope backfill decision) rather than forcing
an unrelated deletion pass in the same change. The file and line caps are
unchanged. The limits in `scripts/check-unit-test-quality.mjs` remain
authoritative; this note explains why the number moved, not what it currently
is.
