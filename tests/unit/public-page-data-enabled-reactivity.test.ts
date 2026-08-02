import test from 'node:test'
import assert from 'node:assert/strict'
import { ref, computed, watch, effectScope, toValue, type MaybeRefOrGetter } from 'vue'

// Regression coverage for usePublicPageData's `enabled` option (see
// composables/usePublicPageData.ts). The composable itself can't be unit
// tested directly — it's built on Nuxt-runtime-only APIs (useAsyncData,
// useRoute, useTenantSite, onScopeDispose) this repo has no test harness for
// (no @nuxt/test-utils dependency). This isolates the actual reactive
// mechanism the fix relies on: a resource constructed with
// `immediate: enabled.value`, plus a watcher that calls `execute()` exactly
// once on a false -> true transition and never again while already enabled.

function buildResource(options: { enabled?: MaybeRefOrGetter<boolean> }) {
  const enabled = computed(() => toValue(options.enabled) !== false)
  let executeCount = 0
  const execute = () => { executeCount += 1 }

  // Mirrors useAsyncData({ immediate: enabled.value }) — a one-time snapshot
  // taken at construction time, exactly like Nuxt's own `immediate` option.
  if (enabled.value) execute()

  const stop = watch(enabled, (isEnabled, wasEnabled) => {
    if (isEnabled && !wasEnabled) execute()
  })

  return {
    getExecuteCount: () => executeCount,
    stop,
  }
}

test('a resource that starts disabled never fetches until enabled flips true', () => {
  const scope = effectScope()
  scope.run(() => {
    const enabledRef = ref(false)
    const resource = buildResource({ enabled: enabledRef })
    assert.equal(resource.getExecuteCount(), 0, 'must not fetch while disabled')
  })
  scope.stop()
})

test('flipping enabled false -> true triggers exactly one fetch', async () => {
  const scope = effectScope()
  await scope.run(async () => {
    const enabledRef = ref(false)
    const resource = buildResource({ enabled: enabledRef })
    assert.equal(resource.getExecuteCount(), 0)

    enabledRef.value = true
    await Promise.resolve()
    assert.equal(resource.getExecuteCount(), 1, 'the false -> true edge must trigger exactly one fetch')
  })
  scope.stop()
})

test('a resource that starts enabled fetches immediately, matching current behavior', () => {
  const scope = effectScope()
  scope.run(() => {
    const resource = buildResource({ enabled: true })
    assert.equal(resource.getExecuteCount(), 1)
  })
  scope.stop()
})

test('toggling an already-enabled resource does not refetch repeatedly', async () => {
  const scope = effectScope()
  await scope.run(async () => {
    const enabledRef = ref(true)
    const resource = buildResource({ enabled: enabledRef })
    assert.equal(resource.getExecuteCount(), 1)

    // true -> true (no-op reassignment) and any change that isn't a genuine
    // false -> true edge must not trigger another fetch.
    enabledRef.value = true
    await Promise.resolve()
    assert.equal(resource.getExecuteCount(), 1)
  })
  scope.stop()
})

test('a plain boolean enabled option still fetches immediately (non-reactive callers unaffected)', () => {
  const scope = effectScope()
  scope.run(() => {
    const resourceEnabled = buildResource({ enabled: true })
    assert.equal(resourceEnabled.getExecuteCount(), 1)
    const resourceDisabled = buildResource({ enabled: false })
    assert.equal(resourceDisabled.getExecuteCount(), 0)
  })
  scope.stop()
})
