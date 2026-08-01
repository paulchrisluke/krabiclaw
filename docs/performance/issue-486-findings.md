# Issue #486: Saya Client-Render Bottleneck — Diagnostic Findings

**Date:** 2026-08-01  
**Status:** Root cause identified, fix ready to implement

## Production Measurements

**Route:** `pottery-house.krabiclaw.com/about` (cold cache)

| Metric | Measured | Expected | Delta |
|--------|----------|----------|-------|
| TTFB | 3,587ms | 550–690ms | +2,897ms (cache miss) |
| FCP | 15,064ms | ~5,000ms | +10,064ms ⚠️ |
| DCL | 8,878ms | ~3,000ms | +5,878ms ⚠️ |
| JS Files | 104 | ~20–30 | +74 files ⚠️ |
| JS Transfer | 373.4 KB | ~150 KB | +223 KB ⚠️ |
| Total Resources | 125 | ~50 | +75 requests ⚠️ |

## Root Cause: Workspace Code in Public Bundle

**Finding:** Workspace-only component directories are **globally auto-registered** in `nuxt.config.ts` (lines 381–408):

```ts
components: [
  { path: '~/components/workspace/editor', pathPrefix: false },      // ← Workspace-only
  { path: '~/components/workspace/dashboard', pathPrefix: false },    // ← Workspace-only
  { path: '~/components/workspace/media', pathPrefix: false },        // ← Workspace-only
  { path: '~/components/workspace/onboarding', pathPrefix: false },   // ← Workspace-only
  { path: '~/components/workspace/settings', pathPrefix: false },     // ← Workspace-only
  { path: '~/components/workspace/content', pathPrefix: false },      // ← Workspace-only
  // ... public components mixed in, preventing effective chunking
]
```

**Impact:** These workspace directories are:
1. Never used on Saya public routes
2. Never used on platform marketing routes
3. Auto-discovered and bundled into **every** chunk that touches component registration
4. Preventing Nuxt's automatic code splitting from working effectively
5. Causing 104+ JS files to load on a simple about page

**Evidence:**
- Build output shows 403 total JS files (should be ~40–50 for proper chunking)
- Two massive entry chunks: 439KB and 384KB raw (uncompressed)
- DCL at 8.8s indicates hydration is being blocked by JS parsing/execution

## Why This Wasn't Caught Earlier

The HANDOFF document from 2026-07-02 noted this as "not yet investigated":

> **Not yet investigated at all this session** (real candidates, deferred earlier as "Phase 3 — hydration weight"): 3.4MB JS across 262 chunks (largest chunk 502KB), full component auto-discovery registering platform+dashboard+editor+saya+ui namespaces even on tenant-only pages

The workspace isolation work in CLAUDE.md (`docs/adr/0019-progressive-drill-in-dashboard-sidebar.md`) described moving components under workspace namespaces, but the Nuxt config component registration was **not** adjusted to conditionally register them only on workspace routes.

## Fix Strategy

Remove workspace-only directories from the global component registration. Instead, they should be:

1. **Option A (Recommended):** Delete them from the global list. Workspace layouts (`dashboard.vue`, `editor.vue`) should use explicit imports instead of auto-discovery.
2. **Option B:** Use Nuxt 4's `components: { dirs: [...]}` conditional registration based on route context.

Option A is simpler and aligns with the CLAUDE.md intent: workspace-only code should not touch the public graph at all.

## Next Steps

1. Remove workspace-only paths from `components` registration in `nuxt.config.ts`
2. Add explicit imports in workspace layouts where needed
3. Rebuild and re-measure
4. Verify FCP/LCP improvement on production after deploy

---

## Quick Analysis: What Should Be Global vs. Scoped

**Global (public/shared):**
- `components/blawby` ✅ (tenant-visible)
- `components/saya` ✅ (tenant-visible)
- `components/platform` ✅ (platform shell)
- `components/auth` ✅ (login/invite/transfer pages)
- `components/ui` ✅ (shared utilities)
- `components/dev-perf` ✅ (dev-only test page)
- `components/menu` ✅ (tenant menu)
- `components/billing` ✅ (platform billing page)
- `components/docs` ✅ (platform docs)
- `components/blog` ✅ (platform blog)

**Workspace-only (should NOT be global):**
- `components/workspace/editor` ❌ Never on public routes
- `components/workspace/dashboard` ❌ Never on public routes
- `components/workspace/media` ❌ Never on public routes
- `components/workspace/onboarding` ❌ Never on public routes
- `components/workspace/settings` ❌ Never on public routes
- `components/workspace/content` ❌ Never on public routes

The current config registers workspace/* globally, making every component in those directories available to the Nuxt component resolver even when rendering a Saya tenant page. This prevents Nuxt from effectively tree-shaking or lazy-loading them.
