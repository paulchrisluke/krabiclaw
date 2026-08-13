import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import type { H3Event } from 'h3'

type SiteRow = {
  id: string
  organization_id: string
  theme_id: string | null
  subdomain: string
  onboarding_status: string
  canonical_domain: string | null
  brand_name: string | null
  logo_url: string | null
  logo_mime_type: string | null
  favicon_url: string | null
  vertical: string | null
}

const site: SiteRow = {
  id: 'site-pottery-house',
  organization_id: 'org-pottery-house',
  theme_id: 'saya-theme-v1',
  subdomain: 'pottery-house',
  onboarding_status: 'active',
  canonical_domain: 'www.potteryhousekrabi.com',
  brand_name: 'Pottery House Krabi',
  logo_url: null,
  logo_mime_type: null,
  favicon_url: null,
  vertical: 'experience',
}

const calls: Array<{ query: string, params: unknown[] }> = []
let queryResponder: (_query: string, _params: unknown[]) => SiteRow | null = () => null

async function queryFirst<T>(_db: unknown, query: string, params: unknown[] = []): Promise<T | null> {
  calls.push({ query, params })
  return queryResponder(query, params) as T | null
}

const runtimeEnv = {
  db: {},
  NUXT_PUBLIC_FREE_SITE_DOMAIN: 'https://krabiclaw.com',
  NUXT_PUBLIC_PLATFORM_DOMAIN: 'https://krabiclaw.com',
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async () => ({ success: true }),
    queryFirst,
  },
})

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cloudflareEnv: () => runtimeEnv,
    isInternalSelfFetch: () => false,
  },
})

const { default: tenantResolution, resolveTenantSite } = await import('../../server/middleware/tenant-resolution.ts')

test.beforeEach(() => {
  calls.length = 0
  queryResponder = () => null
})

test('shared tenant hosts fail closed when site_domains has no active row', async () => {
  queryResponder = (query) => query.includes('WHERE s.subdomain = ?') ? site : null

  const result = await resolveTenantSite('pottery-house.krabiclaw.com', {} as H3Event)

  assert.equal(result, null)
  assert.equal(calls.length, 1)
  assert.ok(calls.every(({ query }) => !query.includes('WHERE s.subdomain = ?')))
  assert.deepEqual(calls[0]?.params, ['pottery-house.krabiclaw.com'])
})

test('shared and custom hosts resolve exclusively through active site_domains rows', async () => {
  queryResponder = (query, params) => {
    const domain = params[0]
    if (
      ['www.potteryhousekrabi.com', 'pottery-house.krabiclaw.com'].includes(String(domain))
      && query.includes("sd.type IN ('custom', 'subdomain')")
    ) return site
    return null
  }

  assert.deepEqual(
    await resolveTenantSite('www.potteryhousekrabi.com', {} as H3Event),
    site,
  )
  assert.deepEqual(
    await resolveTenantSite('pottery-house.krabiclaw.com', {} as H3Event),
    site,
  )
  assert.equal(calls.length, 2)
  assert.ok(calls.every(({ query }) => !query.includes('WHERE s.subdomain = ?')))
})

test('localhost keeps explicit sites.subdomain development resolution', async () => {
  queryResponder = (query, params) => {
    if (query.includes('WHERE s.subdomain = ?') && params[0] === 'pottery-house') return site
    return null
  }

  assert.deepEqual(
    await resolveTenantSite('pottery-house.localhost:3000', {} as H3Event),
    site,
  )
  assert.equal(calls.length, 1)
})

test('named local tunnel resolves x-preview-tenant through the registered subdomain row', async () => {
  queryResponder = (query, params) => {
    if (
      query.includes('JOIN site_domains requested')
      && params[0] === 'pottery-house.krabiclaw.com'
    ) return site
    return null
  }
  const event = {
    path: '/',
    context: {},
    node: {
      req: {
        method: 'GET',
        url: '/',
        headers: {
          host: 'local.krabiclaw.com',
          'x-preview-tenant': 'pottery-house',
        },
      },
      res: {},
    },
  } as unknown as H3Event

  await tenantResolution(event)

  assert.equal(event.context.siteId, site.id)
  assert.equal(event.context.canonicalDomain, 'local.krabiclaw.com')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.params, ['pottery-house.krabiclaw.com'])
})
