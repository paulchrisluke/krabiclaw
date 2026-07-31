# API fallback and retry audit

Audit date: 2026-07-31. Scope: shipped public-renderer and dashboard/CMS request
paths. Queue/provider delivery retries and non-shipped maintenance scripts do
not execute in these user request paths.

| Path | Function/line | Old behavior | Why it was harmful | Action taken | Regression test |
| --- | --- | --- | --- | --- | --- |
| `plugins/dashboard-site-header.client.ts` | plugin install | Mutated `globalThis.$fetch` and inferred scope from ambient route state | Client-only behavior, implicit scope, and globally coupled requests | Deleted; callers use scoped `dashboardFetch` | `lint:data-loading` rejects global fetch references and direct dashboard `$fetch` |
| `composables/useDashboardSite.ts` | `refresh`, `useDashboardSiteId` | Shared nullable context and a slug-mismatch repair refresh | Duplicate context requests and stale cross-route state | State is keyed by org/site; identical refreshes coalesce; no mismatch repair request | typecheck plus dashboard E2E |
| `layouts/dashboard.vue` | SSR/client initialization | Client mount could repeat a failed/absent SSR context load | Hydration waterfall and second automatic attempt | Successful keyed SSR state suppresses the mount load; errors remain terminal | dashboard hydration E2E |
| `composables/useSiteShell.ts` | shell loader | SSR self-fetch; shell requested full menu and experiences | Re-entered Nitro and duplicated large route data | Direct SSR service; minimal shell contract | public navigation E2E and data-loading guard |
| `composables/useBootstrap.ts` | page loader | Awaited route data blocked navigation; SSR self-fetch | Frozen prior route and nested Worker dispatch | Non-blocking keyed async data; direct SSR service; typed browser client | tenant client-navigation E2E |
| `server/utils/experiences.ts` | `attachAvailabilitySummaries` | Location lookup plus timezone, booking, and override queries per experience, serially | Query count and latency grew with experience count | Four bulk reads and in-memory indexes/calculation | experience availability contract tests |
| `server/utils/booking-policies.ts` | `resolveBookingPolicy` bootstrap callers | Re-read site/location/experience hierarchy per target | Query count grew with locations and experiences | `resolveBookingPolicyIndex` performs one read per policy type | booking-policy precedence tests |
| `server/utils/bootstrap-cache.ts` | cache read/write | Corrupt cache parse fell through; cache write errors were caught | Acceptable only if the canonical source runs once and remains authoritative | Corrupt entry causes one source load; write failure logs after successful load | cache behavior integration tests |
| dashboard/CMS pages and composables | API calls | Direct `$fetch` depended on the global mutation and ofetch retry defaults | Hidden scope and automatic replay | Migrated to `dashboardFetch` with explicit scope, timeout, and `retry: 0` | `lint:data-loading` |

