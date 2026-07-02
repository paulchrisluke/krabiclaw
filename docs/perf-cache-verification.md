# Cache layer verification runbook

The `SITE_CACHE` KV cache (full-HTML `html:` keys via `server/middleware/00.edge-cache.ts` /
`server/plugins/edge-cache.ts`, and bootstrap-JSON `bs~` keys via `server/utils/bootstrap-cache.ts`)
has been patched repeatedly over time without a repeatable way to prove a fix actually worked.
This runbook is that proof step. It is manual and human-run, not CI-gated — run it yourself,
then paste the numbers into your PR description.

**Any PR touching a file in the caching layer (`server/middleware/00.edge-cache.ts`,
`server/plugins/edge-cache.ts`, `server/plugins/bootstrap-cache-invalidate.ts`,
`server/utils/bootstrap-cache.ts`, `server/utils/edge-cache.ts`, or anything that sets a
response cookie/header on a tenant page) must run this and paste the before/after numbers
into the PR description.**

## Why `nuxt dev` won't show you the truth

`nuxt dev` runs through Vite and does not code-split or dispatch internal requests the same
way the real Cloudflare Workers build does. Cache behavior, self-fetch behavior, and
middleware ordering can look fine in `nuxt dev` and still be broken in production. Always
verify against a real build.

## Steps

1. Build and run the real Worker locally:
   ```bash
   yarn build
   npx wrangler dev
   ```
2. In a second terminal, tail requests to capture `wallTime`/`cpuTime` per request:
   ```bash
   npx wrangler tail <worker-name> --format json
   ```
   (Use the deployed environment's worker name if testing against a real deploy instead of
   local `wrangler dev`.)
3. Hit the same tenant page URL twice within 60 seconds (the cache TTL):
   ```bash
   curl -sD - -o /dev/null -H "Host: <tenant>.localhost:8787" http://localhost:8787/
   curl -sD - -o /dev/null -H "Host: <tenant>.localhost:8787" http://localhost:8787/
   ```
4. Confirm the **first** request is a cache MISS: no `x-edge-cache` response header, full SSR
   timing in the tail output.
5. Confirm the **second** request is a cache HIT: `x-edge-cache: HIT` response header, and a
   large drop in `wallTime`/`cpuTime` in the tail output.
6. **Baseline for comparison** (captured 2026-07-01, production, `www.potteryhousekrabi.com`,
   after fixing the Set-Cookie bug that was defeating the HTML cache entirely):
   - MISS: `wallTime: 2296ms`, `cpuTime: 106ms`
   - HIT: `wallTime: 281ms`, `cpuTime: 10ms`
   - ~8x wall-time reduction, ~10x CPU reduction on a hit.
   If your change doesn't move these numbers roughly this direction (or explicitly isn't meant
   to touch this path), say so in the PR description — don't just say "still returns 200."
7. Regression guard: confirm the cached HIT response does **not** carry a `Set-Cookie` header
   unless the request itself carried a real auth session cookie (`better-auth.session_token`).
   This guards against re-breaking the fix in `server/plugins/edge-cache.ts` where analytics
   tracking cookies (`kc_visitor_id`/`kc_session_id`, set on every request by
   `getOrCreateSessionId()` in `server/utils/pageview-tracking.ts`) were previously defeating
   the cache write path entirely.

## Pasting results

Paste the MISS/HIT `wallTime`/`cpuTime` pairs from step 2's tail output directly into the PR
description, in the same format as the baseline above, so reviewers can see the magnitude of
change without re-running the repro themselves.
