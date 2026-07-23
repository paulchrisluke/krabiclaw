import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  removeStaleTenantZarazAnalytics,
  tenantPageLocationRegex,
  upsertPlatformZarazAnalytics,
  upsertTenantZarazAnalytics,
  type ZarazConfig,
} from '../../server/utils/zaraz-analytics.ts'
import { ZARAZ_ANALYTICS_PURPOSE_ID } from '../../utils/zaraz-consent.ts'

test('tenantPageLocationRegex scopes pageviews to exact active hostnames', () => {
  const pattern = new RegExp(tenantPageLocationRegex([
    'ncls.krabiclaw.com',
    'www.northcarolinalegalservices.org',
  ]))

  assert.equal(pattern.test('https://ncls.krabiclaw.com/'), true)
  assert.equal(pattern.test('https://www.northcarolinalegalservices.org/services'), true)
  assert.equal(pattern.test('https://other.krabiclaw.com/'), false)
  assert.equal(pattern.test('https://nclsXkrabiclawXcom/'), false)
  assert.equal(pattern.test('http://ncls.krabiclaw.com/'), false)
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

  assert.equal(config.consent?.enabled, true)
  assert.equal(config.consent?.hideModal, true)
  assert.equal(config.tools.googleAnalytics.defaultPurpose, ZARAZ_ANALYTICS_PURPOSE_ID)
  assert.deepEqual(config.tools.googleAnalytics.actions.Pageview.firingTriggers, ['ga-platform'])

  const pattern = new RegExp(String((config.triggers['ga-platform'] as { loadRules: Array<{ value: string }> }).loadRules[0].value))
  assert.equal(pattern.test('https://krabiclaw.com/blog'), true)
  assert.equal(pattern.test('https://www.krabiclaw.com/blog'), true)
  assert.equal(pattern.test('https://www.northcarolinalegalservices.org/article/foo'), false)
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
  assert.equal(config.tools['ga-tenant-site-ncls-blawby'].defaultPurpose, ZARAZ_ANALYTICS_PURPOSE_ID)
  assert.deepEqual(config.tools['ga-tenant-site-ncls-blawby'].actions.AllPageviews.firingTriggers, ['ga-tenant-site-ncls-blawby'])

  const pattern = new RegExp(String((config.triggers['ga-tenant-site-ncls-blawby'] as { loadRules: Array<{ value: string }> }).loadRules[0].value))
  assert.equal(pattern.test('https://www.northcarolinalegalservices.org/article/foo'), true)
  assert.equal(pattern.test('https://ncls.krabiclaw.com/article/foo'), true)
  assert.equal(pattern.test('https://krabiclaw.com/article/foo'), false)
})

test('cookie consent updates the Zaraz analytics purpose as well as Google consent mode', () => {
  const source = readFileSync('composables/useCookieConsent.ts', 'utf8')

  assert.match(source, /ZARAZ_ANALYTICS_PURPOSE_ID/)
  assert.match(source, /zaraz\?\.consent\?\.set/)
  assert.match(source, /sendQueuedEvents/)
  assert.match(source, /zarazConsentAPIReady/)
  assert.match(source, /value === 'accepted'/)
})
