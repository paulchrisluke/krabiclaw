# Public performance verification

Cache hits are a warm-path optimization. They are not evidence that a new
visitor can load a page quickly. Every performance change must be measured on a
cold public request first; cache-hit numbers are reported separately.

## Cold-path check

Build and run the production-style Worker:

```bash
yarn build
npx wrangler dev workers/app-entry.ts --assets .output/public --local --port 8787
```

Use a preview-shaped host so the Worker deliberately skips public HTML and
resource caches. The preview tenant header selects the fixture without relying
on a custom-domain DNS setup:

```bash
curl -sS -D /tmp/public-cold.headers -o /dev/null \
  -H 'Host: staging.foo.localhost' \
  -H 'x-preview-tenant: site-demo' \
  -H 'cache-control: no-store' \
  'http://localhost:8787/preview/site/site-demo/about?probe=unique-value'
```

Record `server-timing`, `x-d1-duration-ms`, `x-d1-query-count`,
`x-response-bytes`, `x-total-duration-ms`, and the browser navigation/LCP
timings. Repeat only for the representative routes under investigation. The
blocking check is that the uncached browser journey is under the product target
without requiring a KV hit.

For browser verification, use a fresh navigation on the preview-shaped host
and confirm that the selected public surface loads only its own CSS and route
code. A unique query string prevents the HTML URL from being reused, but it
does not invalidate browser-cached assets; use a fresh build hash or a fresh
browser context when asset-cache state matters.

## Warm-path check

Only after the cold check passes, verify the optional cache behavior. On a
production host without a session cookie, hit the same URL twice and inspect:

```bash
curl -sS -D /tmp/public-warm-1.headers -o /dev/null 'https://<tenant-host>/'
curl -sS -D /tmp/public-warm-2.headers -o /dev/null 'https://<tenant-host>/'
```

The second response may be `x-edge-cache: HIT`, or a public JSON resource may
report its own cache hit. A miss or cache outage must still execute the one
canonical source load and return its real error; it must not select stale,
static, alternate-endpoint, demo, or empty substitute data.

Do not use a warm hit to claim the cold performance target, and do not add a
benchmark suite merely to repeat these request-contract checks.
