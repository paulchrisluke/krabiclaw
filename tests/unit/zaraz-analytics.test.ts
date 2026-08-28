import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type ZarazConfig,
  reconcileZarazAnalyticsConfig,
  upsertPlatformZarazAnalytics,
  upsertTenantZarazAnalytics,
} from '../../server/utils/zaraz-analytics.ts'

function configWithLegacyConsentBlocker(): ZarazConfig {
  return {
    historyChange: true,
    consent: { enabled: false, hideModal: true },
    triggers: {
      'ga-consent-not-accepted': {
        name: 'Analytics consent not accepted',
        loadRules: [{ match: '{{ system.cookies.kc_consent }}', op: 'NOT_MATCH_REGEX', value: '^accepted$' }],
      },
    },
    tools: {
      existing: {
        component: 'google-analytics_v4',
        name: 'Existing GA4',
        enabled: true,
        settings: { tid: 'G-EXISTING' },
        defaultFields: {},
        actions: {
          AllPageviews: {
            actionType: 'pageview',
            firingTriggers: ['Pageview'],
            blockingTriggers: ['ga-consent-not-accepted', 'keep-this-blocker'],
            enabled: true,
          },
        },
      },
    },
  }
}

test('tenant Zaraz sync enables the visible built-in CMP and assigns GA4 to its purpose', () => {
  const config = configWithLegacyConsentBlocker()

  upsertTenantZarazAnalytics(config, {
    siteId: 'site-ncls',
    measurementId: 'G-NCLS',
    hostnames: ['www.northcarolinalegalservices.org'],
  })

  assert.equal(config.historyChange, false)
  assert.equal(config.consent?.enabled, true)
  assert.equal(config.consent?.hideModal, false)
  assert.equal(config.consent?.tcfCompliant, true)
  assert.equal(config.consent?.defaultLanguage, 'en')
  assert.match(config.consent?.consentModalIntroHTML ?? '', /https:\/\/krabiclaw\.com\/privacy/)
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
  assert.equal(config.triggers['ga-consent-not-accepted'], undefined)
  assert.equal(config.tools.existing?.defaultPurpose, 'kc_analytics')
  assert.equal(config.tools.existing?.vendorName, 'Google Analytics')
  assert.equal(config.tools.existing?.vendorPolicyUrl, 'https://policies.google.com/privacy')
  assert.deepEqual(config.tools.existing?.actions.AllPageviews?.blockingTriggers, ['keep-this-blocker'])
})

test('platform Zaraz sync uses the same CMP purpose and disables automatic history tracking', () => {
  const config = configWithLegacyConsentBlocker()

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
  assert.equal(config.triggers['ga-consent-not-accepted'], undefined)
})

test('scheduled reconciliation upgrades existing tenants, removes stale tools, and becomes a no-op', () => {
  const config = configWithLegacyConsentBlocker()
  config.tools['ga-tenant-stale'] = {
    component: 'google-analytics_v4', name: 'Stale tenant', enabled: true,
    settings: { tid: 'G-STALE' }, actions: {},
  }
  config.triggers['ga-tenant-stale'] = { name: 'Stale tenant host', loadRules: [] }

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

  assert.deepEqual(first, { configuredTenants: 1, removedTenantTools: 1, updated: true })
  assert.equal(config.tools['ga-tenant-stale'], undefined)
  assert.equal(config.triggers['ga-tenant-stale'], undefined)
  assert.equal(config.tools['ga-tenant-site-ncls']?.settings.tid, 'G-NCLS')
  assert.deepEqual(
    config.tools['ga-tenant-site-ncls']?.actions.AllPageviews?.blockingTriggers,
    ['ga-tenant-site-ncls'],
  )

  const second = reconcileZarazAnalyticsConfig(config, input)
  assert.deepEqual(second, { configuredTenants: 1, removedTenantTools: 0, updated: false })
})
