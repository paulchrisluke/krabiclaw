import assert from 'node:assert/strict'
import test from 'node:test'
import { reconcileZarazAnalyticsConfig, type ZarazConfig } from '../../server/utils/zaraz-analytics.ts'

test('reconciliation removes duplicate GA senders and gates pageviews without a system pageload trigger', () => {
  const tool = { component: 'google-analytics_v4', name: 'GA', enabled: true, settings: { tid: 'G-TEST' }, actions: {
    AllPageviews: { actionType: 'pageview', enabled: true, firingTriggers: ['Pageview'] },
    AllTracks: { actionType: 'event', enabled: true, firingTriggers: ['AllTracks'] },
  } }
  const config: ZarazConfig = { tools: { 'ga-platform': tool, 'ga-tenant-platform': structuredClone(tool) },
    triggers: { AllTracks: { loadRules: [] } }, historyChange: true }
  const input = { tenants: [{ organizationId: 'platform', measurementId: 'G-TEST', hostnames: ['example.com'] }] }
  assert.equal(reconcileZarazAnalyticsConfig(config, input).removedAnalyticsTools, 1)
  assert.equal(config.historyChange, false)
  assert.deepEqual(config.tools['ga-tenant-platform']!.actions.AllPageviews!.firingTriggers, ['krabiclaw-native-pageview'])
  assert.equal(config.triggers['krabiclaw-native-pageview']!.system, undefined)
  assert.equal((config.triggers.AllTracks!.loadRules as unknown[]).length, 1)
  assert.equal(reconcileZarazAnalyticsConfig(config, input).updated, false)
})
