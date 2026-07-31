import assert from 'node:assert/strict'
import test from 'node:test'
import {
  checkGlobalFetchAndRetry,
  checkBannedSilentEmptySuccessNames,
  checkSilentEmptyCatch,
  checkLegacyFallbackFlag,
  checkDashboardFetchUsage,
  checkAdminFetchUsage,
} from '../../scripts/lib/data-loading-guardrails.mjs'

test('checkGlobalFetchAndRetry flags globalThis.$fetch mutation', () => {
  const violations = checkGlobalFetchAndRetry('file.ts', 'globalThis.$fetch = wrapped')
  assert.equal(violations.length, 1)
  assert.match(violations[0], /globalThis\.\$fetch/)
})

test('checkGlobalFetchAndRetry flags a non-zero retry value', () => {
  const violations = checkGlobalFetchAndRetry('file.ts', 'await $fetch(url, { retry: 1 })')
  assert.equal(violations.length, 1)
  assert.match(violations[0], /retry must be 0/)
})

test('checkGlobalFetchAndRetry passes retry: 0 and clean source', () => {
  assert.deepEqual(checkGlobalFetchAndRetry('file.ts', 'await $fetch(url, { retry: 0 })'), [])
  assert.deepEqual(checkGlobalFetchAndRetry('file.ts', 'const x = 1'), [])
})

test('checkBannedSilentEmptySuccessNames flags the deleted fetchMenuCurrency helper', () => {
  const violations = checkBannedSilentEmptySuccessNames('file.ts', 'export async function fetchMenuCurrency() {}')
  assert.equal(violations.length, 1)
  assert.match(violations[0], /fetchMenuCurrency/)
})

test('checkBannedSilentEmptySuccessNames passes unrelated source', () => {
  assert.deepEqual(checkBannedSilentEmptySuccessNames('file.ts', 'export function getDefaultCurrency() {}'), [])
})

test('checkSilentEmptyCatch flags .catch(() => []) on a canonical loader', () => {
  const violations = checkSilentEmptyCatch('server/utils/public-page.ts', 'const rows = await load().catch(() => [])')
  assert.equal(violations.length, 1)
})

test('checkSilentEmptyCatch flags .catch(() => null) and .catch(() => ({}))', () => {
  assert.equal(checkSilentEmptyCatch('f.ts', 'x.catch(() => null)').length, 1)
  assert.equal(checkSilentEmptyCatch('f.ts', 'x.catch(() => ({}))').length, 1)
})

test('checkSilentEmptyCatch flags a catch block that immediately returns an empty value', () => {
  const source = `
    try {
      return await load()
    } catch (error) {
      return []
    }
  `
  assert.equal(checkSilentEmptyCatch('f.ts', source).length, 1)
})

test('checkSilentEmptyCatch does not flag a catch that sets an error state', () => {
  const source = `
    try {
      data.value = await load()
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : 'failed'
    }
  `
  assert.deepEqual(checkSilentEmptyCatch('f.ts', source), [])
})

test('checkLegacyFallbackFlag flags a declared legacy bootstrap/fallback flag', () => {
  assert.equal(checkLegacyFallbackFlag('f.ts', 'const ENABLE_LEGACY_BOOTSTRAP = false').length, 1)
  assert.equal(checkLegacyFallbackFlag('f.ts', 'let legacyFallbackEnabled = true').length, 1)
  assert.equal(checkLegacyFallbackFlag('f.ts', 'if (legacyBootstrapOverride) return old()').length, 1)
})

test('checkLegacyFallbackFlag does not flag prose describing a past removal', () => {
  const source = '// Legacy fallback removed - old subscriptions without site_id will fail.'
  assert.deepEqual(checkLegacyFallbackFlag('f.ts', source), [])
})

test('checkDashboardFetchUsage flags raw $fetch and fetch("/api/...") in dashboard code', () => {
  assert.equal(checkDashboardFetchUsage('f.vue', 'await $fetch("/api/x")').length, 1)
  assert.equal(checkDashboardFetchUsage('f.vue', 'await fetch("/api/x")').length, 1)
})

test('checkDashboardFetchUsage passes dashboardApi/dashboardFetch usage', () => {
  assert.deepEqual(checkDashboardFetchUsage('f.vue', 'await dashboardApi("/api/x")'), [])
})

test('checkAdminFetchUsage flags both $fetch and dashboardFetch (admin needs applicationFetch)', () => {
  assert.equal(checkAdminFetchUsage('f.vue', 'await $fetch("/api/x")').length, 1)
  assert.equal(checkAdminFetchUsage('f.vue', 'await dashboardFetch("/api/x", scope, {})').length, 1)
})

test('checkAdminFetchUsage passes applicationFetch usage', () => {
  assert.deepEqual(checkAdminFetchUsage('f.vue', 'await applicationFetch("/api/x")'), [])
})
