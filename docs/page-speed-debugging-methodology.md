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

## Current Known Result

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
