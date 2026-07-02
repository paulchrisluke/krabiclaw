# Page Speed Debugging Methodology

This workflow is for global speed work. The goal is to avoid speculative fixes,
avoid piling on caches/custom behavior, and isolate one cost at a time.

## Core Rule

Start with the dev-only test page and prove the cost there before moving to real
tenant or platform pages.

Use:

- Raw Nitro baseline: `/__dev-perf/plain-text`
- Nuxt page baseline: `/dev/perf-text?mode=text-no-icons`
- Isolation modes: `/dev/perf-text?mode=<mode>`

Do not start with tenant images, Lighthouse on real pages, or production
PageSpeed unless the test page has already shown which global layer is under
test.

The same routes are intentionally available on production while
`PERF_PUBLIC_TEST_PAGE` is not set to `false`:

- `https://krabiclaw.com/__dev-perf/plain-text`
- `https://krabiclaw.com/dev/perf-text?mode=text-no-icons`
- `https://krabiclaw.com/dev/perf-text?mode=<mode>`

These pages are restricted to owned KrabiClaw hosts and emit `noindex,nofollow`.
Turn them off after the investigation by updating the deployed environment variable and redeploying/restarting the affected service:

```bash
PERF_PUBLIC_TEST_PAGE=false
```

The test page itself must be kept clean. Do not add top-level static imports of
large shell components, tenant components, dashboard components, or feature
trees just to use them in one isolation branch. In Vue/Vite, a statically
imported SFC enters the page chunk graph even when its `v-if` branch does not
render. Use Nuxt `Lazy*` auto-imported components or dynamic imports for branch
specific component trees.

## Measurement Order

1. Build the Cloudflare Worker artifact once.

   ```bash
   yarn build:cf
   ```

2. Run the built Worker locally.

   ```bash
   npx wrangler dev .output/server/index.mjs --assets .output/public --port 8787 --ip 127.0.0.1 --local
   ```

3. Measure server response timing with repeated curl runs.

   ```bash
   for route_path in \
     '/__dev-perf/plain-text' \
     '/dev/perf-text?mode=text-no-icons' \
     '/dev/perf-text?mode=text-with-one-icon' \
     '/dev/perf-text?mode=text-with-ui-button' \
     '/dev/perf-text?mode=text-with-i18n' \
     '/dev/perf-text?mode=text-with-analytics-plugin' \
     '/dev/perf-text?mode=text-with-layout' \
     '/dev/perf-text?mode=text-with-saya-css' \
     '/dev/perf-text?mode=icons' \
     '/dev/perf-text?mode=simple-icons'; do
     printf '\n%s\n' "$route_path"
     for i in 1 2 3 4 5; do
       curl -sS -o /tmp/kc-perf.html \
         -w "run=$i status=%{http_code} ttfb=%{time_starttransfer} total=%{time_total} size=%{size_download}\n" \
         "http://127.0.0.1:8787$route_path"
     done
   done
   ```

4. Treat the first hit separately from warm hits.

   First hits include route and chunk loading. Warm medians show steady-state
   SSR cost. A real regression should be visible beyond ordinary local noise.

5. Check Worker logs before drawing conclusions.

   Look for timeouts, unexpected self-fetches, API errors, missing bindings, and
   module loads such as icon chunks. The absence of an error is part of the
   evidence.

## Inspect The Emitted HTML

If SSR timings are flat but browser speed is poor, inspect the HTML emitted by
the test page before opening Lighthouse.

```bash
curl -sS 'http://127.0.0.1:8787/dev/perf-text?mode=text-no-icons' -o /tmp/kc-perf-no-icons.html
```

Then count the browser work the HTML asks for:

```bash
node - <<'NODE'
const fs = require('fs')
const html = fs.readFileSync('/tmp/kc-perf-no-icons.html', 'utf8')
const links = [...html.matchAll(/<link[^>]+>/g)].map((m) => m[0])
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)].map((m) => m[0])

console.log('links', links.length)
for (const link of links) {
  if (link.includes('_nuxt') || link.includes('_fonts') || link.includes('preload') || link.includes('stylesheet')) {
    console.log(link)
  }
}

console.log('\nscripts', scripts.length)
for (const script of scripts) console.log(script)

console.log('\nmodulepreload count', links.filter((link) => link.includes('modulepreload')).length)
console.log('stylesheet count', links.filter((link) => link.includes('stylesheet')).length)
NODE
```

This catches global problems that are invisible in SSR timing, such as:

- Too many `modulepreload` links on a plain text page.
- Test-page self-contamination from top-level imports of components that only
  belong to other modes.
- Large shared app chunks loaded by every route.
- Large global CSS loaded by every route.
- Global third-party scripts injected on dev/test pages.

## Browser Payload Pass

Use browser automation only after SSR and HTML inspection. The question should
be narrow: "Does this mode request more files or bytes than `text-no-icons`?"

Capture per-mode:

- Request count.
- Total local bytes.
- Resource type breakdown.
- Top largest resources.

If every mode has the same browser payload, the tested feature is not the cause.
Move the next isolation target upward to the global app shell, layout, Nuxt
config, plugins, or CSS entry.

## Production Snapshot, July 2 2026

Production measurements on the public test page showed that the raw Nitro path is
healthy, icons are no longer the issue, and the next large visible delta is the
Saya shell.

| Route / mode | LCP | FCP | TTI | TTFB | Transfer |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/__dev-perf/plain-text` | 0.81s | 0.81s | 0.81s | 0.54s | 20.9KB |
| `/dev/perf-text?mode=text-no-icons` | 1.37s | 1.37s | 4.86s | 0.60s | 518.6KB |
| `/dev/perf-text?mode=text-with-one-icon` | 1.58s | 1.50s | 4.84s | n/a | 519.0KB |
| `/dev/perf-text?mode=text-with-ui-button` | 1.54s | 1.54s | 5.72s | n/a | 518.7KB |
| `/dev/perf-text?mode=platform-shell` | 1.43s | 1.36s | 5.91s | 1.04s | 543.3KB |
| `/dev/perf-text?mode=saya-shell` | 3.00s | 2.93s | 5.97s | n/a | 597.3KB |

Interpretation:

- Raw Worker/Nitro response time is not the current bottleneck.
- Plain Nuxt still carries the global app floor: roughly 500KB of browser
  payload and around 5s TTI in local Lighthouse-style testing.
- A single icon and a single Nuxt UI button do not reproduce the 1s+ regression.
- Saya shell is the first current target because it doubles LCP/FCP relative to
  the plain text Nuxt baseline on the same production deployment.

Next isolation modes to add and measure before broad changes:

- `saya-header` - Saya header only.
- `saya-footer` - Saya footer only.
- `saya-static-shell` - same visible shell markup with expensive composables,
  menus, dynamic media, and interactive branches removed.

Compare each mode against `text-no-icons` and `saya-shell` for LCP/FCP, TTI,
HTML bytes, modulepreload count, stylesheet count, total transferred bytes, and
top resources.

## Evidence Needed Before A Change Request

For every proposed optimization, record:

- Baseline route and mode.
- Changed route and mode.
- First-hit timing.
- Warm median timing.
- Response size.
- Browser request count and total bytes, if the issue is client-side.
- Relevant emitted HTML difference, especially `link rel="modulepreload"`,
  stylesheet, script, image, and font tags.
- Worker log warnings/errors.

Do not ask for broad changes from a single Lighthouse score. Lighthouse is useful
after isolation, not as the first debugging instrument.

## Current Known Results

As of July 2, 2026, the icon SSR timeout was reproduced and fixed locally:

- Before: icon modes hit Nuxt Icon timeout behavior around 1.5s.
- After the local icon bundle fix: icon modes render in roughly the same warm
  SSR range as the no-icons baseline, with no icon timeout warnings.

Also on July 2, 2026, the perf test page itself was found to be contaminating
the browser-payload measurement: top-level imports of `PlatformHeader`,
`PlatformFooter`, `SayaHeader`, and `SayaFooter` caused `text-no-icons` to
preload shell dependency trees even though those branches did not render. The
fix was to use Nuxt `Lazy*` component imports for those branch-specific shells.

After that fix, `text-no-icons` dropped from 35 modulepreloads to 6
modulepreloads. App-shell flags for `UApp`, `NuxtLoadingIndicator`, and
bootstrap/head work did not move the modulepreload count. The remaining global
floor to investigate is the shared entry JavaScript and global `entry.css`.

Additional July 2 findings:

- Tailwind/global CSS is huge in bytes: removing Tailwind from the build reduced
  `entry.css` from about 304KB to about 21KB. However, local LCP only moved from
  about 2.27s to about 2.11s, so this is probably a 100-300ms class issue, not
  the next 1s+ win.
- `@nuxt/ui` is real client weight: about 69KB gzip in the entry stack, but a
  full removal requires a UI migration and the rough expected gain is closer to
  a few hundred milliseconds than the icon win.
- GA4 is real network/TTI weight, but not an LCP blocker on the text page. The
  current strategy is to delay it aggressively rather than keep testing it as
  the main LCP cause.
- `plugins/dompurify-hooks.client.ts` was not material on the text-page
  benchmark.
- Font changes did not produce a measurable global win on `/dev/perf-text`; they
  may still help real tenant pages if they reduce actual font requests.

## Tenant HAR / Pingdom Follow-Up Queue

The production test page currently shows good raw Worker/Nitro TTFB, but the
attached tenant HAR/Pingdom evidence showed a real tenant `/` at about 3661ms,
with about 3103ms waiting and `cfWorker;dur=2376`. Treat that as a
tenant-specific server/data-path investigation, not as proof that the global
text page is slow.

Investigate these in order after the Saya shell isolation:

1. **Public tenant HTML edge caching.** Confirm whether public tenant HTML is
   actually served from Cloudflare edge cache by `host + path + locale`. Bypass
   `/dashboard`, `/admin`, `/api`, auth, preview, draft, and edit-mode routes.
   Route headers alone are not proof if the Worker still runs on every request.
2. **Tenant SSR self-fetch in `useBootstrap`.** Verify whether tenant SSR still
   calls `/api/public/sites/:siteId/bootstrap` through `useRequestFetch`. If yes,
   move the bootstrap query/build logic from
   `server/api/public/sites/[siteId]/bootstrap.get.ts` into a shared server
   function and call it directly from SSR and the API route.
3. **Bootstrap cache TTL and invalidation.** If bootstrap data is public and
   content-like, test a 300-900s TTL with explicit purge on site/content/menu
   media updates.
4. **Duplicate Cloudflare Image variants.** The HAR showed the same image loaded
   as both a sized variant and `/public`. Render only sized variants for the
   actual display dimensions; reserve `/public` for assets that are already
   small or genuinely need the original variant.
5. **Initial JS namespace split.** The entry chunk is still about 513KB
   uncompressed / 175KB transferred in the HAR. Check whether global component
   auto-registration is pulling platform/admin/editor/billing/dashboard code into
   public tenant pages, and prefer public-only auto-imports or explicit imports.
6. **Global CSS split.** `entry.css` remains about 303KB uncompressed. Tailwind is
   not the top 1s lever on the text page, but splitting platform/admin/editor CSS
   away from tenant CSS is still a valid byte-budget project.
7. **Below-fold post media.** In `pages/index.vue`, recent post images/videos
   should be lazy: images with `loading="lazy"` and videos with `preload="none"`
   or deferred creation until visible.
8. **Regression budgets.** Add CI or script budgets for TTFB, JS transfer, CSS
   transfer, total image bytes, and duplicate image URL detection. The HAR
   baseline to track against is roughly: 5.5s fully loaded, 978KB transferred,
   175KB JS, 41KB CSS, and 682KB images.
