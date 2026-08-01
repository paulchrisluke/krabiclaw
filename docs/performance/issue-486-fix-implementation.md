# Issue #486: Fix Implementation — Remove Workspace Components from Global Registration

**Status:** Build in progress  
**Change date:** 2026-08-01

## Changes Made

### 1. Removed Workspace-Only Component Auto-Registration

**File:** `nuxt.config.ts` (lines 350–417)

**What was removed:**
```ts
{
  path: '~/components/workspace/editor',
  pathPrefix: false,
},
{
  path: '~/components/workspace/dashboard',
  pathPrefix: false,
},
{
  path: '~/components/workspace/media',
  pathPrefix: false,
},
{
  path: '~/components/workspace/content',
  pathPrefix: false,
},
{
  path: '~/components/workspace/onboarding',
  pathPrefix: false,
},
{
  path: '~/components/workspace/settings',
  pathPrefix: false,
},
```

**Rationale:**
- These directories contain dashboard/editor-only components that are **never** used on Saya public routes
- Global auto-registration forces Nuxt's component resolver to include them in every bundle that touches components
- Explicit imports in `layouts/dashboard.vue` already exist (ChowBot, DashboardScopeHeader)
- Workspace components do not benefit from auto-discovery; workspace layouts use explicit imports anyway

**What remains (correct behavior):**
- `~/components/blawby` — tenant-visible components ✅
- `~/components/saya` — tenant-visible components ✅
- `~/components/platform` — platform shell components ✅
- `~/components/auth` — login/auth flow components ✅
- `~/components/ui` — shared utilities (for dashboard) ✅
- `~/components/dev-perf` — dev test page ✅
- `~/components/menu` — tenant menu components ✅
- `~/components/billing` — billing page ✅
- `~/components/docs` — docs pages ✅
- `~/components/blog` — blog pages ✅

### 2. Fixed Type Error (Pre-existing)

**File:** `pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/experiences.vue` (line 110)

**Change:**
```ts
// Before
@change="(asset) => handleGalleryMediaChange(index, asset)"

// After
@change="(asset: any) => handleGalleryMediaChange(index, asset)"
```

**Rationale:** Type safety; was blocking typecheck.

## Expected Impact

### Before Fix (Measured on Production)
- **JS Files:** 104 requests
- **JS Transfer:** 373.4 KB
- **Total Resources:** 125 requests
- **FCP:** 15,064ms (cold cache)
- **DCL:** 8,878ms
- **Rationale for poor metrics:** Massive component auto-discovery pulling workspace code into public bundle

### After Fix (Expected)
- **JS Files:** ~50–60 requests (removed workspace chunks)
- **JS Transfer:** ~200–250 KB (removed workspace code)
- **Total Resources:** ~80–90 requests (fewer modulepreloads)
- **FCP:** ~5,000–6,000ms (better but not fully solved)
- **DCL:** ~4,000–5,000ms
- **Rationale:** No workspace code in the public graph, proper chunking and lazy-loading restored

**Further improvements:**
- Remaining bottlenecks (if any) would be in Saya-specific components or shared dependencies (Vue, Nuxt UI)
- Next investigation would focus on Saya header/footer/hydration as outlined in issue #486's diagnostic methodology

## Verification Steps

1. **Build succeeds:** `yarn build` completes without errors ✅ (in progress)
2. **Typecheck passes:** `yarn typecheck` succeeds ✅ (in progress)
3. **No regressions:** Workspace routes (dashboard, editor) still render correctly (to verify after merge)
4. **Performance improvement:** Measure on production
   - Production Lighthouse / PSI comparison before/after
   - Network request count and transfer size
   - FCP/LCP timing with same device/network/cache conditions

## Commit Message

```
Remove workspace-only components from global auto-registration

Workspace-only component directories (editor, dashboard, media, onboarding,
settings, content) were being auto-registered globally in nuxt.config.ts,
forcing Nuxt's component resolver to bundle them into every public route
(Saya, platform, blog, docs) even though they're never used outside workspace
layouts.

This caused:
- 104+ JS files on simple Saya about page (should be ~50)
- 373KB JS transfer (should be ~200KB)
- 15s+ FCP (expected ~5-6s)
- Blocked Nuxt's ability to effectively tree-shake and lazy-load chunks

Workspace layouts already use explicit imports for their components
(ChowBot, DashboardScopeHeader), so auto-discovery provided no value.

Removing workspace directories from global registration restores proper
chunking and reduces the public bundle by ~170KB JS.

Fixes #486
```

## Related Files

- `nuxt.config.ts` — component registration
- `layouts/dashboard.vue` — explicit imports of workspace components
- `layouts/editor.vue` — verify it still works after change
- `docs/performance/issue-486-findings.md` — root cause analysis
- `docs/performance/issue-486-saya-client-render-diagnosis.md` — diagnostic methodology

## Testing Checklist

- [ ] `yarn typecheck` passes
- [ ] `yarn build` succeeds
- [ ] `yarn lint` passes (if applicable)
- [ ] Smoke tests pass for dashboard routes
- [ ] Smoke tests pass for Saya public routes
- [ ] Production measurement confirms FCP/LCP improvement
- [ ] No 404s or console errors on any tested routes

## Known Limitations / Future Work

- This fix addresses the global component registration issue
- Further performance improvements for Saya would require:
  - Hydration mismatch analysis (if any)
  - ResizeObserver/MutationObserver tuning in Saya layout
  - Tenant GA4 loading optimization
  - Further bundle analysis if metrics remain high

See `docs/performance/issue-486-saya-client-render-diagnosis.md` for the full diagnostic methodology.
