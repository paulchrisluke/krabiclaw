# Issue #486: Diagnosis and Root-Cause Analysis — Saya 6–7s Client-Render Bottleneck

**Status:** Diagnostic in progress  
**Scope:** Quantify and remove the remaining Saya client-render delay without repeating #480 isolation work  
**Prior art:** [HANDOFF-page-speed-2026-07-02.md](../../HANDOFF-page-speed-2026-07-02.md)

## Executive Summary

Production Saya route (`pottery-house.krabiclaw.com/about`) shows:
- **Warm TTFB:** ~0.55–0.69s (healthy)
- **Median FCP:** ~5.02s
- **Median LCP:** ~6.79s
- **Main-thread work:** ~8,059ms (from Lighthouse slow run)
  - Style/layout/unattributable: ~4,062ms
  - Document script execution: ~2,768ms

Blawby routes with similar TTFB show much lower blocking time, confirming a **real client-side Saya-specific difference** rather than a generic architecture issue.

**Goal:** Identify concrete browser tasks responsible for the remaining delay and implement the smallest fix that removes the measured bottleneck.

---

## Phase 1: Capture Representative Production Traces

### 1.1 Trace Capture Strategy

**Route and conditions:**
- Primary: `https://pottery-house.krabiclaw.com/about`
- Comparison: One equivalent Blawby route (same type of detail page)
- Browser: Chrome (latest stable)
- Device profile: Desktop (1920×1080 or standard laptop) and Mobile (iPhone 12 Pro simulated in DevTools)
- Network: Same condition for both routes
  - Option A: Production network (real WAN)
  - Option B: Local throttling (Chrome DevTools preset or custom profile)
- CPU: 6x slowdown (Chrome DevTools preset) to amplify blocking work
- Cache: Both cold and warm navigation, 3–5 runs per condition

**Why this setup:** Saya is optimized for visitor traffic, not bot traffic. Mobile cold cache often exposes cold-startup costs; warm cache shows sustained-visit behavior. 6x CPU slowdown amplifies what a slow visitor device experiences.

### 1.2 Trace Capture Commands

**Using Chrome DevTools (manual):**

1. Open DevTools → Performance tab
2. Set throttling: CPU 6x, Network "No throttling" (or Slow 4G for additional cold-start data)
3. Click ⬤ Record
4. Hard-refresh page (Ctrl+Shift+R on Windows, Cmd+Shift+R on Mac)
5. Stop recording when LCP fires (typically ~2-3s into the trace)
6. Export as JSON: ⋯ → Save all as HAR/JSON
7. Screenshot the summary stats (FCP, LCP, long tasks)

**Trace deliverables:**
- `trace-pottery-house-cold.json` (3 runs)
- `trace-pottery-house-warm.json` (3 runs)
- `trace-blawby-comparison.json` (1–2 runs, same setup)
- Annotated screenshot or summary table with FCP/LCP/long-task times

---

## Phase 2: Analyze the ~4s Style/Layout Period

### 2.1 Main-Thread Task Attribution

Open each trace in Chrome DevTools or use a trace analyzer. Extract:

| Task | Start (ms) | Duration (ms) | Category | Top Frame | File | Repetitions |
|------|-----------|--------------|----------|-----------|------|-------------|
| Hydration dom replacement | 523 | 1,247 | DOM Write | `useBootstrap` or frame | `composables/useBootstrap.ts` or layout | 1 |
| Vue render effects | 1,770 | 892 | Evaluate Script | `Vue.render` or component | app chunk | multiple |
| ResizeObserver | 2,662 | 456 | Recalculate Style | SayaHeader or SayaFooter | `layouts/saya.vue` | 3+ |
| Font reflow | 3,118 | 625 | Recalculate Style | `@font-face` or text | global CSS | 1–2 |
| TBD (trace inspection) | — | — | — | — | — | — |

**Key metrics to extract:**
- Hydration start/end time relative to FCP
- Each major Vue render/update and its duration
- Each MutationObserver/ResizeObserver callback trigger and duration
- Recalculate Style duration (when / how many times)
- Layout duration (forced reflows from DOM measurement → mutation)
- Paint / Composite duration
- DOM node count at key points (pre-hydration, post-hydration, final)
- Long-task count and total duration

### 2.2 Hypothesis Categories

**A. Hydration mismatch**
- Is the SSR DOM being replaced wholesale post-hydration?
- Are there structural mismatches requiring large rewrites?
- Signal: A 500ms+ DOM replacement task immediately post-FCP

**B. Repeated Vue render effects**
- Do reactive state updates fire many times in quick succession during mount?
- Are watchers or computed properties triggering cascading updates?
- Signal: Multiple `Vue.render` / `Vue.update` tasks within 1–2 seconds

**C. Observer callback loops**
- Do ResizeObserver/MutationObserver callbacks fire repeatedly?
- Do they trigger layout measurements followed by DOM mutations (layout thrashing)?
- Signal: Interleaved Recalculate Style → Layout → DOM Write cycles

**D. Font loading and reflow**
- Does tenant Google Analytics GA4 in `layouts/saya.vue` load custom fonts?
- Does font application trigger text reflow across the entire page?
- Signal: A Recalculate Style task >300ms duration coinciding with font load

**E. Large initial DOM or deep nesting**
- Is the initial SSR DOM oversized for the viewport?
- Are there deeply nested component trees?
- Signal: DOM node count >2000, deeply nested selectors taking >100ms to Recalculate Style

**F. Tenant-specific third-party (GA4, analytics, ads)**
- Does `layouts/saya.vue`'s tenant GA4 block rendering?
- Signal: Network request for `gtag.js` or similar visible in trace before FCP

---

## Phase 3: Add Narrow Instrumentation (if trace is unclear)

Instrumentation is **only** for traces where the category attribution is ambiguous. Use `?perf_debug=1` query param.

### 3.1 Instrumentation Points

Add `performance.mark()` / `performance.measure()` around:

```ts
// composables/useBootstrap.ts or layouts/saya.vue (during setup/mount)
performance.mark('saya:hydration:start')
// ... hydration / data fetch logic
performance.mark('saya:hydration:end')
performance.measure('saya:hydration', 'saya:hydration:start', 'saya:hydration:end')

// layouts/saya.vue
performance.mark('saya:header:setup')
// ... component setup
performance.mark('saya:header:mount')
performance.measure('saya:header', 'saya:header:setup', 'saya:header:mount')

performance.mark('saya:footer:setup')
// ... component setup
performance.mark('saya:footer:mount')
performance.measure('saya:footer', 'saya:footer:setup', 'saya:footer:mount')

// Page component (e.g., pages/about.vue or pages/[slug].vue)
performance.mark('page:component:setup')
performance.mark('page:component:mounted')
performance.measure('page:component', 'page:component:setup', 'page:component:mounted')

// Tenant GA4 in layouts/saya.vue
performance.mark('tenant:ga4:init:start')
// ... GA4 setup
performance.mark('tenant:ga4:init:end')
performance.measure('tenant:ga4:init', 'tenant:ga4:init:start', 'tenant:ga4:init:end')
```

Query the marks in the trace:
```ts
// In a script or DevTools console
performance.getEntriesByType('measure').forEach(m => console.log(`${m.name}: ${m.duration.toFixed(2)}ms`))
```

### 3.2 Removal Policy

- Instrumentation must be removed or feature-gated before merge.
- Do not commit verbose debug logging.
- If instrumentation proves valuable for ongoing diagnostics, retain it as a small, disabled facility:
  ```ts
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf_debug')) {
    performance.mark(...)
  }
  ```

---

## Phase 4: Check Hydration Determinism

Use the DevTools Rendering tab and DOM comparison.

### 4.1 Pre-Hydration vs. Post-Hydration DOM

1. **In DevTools:** Performance tab → select the hydration task → click "Rendering".
2. **Before hydration:**
   - Pause the trace at the SSR HTML fully painted moment.
   - Inspect the DOM tree depth and node count.
   - Take a screenshot: `Elements` panel showing the `<html>` subtree.

3. **After hydration:**
   - Pause the trace after the hydration task completes.
   - Compare the DOM structure.
   - Identify any subtree replacements, large reorderings, or class/attribute mutations.

### 4.2 Hydration Mismatch Signals

- **SSR output is replaced wholesale:** High likelihood the component is rendering differently on client vs. server.
  - Search for `hydration mismatch` warnings in the browser console.
  - Check if a top-level component (e.g., `SayaLayout`, `SayaHeader`) has conditional render logic that differs between SSR and client.

- **Large number of attribute mutations:** Post-hydration, if many nodes get `:class` or `:style` mutations, Vue is applying reactive state to an SSR tree. This is normal but can be expensive at scale.

---

## Phase 5: Run Evidence-Driven Disable Experiments

Each experiment targets one hypothesis and measures only the affected task.

### 5.1 Experiment Template

**Hypothesis:** [e.g., "Tenant GA4 in `layouts/saya.vue` blocks rendering"]

**Change:** [e.g., "Defer GA4 init by 2s"]

**Affected task:** [e.g., "gtag.js load / script execution"]

**Measurement:** Before/after in the same trace category (Recalculate Style duration, long-task count, FCP, LCP).

**Result:** [Yes/No] Does disabling this task improve the target metric by >200ms?

### 5.2 Candidate Experiments

1. **Disable tenant GA4 in `layouts/saya.vue`**
   - Remove or defer the GA4 initialization
   - Measure: Change in Recalculate Style duration, FCP/LCP delta
   - Revert if delta <200ms

2. **Disable one ResizeObserver or MutationObserver (if identified)**
   - Comment out the observer registration in the identified component
   - Measure: Change in Recalculate Style duration, long-task count
   - Revert if delta <200ms

3. **Replace identified web font with system fonts**
   - If fonts are confirmed as a reflow driver, use fallback or defer
   - Measure: Change in Recalculate Style duration around font load
   - Revert if delta <200ms

4. **Lazy-load below-fold Saya subtree**
   - If footer or secondary sections contribute to initial rendering, defer them
   - Measure: FCP/LCP delta
   - Revert if delta <200ms

5. **Replace Saya layout with minimal wrapper**
   - Keep the same page data, but render a bare HTML shell
   - Measure: FCP/LCP delta
   - Revert if delta >500ms (indicates page component or layout is major factor)

### 5.3 Experiment Cadence

- Run 1–2 iterations per experiment.
- Measure in the production trace, not local Lighthouse (which is slower and confounded by sandbox network).
- Record which experiments moved the needle and which did not.

---

## Phase 6: Import Chain Analysis (only after CPU owner is identified)

Do **not** start here. Only use this phase if:

1. A trace has identified a module that executes before FCP/LCP, **and**
2. A controlled experiment shows that lazily loading or removing that module reduces the measured task

### 6.1 Bundle Inspection

```bash
# Check current main chunk size
ls -lh .output/public/_nuxt/ | sort -k5 -rh | head -10

# Analyze imports via rollup visualizer or source-map-explorer
yarn build --analyze  # if available
npm inspect-bundle    # if available
```

### 6.2 Import Chain Tracing

If a module must be lazy-loaded:

```bash
# Find all imports of a module
grep -r "import.*ModuleName" server/ composables/ utils/ --include="*.ts" --include="*.vue"

# Trace the chain from public entry point
# e.g., if useBootstrap imports a heavy utility, check if useBootstrap is used on public routes
```

---

## Phase 7: Acceptance Criteria Checklist

Before considering a fix complete:

- [ ] **Trace captured:** Representative cold/warm traces for Saya and a comparison route
- [ ] **Tasks attributed:** Top main-thread tasks between response arrival and LCP are named and assigned to concrete owners
- [ ] **~4s period resolved:** The style/layout/unattributable interval is broken down into actual browser work
- [ ] **Prior art referenced:** HANDOFF document is cited; no re-inventing of #480 solutions
- [ ] **Experiments run:** At least one controlled single-variable experiment confirms/rejects the leading cause
- [ ] **Fix improves target:** The accepted change improves the exact trace category it targets (e.g., Recalculate Style duration, long-task count)
- [ ] **Same conditions:** Base/head comparison uses same route, fixture, runner settings, and release SHA
- [ ] **Invariants intact:** #480 request, SSR, retry, hydration, fail-fast rules remain unbroken
- [ ] **Tests pass:** `yarn typecheck`, `yarn lint`, `yarn build`
- [ ] **Smoke coverage:** Focused suite passes for the changed route and ownership boundaries
- [ ] **No bundle-size claims:** Improvement is measured in task execution time, not just bytes transferred

---

## Deliverable: Update to HANDOFF or Successor Document

Once diagnosis is complete and fix is merged, add a section to `HANDOFF-page-speed-2026-07-02.md` (or a new successor doc) with:

```markdown
## Issue #486: Client-render bottleneck root cause and fix (2026-08-XX)

**Route:** pottery-house.krabiclaw.com/about (and all Saya routes)
**Release SHA:** [commit hash]
**Trace settings:** Chrome DevTools, 6x CPU slowdown, [network condition]

### Root Cause

[Concrete owner of the ~4s style/layout period]

### Top Tasks (before fix)

| Task | Duration | Category | Owner |
|------|----------|----------|-------|
| ... | ... | ... | ... |

### Experiments Rejected

[Why each major hypothesis was ruled out by evidence]

### Accepted Fix

[One-sentence description of the change, file/function, why it matters]

### Results

**Before fix:**
- FCP: 5.02s
- LCP: 6.79s
- Main-thread work: 8,059ms

**After fix:**
- FCP: X.XXs
- LCP: X.XXs
- Main-thread work: X,XXXms

**Delta:** [Specific task reduced by Yms]

### Remaining Floor

[If there is still room for improvement, describe the next smallest lever]
```

---

## Notes and Constraints

- **Do not repeat #480 isolation work.** The self-fetch elimination, SSR batching, fail-fast paths, and hydration architecture from PR #480 are final. Preserve them.
- **Do not begin a full Nuxt refactor without trace evidence.** Architectural changes (component islands, lazy hydration, deployment splits) are justified only if a trace and experiment clearly show they fix the measured bottleneck.
- **Do not run 30-sample benchmarks.** Use 3–5 representative runs; spend the time on trace analysis instead.
- **Real production URL is the source of truth.** Local Lighthouse (`nuxt dev` + `wrangler dev`) is for direction only; production PSI or real Chrome traces are the ground truth.
- **Single-variable experiments only.** Each experiment changes one thing. Do not combine hypothesis fixes and hope to attribute the delta.

---

## Quick Reference: Files to Watch

**Data loading & bootstrap:**
- `composables/useBootstrap.ts`
- `composables/useBootstrapParams.ts`
- `server/api/public/sites/[siteId]/bootstrap.get.ts`
- `server/utils/site-shell-service.ts`

**Saya layout & components:**
- `layouts/saya.vue`
- `components/saya/SayaHeader.vue`
- `components/saya/SayaFooter.vue`
- `components/saya/SayaHero.vue`

**Tenant analytics:**
- `layouts/saya.vue` (GA4 init)
- `server/utils/whatsapp.ts` (if relevant to timing)

**Hydration & SSR:**
- `app.vue`
- `server/api/public/sites/[siteId]/shell.get.ts`
- Nuxt SSR middleware and hydration hooks (Vue/Nuxt docs)

**Shell and page routes:**
- `pages/*.vue` (all Saya routes)
- `server/plugins/*.ts` (Nitro plugins that run on SSR)

---

## Related Issues & PRs

- PR #480: Data loading architecture fixes (self-fetch elimination, batching, fail-fast)
- HANDOFF-page-speed-2026-07-02.md: Prior work, confirmed findings, GA4/Zaraz, shell isolation
- `docs/performance/performance-recovery-2026-07.md`: Earlier recovery work
- Issue #316: (check for Nuxt UI usage historical context)

---

**Next step:** Capture 3–5 production traces and post findings to this document.
