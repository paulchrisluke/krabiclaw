# Performance recovery — 2026-07-31

## Scope and method

The deterministic data budgets are exercised by
`tests/e2e/smoke.spec.ts` against the deployed-style public shell and page
routes. The browser benchmark is executable with:

```bash
yarn benchmark:performance-recovery --base-url http://localhost:3000 --samples 30
```

The 30-sample evidence below used Playwright Chromium, the curated demo,
NCLS/Blawby, and Pottery House fixtures, and local Nuxt/Miniflare on port 3001.
The measured revision was `b38ac8402b4066a15f9860c87bbc727d7a9a3e19`
plus the working-tree changes in this performance batch. All 90 document
requests returned HTTP 200 with no document or application-data request
failures.

The current public template registry contains `saya` and `blawby`. It contains
no Lobby template or Lobby fixture, so this report uses both shipped templates
and does not label another implementation as Lobby.

## Deterministic data budgets

Cold local D1 requests were measured with uncached locale keys:

| Scenario | Shell statements | Page statements | Combined | Budget |
|---|---:|---:|---:|---:|
| Localized About | 4 | 3 | 7 | ≤ 8 |
| Experience detail | 4 | 8 | 12 | ≤ 12 |

The standard fixture payloads measured 5,230 bytes for the public shell, 5,514
bytes for localized About, and 5,947 bytes for experience detail. The enforced
ceilings are 30 KiB for shell and 25 KiB for a simple page.

The reduction came from removing a redundant per-request foreign-key pragma,
skipping host resolution for explicit site-ID APIs, avoiding page location
queries on routes that do not consume them, combining shell capability reads,
reusing loaded location/timezone data for availability, and reading bookings
and overrides in one constant-size statement.

## Browser results

These are warm local-development browser measurements, not staging claims.
Local HMR/compiler pauses remain visible in high percentiles; staging targets
must be checked again against the deployed revision before release.

| Journey | Samples | Errors | Total p50 | Total p95 | Total p99 | TTFB p95 | LCP p95 | Interaction proxy p95 | Data requests p95 | D1 p95 | JSON bytes p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Saya About | 30 | 0 | 305 ms | 2,419 ms | 2,455 ms | 480 ms | 616 ms | 23 ms | 0 | 2 | 5,230 |
| Blawby About | 30 | 0 | 74 ms | 131 ms | 3,681 ms | 24 ms | 96 ms | 19 ms | 0 | n/a | n/a |
| Dashboard site overview | 30 | 0 | 343 ms | 1,475 ms | 5,430 ms | 1,340 ms | 1,440 ms | 19 ms | 0 | n/a | n/a |

`Data requests` counts browser requests to application-owned `/api/public/**`
and `/api/dashboard/**` routes. A value of zero on these hard loads confirms
that successful SSR hydration did not repeat the canonical data reads in the
browser. The D1 and byte headers are available where the document response was
finalized by the instrumented SSR provider; `n/a` is retained where the
template does not use that provider rather than inventing a value.

## Before/after architecture

Before this work, the persistent public shell and route page overlapped, public
SSR re-entered internal HTTP routes, availability and policy work grew with
experience count, dashboard state could repair missing route scope with more
requests, and eligible GET failures inherited ofetch retry behavior.

After this work:

- Application-owned clients use centralized timeouts and `retry: 0`.
- SSR invokes canonical server utilities directly.
- Shell, page, dashboard context, onboarding, activity, and guest-inbox reads
  have explicit validated contracts and visible terminal errors.
- Availability and policy statement growth is constant with experience count.
- Request metrics expose request ID, cache state, statement and batch counts,
  rows read/written, D1 time, JSON bytes, total time, and named timing phases.
- Smoke CI enforces the public query and payload ceilings.
