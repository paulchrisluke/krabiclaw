import assert from 'node:assert/strict'
import test from 'node:test'
import {
  removeStaleTenantZarazAnalytics,
  tenantPageLocationRegex,
  upsertPlatformZarazAnalytics,
  upsertTenantZarazAnalytics,
  type ZarazConfig,
} from '../../server/utils/zaraz-analytics.ts'

test('tenantPageLocationRegex scopes pageviews to exact active hostnames', () => {
  const pattern = new RegExp(tenantPageLocationRegex([
    'ncls.krabiclaw.com',
    'www.northcarolinalegalservices.org',
  ]))

  assert.equal(pattern.test('ncls.krabiclaw.com'), true)
  assert.equal(pattern.test('www.northcarolinalegalservices.org'), true)
  assert.equal(pattern.test('other.krabiclaw.com'), false)
  assert.equal(pattern.test('nclsXkrabiclawXcom'), false)
  assert.equal(pattern.test('https://ncls.krabiclaw.com/'), false)
})

test('platform Zaraz GA4 is scoped to platform hosts instead of every zone hostname', () => {
  const config: ZarazConfig = {
    triggers: { Pageview: { loadRules: [] } },
    tools: {
      googleAnalytics: {
        component: 'google-analytics_v4',
        name: 'Google Analytics',
        enabled: true,
        settings: { tid: 'G-NJ1BSP9BYG' },
        actions: {
          Pageview: { actionType: 'pageview', firingTriggers: ['Pageview'], enabled: true },
        },
      },
    },
  }

  upsertPlatformZarazAnalytics(config, {
    measurementId: 'G-NJ1BSP9BYG',
    hostnames: ['krabiclaw.com', 'www.krabiclaw.com'],
  })

  assert.equal(config.consent?.enabled, false)
  assert.equal(config.tools.googleAnalytics.defaultPurpose, undefined)
  assert.deepEqual(config.tools.googleAnalytics.actions.Pageview.firingTriggers, ['Pageview'])
  assert.deepEqual(config.tools.googleAnalytics.actions.Pageview.blockingTriggers, ['ga-platform', 'ga-consent-not-accepted'])

  const pattern = new RegExp(String((config.triggers['ga-platform'] as { loadRules: Array<{ value: string }> }).loadRules[0].value))
  assert.equal(pattern.test('krabiclaw.com'), true)
  assert.equal(pattern.test('www.krabiclaw.com'), true)
  assert.equal(pattern.test('www.northcarolinalegalservices.org'), false)

  const trigger = config.triggers['ga-platform'] as { system?: string, loadRules: Array<{ match: string, op: string, value: string }> }
  assert.equal(trigger.system, undefined)
  assert.equal(trigger.loadRules[0].op, 'NOT_MATCH_REGEX')
  assert.deepEqual(config.triggers['ga-consent-not-accepted'], {
    name: 'Analytics consent not accepted',
    loadRules: [{ match: '{{ system.cookies.kc_consent }}', op: 'NOT_MATCH_REGEX', value: '^accepted$' }],
  })
})

test('tenant Zaraz GA4 is scoped to active tenant hostnames and stale tenant tools are removed', () => {
  const config: ZarazConfig = {
    triggers: {
      'ga-tenant-old-site': { loadRules: [] },
    },
    tools: {
      'ga-tenant-old-site': {
        component: 'google-analytics_v4',
        name: 'Tenant GA4 (old-site)',
        enabled: true,
        settings: { tid: 'G-OLDTENANT' },
        actions: { AllPageviews: { actionType: 'pageview', firingTriggers: ['ga-tenant-old-site'], enabled: true } },
      },
    },
  }

  removeStaleTenantZarazAnalytics(config, ['site-ncls-blawby'])
  upsertTenantZarazAnalytics(config, {
    siteId: 'site-ncls-blawby',
    measurementId: 'G-08FKZD9LN2',
    hostnames: ['ncls.krabiclaw.com', 'www.northcarolinalegalservices.org'],
  })

  assert.equal(config.tools['ga-tenant-old-site'], undefined)
  assert.equal(config.triggers['ga-tenant-old-site'], undefined)
  assert.equal(config.tools['ga-tenant-site-ncls-blawby'].settings.tid, 'G-08FKZD9LN2')
  assert.equal(config.tools['ga-tenant-site-ncls-blawby'].defaultPurpose, undefined)
  assert.deepEqual(config.tools['ga-tenant-site-ncls-blawby'].actions.AllPageviews.firingTriggers, ['Pageview'])
  assert.deepEqual(config.tools['ga-tenant-site-ncls-blawby'].actions.AllPageviews.blockingTriggers, ['ga-tenant-site-ncls-blawby', 'ga-consent-not-accepted'])

  const pattern = new RegExp(String((config.triggers['ga-tenant-site-ncls-blawby'] as { loadRules: Array<{ value: string }> }).loadRules[0].value))
  assert.equal(pattern.test('www.northcarolinalegalservices.org'), true)
  assert.equal(pattern.test('ncls.krabiclaw.com'), true)
  assert.equal(pattern.test('krabiclaw.com'), false)

  const trigger = config.triggers['ga-tenant-site-ncls-blawby'] as { system?: string, loadRules: Array<{ match: string, op: string, value: string }> }
  assert.equal(trigger.system, undefined)
  assert.equal(trigger.loadRules[0].op, 'NOT_MATCH_REGEX')
  assert.deepEqual(config.triggers['ga-consent-not-accepted'], {
    name: 'Analytics consent not accepted',
    loadRules: [{ match: '{{ system.cookies.kc_consent }}', op: 'NOT_MATCH_REGEX', value: '^accepted$' }],
  })
})
