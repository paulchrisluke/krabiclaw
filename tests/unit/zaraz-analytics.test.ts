import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type ZarazConfig,
  reconcileZarazAnalyticsConfig,
  upsertPlatformZarazAnalytics,
  upsertTenantZarazAnalytics,
} from '../../server/utils/zaraz-analytics.ts'

function emptyConfig(): ZarazConfig {
  return { historyChange: true, consent: {}, triggers: {}, tools: {} }
}

test('tenant analytics uses the built-in CMP and host-scoped GA4 tool', () => {
  const config = emptyConfig()

  upsertTenantZarazAnalytics(config, {
    siteId: 'site-ncls',
    measurementId: 'G-NCLS',
    hostnames: ['www.northcarolinalegalservices.org'],
  })

  assert.equal(config.historyChange, false)
  assert.equal(config.consent?.enabled, true)
  assert.equal(config.consent?.hideModal, false)
  assert.equal(config.consent?.tcfCompliant, false)
  assert.equal(config.consent?.defaultLanguage, 'en')
  assert.match(config.consent?.consentModalIntroHTML ?? '', /https:\/\/krabiclaw\.com\/privacy/)
  assert.match(config.consent?.customCSS ?? '', /max-width: 26rem/)
  assert.match(config.consent?.customCSS ?? '', /dialog::backdrop/)
  assert.deepEqual(config.consent?.purposes?.kc_analytics, {
    name: 'Analytics',
    description: 'Measure site usage and advertising effectiveness so we can improve our services.',
  })
  assert.deepEqual(config.consent?.buttonTextTranslations, {
    accept_all: { en: 'Accept all' },
    confirm_my_choices: { en: 'Confirm my choices' },
    reject_all: { en: 'Reject all' },
  })

  const tool = config.tools['ga-tenant-site-ncls']
  assert.equal(tool?.defaultPurpose, 'kc_analytics')
  assert.equal(tool?.vendorName, 'Google Analytics')
  assert.equal(tool?.vendorPolicyUrl, 'https://policies.google.com/privacy')
  assert.deepEqual(tool?.actions.AllPageviews?.blockingTriggers, ['ga-tenant-site-ncls'])
})

test('platform analytics uses the same consent purpose', () => {
  const config = emptyConfig()

  upsertPlatformZarazAnalytics(config, {
    measurementId: 'G-PLATFORM',
    hostnames: ['krabiclaw.com'],
  })

  const tool = config.tools['ga-platform']
  assert.equal(config.historyChange, false)
  assert.equal(config.consent?.enabled, true)
  assert.equal(config.consent?.hideModal, false)
  assert.equal(tool?.defaultPurpose, 'kc_analytics')
  assert.deepEqual(tool?.actions.AllPageviews?.blockingTriggers, ['ga-platform'])
})

test('reconciliation keeps only desired GA4 tools and becomes a no-op', () => {
  const config = emptyConfig()
  config.tools['ga-unmanaged'] = {
    component: 'google-analytics_v4',
    name: 'Unmanaged GA4',
    enabled: true,
    settings: { tid: 'G-UNMANAGED' },
    actions: {},
  }
  config.tools['support-widget'] = {
    component: 'custom-tool',
    name: 'Support widget',
    enabled: true,
    settings: {},
    actions: {},
  }
  config.triggers['ga-unmanaged'] = { name: 'Unmanaged analytics host', loadRules: [] }

  const input = {
    platformMeasurementId: 'G-PLATFORM',
    platformHostnames: ['krabiclaw.com'],
    tenants: [{
      siteId: 'site-ncls',
      measurementId: 'G-NCLS',
      hostnames: ['northcarolinalegalservices.org', 'www.northcarolinalegalservices.org'],
    }],
  }
  const first = reconcileZarazAnalyticsConfig(config, input)

  assert.deepEqual(first, { configuredTenants: 1, removedAnalyticsTools: 1, updated: true })
  assert.equal(config.tools['ga-unmanaged'], undefined)
  assert.equal(config.triggers['ga-unmanaged'], undefined)
  assert.ok(config.tools['support-widget'])
  assert.equal(config.tools['ga-tenant-site-ncls']?.settings.tid, 'G-NCLS')
  assert.deepEqual(
    config.tools['ga-tenant-site-ncls']?.actions.AllPageviews?.blockingTriggers,
    ['ga-tenant-site-ncls'],
  )

  const second = reconcileZarazAnalyticsConfig(config, input)
  assert.deepEqual(second, { configuredTenants: 1, removedAnalyticsTools: 0, updated: false })
})
