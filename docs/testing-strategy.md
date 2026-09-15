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

A test is admitted because it uniquely proves a current invariant, not because
a numeric budget permits it. There is no cap on test files, test count, or test
lines, and there never should be one: a cap makes deletion the cheapest way to
add coverage and turns the suite into a number to manage.

## Deletion history is not an invariant

> Deletion history is not a permanent product invariant. Once old behavior is
> removed and no external compatibility contract requires it, do not retain
> tests, linters, guards, snapshots, comments, or documentation whose only
> purpose is proving the old behavior remains absent.

Ask of any test or check: would a developer designing this product fresh today
write it to protect something that exists? If the answer is no, delete it.

Negative testing remains appropriate for active invariants — authentication,
authorization, validation, capacity, concurrency, isolation, and tamper
resistance. The distinction is whether an assertion protects a current
contract, not whether it expects success or failure.

## Release feedback loop

An ordinary ready PR deploys a disposable preview and runs a fixed set of
`@smoke` cases against it — the same set on every PR, whatever the diff
touches. There is no selector and no impact map: a path nobody classified used
to promote an ordinary PR to the entire inventory, which is how a one-line
change bought a 13-minute E2E job.

The smoke set exists to cover distinct customer contracts, not to hit a count:

| Case | Contract |
| --- | --- |
| Pottery home → experiences → detail | Saya public navigation into a detail route |
| NCLS home → services → detail | blawby public navigation into a detail route |
| Pottery Product booking | a real guest write and its owner dispatch |
| Public auth CTAs reflect the SSR session | signed-in vs signed-out public surfaces |
| Kikuzuki publisher PKCE | OAuth into current MCP workspace context |
| MCP draft publishes to the public API | an MCP write becoming publicly visible |
| A role sees and can invoke only its own tools | the authorization boundary |

If a change merges two of these into one case, that is fine. Do not add a case
to preserve a number.

Preview runs are serialized across workflow runs because preview is one mutable
D1 environment and a run resets it. That serialization is infrastructure
correctness, not test bookkeeping — and its identity is a pattern that matches
every job that has ever held the lock, not the current job's display name, so
renaming the job cannot let two runs reset preview at once. Within one run the
suite uses two workers; the lock is between runs.

A push straight to `staging` runs the same smoke suite on the disposable
preview before staging deploys, so a hotfix cannot reach staging without it.
Production then re-reads that exact staging commit's checks before deploying.

Staging and production remain read-only. After staging deploys, CI runs the
read-only MCP smoke and tenant rendering/navigation against staging itself.
Guest and MCP write suites run only against fresh local data or disposable
preview data.

Focused commands:

```bash
yarn test:unit
yarn test:e2e:preview:smoke
yarn test:e2e:tenant-rendering
yarn test:e2e:guest-journeys
yarn test:e2e:mcp
```

Migration tooling changes also run `yarn test:migrations`. These integration
tests invoke the real installed Drizzle CLI/API and migration guards against
disposable schema fixtures. They prove no-change generation, detection of real
changes and generator failures, and rejection of referenced-parent drops before
execution. They neither apply migrations to a deployed database nor replace
the local D1 and existing-data checks required for an actual schema change.
