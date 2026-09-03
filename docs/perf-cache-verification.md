# Public performance verification

Cache hits are a warm-path optimization. They are not evidence that a new
visitor can load a page quickly. Every performance change must be measured on a
cold public request first; cache-hit numbers are reported separately.

## Cold-path check

Build and run the production-style Worker:

```bash
corepack yarn build
corepack yarn wrangler dev .output/server/index.mjs --assets .output/public --local --port 8787
```

Use a preview-shaped host so the Worker deliberately skips public HTML and
resource caches. The preview tenant header selects the fixture without relying
on a custom-domain DNS setup:

```bash
probe_id="$(uuidgen)"
cold_status="$(curl --fail-with-body -sS -D /tmp/public-cold.headers -o /tmp/public-cold.body \
  -w '%{http_code}' \
  -H 'Host: staging.foo.localhost' \
  -H 'x-preview-tenant: site-demo' \
  -H 'cache-control: no-store' \
  "http://localhost:8787/preview/site/site-demo/about?probe=${probe_id}")" || {
  echo "Cold request failed" >&2
  sed -n '1,80p' /tmp/public-cold.body >&2
  exit 1
}
test "$cold_status" = 200 || {
  echo "Unexpected cold HTTP status: $cold_status" >&2
  sed -n '1,80p' /tmp/public-cold.body >&2
  exit 1
}
rg -q '<html' /tmp/public-cold.body || {
  echo 'Cold response did not contain the canonical HTML payload' >&2
  exit 1
}
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
for sample in 1 2; do
  warm_status="$(curl --fail-with-body -sS -D "/tmp/public-warm-${sample}.headers" -o "/tmp/public-warm-${sample}.body" \
    -w '%{http_code}' 'https://<tenant-host>/')" || {
    echo "Warm request ${sample} failed" >&2
    sed -n '1,80p' "/tmp/public-warm-${sample}.body" >&2
    exit 1
  }
  test "$warm_status" = 200 || {
    echo "Unexpected warm HTTP status for sample ${sample}: $warm_status" >&2
    sed -n '1,80p' "/tmp/public-warm-${sample}.body" >&2
    exit 1
  }
  rg -q '<html' "/tmp/public-warm-${sample}.body" || {
    echo "Warm response ${sample} did not contain the canonical HTML payload" >&2
    exit 1
  }
done
```

The second response may be `x-edge-cache: HIT`, or a public JSON resource may
report its own cache hit. Check both captured status lines and response bodies
for a successful canonical payload; a miss or cache outage must still execute
the one canonical source load and return its real error. It must not select
stale, static, alternate-endpoint, demo, or empty substitute data.

Do not use a warm hit to claim the cold performance target, and do not add a
benchmark suite merely to repeat these request-contract checks.
