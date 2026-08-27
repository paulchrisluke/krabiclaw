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
  media_json: string
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
  media_json: '[]',
  vertical: 'experience',
}

const calls: Array<{ query: string, params: unknown[] }> = []
let queryResponder: (_query: string, _params: unknown[]) => unknown = () => null

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
  runtimeEnv.NUXT_PUBLIC_PLATFORM_DOMAIN = 'https://krabiclaw.com'
})

test('shared tenant hosts fail closed when site_domains has no active row', async () => {
  queryResponder = (query) => query.includes('WHERE s.subdomain = ?') ? site : null

  const result = await resolveTenantSite('pottery-house.krabiclaw.com', {} as H3Event)

  assert.equal(result, null)
  assert.equal(calls.length, 2)
  assert.ok(calls.every(({ query }) => !query.includes('WHERE s.subdomain = ?')))
  assert.deepEqual(calls[0]?.params, ['pottery-house.krabiclaw.com'])
  assert.deepEqual(calls[1]?.params, ['pottery-house.krabiclaw.com'])
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

test('spent subdomains resolve to their permanent redirect or gone outcome', async () => {
  queryResponder = (query) => query.includes('FROM spent_subdomains')
    ? { successor_domain: 'new-name.krabiclaw.com' }
    : null

  assert.deepEqual(
    await resolveTenantSite('old-name.krabiclaw.com', {} as H3Event),
    { spent: true, successorDomain: 'new-name.krabiclaw.com' },
  )

  queryResponder = (query) => query.includes('FROM spent_subdomains')
    ? { successor_domain: null }
    : null
  assert.deepEqual(
    await resolveTenantSite('closed-name.krabiclaw.com', {} as H3Event),
    { spent: true, successorDomain: null },
  )
})

test('spent subdomains redirect before unknown-tenant routing', async () => {
  queryResponder = (query) => query.includes('FROM spent_subdomains')
    ? { successor_domain: 'new-name.krabiclaw.com' }
    : null
  const event = {
    path: '/menu?source=qr',
    url: new URL('https://old-name.krabiclaw.com/menu?source=qr'),
    context: {},
    req: new Request('https://old-name.krabiclaw.com/menu?source=qr', {
      headers: { host: 'old-name.krabiclaw.com' },
    }),
  } as unknown as H3Event

  const response = await tenantResolution(event) as Response
  assert.equal(response.status, 301)
  assert.equal(response.headers.get('location'), 'https://new-name.krabiclaw.com/menu?source=qr')
})

test('spent subdomains without a successor return gone', async () => {
  queryResponder = (query) => query.includes('FROM spent_subdomains')
    ? { successor_domain: null }
    : null
  const event = {
    path: '/',
    url: new URL('https://closed-name.krabiclaw.com/'),
    context: {},
    req: new Request('https://closed-name.krabiclaw.com/', {
      headers: { host: 'closed-name.krabiclaw.com' },
    }),
  } as unknown as H3Event

  await assert.rejects(
    () => tenantResolution(event),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 410),
  )
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
    url: new URL('http://local.krabiclaw.com/'),
    context: {},
    req: new Request('http://local.krabiclaw.com/', {
      headers: { host: 'local.krabiclaw.com', 'x-preview-tenant': 'pottery-house' },
    }),
  } as unknown as H3Event

  await tenantResolution(event)

  assert.equal(event.context.siteId, site.id)
  assert.equal(event.context.canonicalDomain, 'local.krabiclaw.com')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.params, ['pottery-house.krabiclaw.com'])
})

test('staging tenant alias resolves the registered subdomain without redirecting to production', async () => {
  runtimeEnv.NUXT_PUBLIC_PLATFORM_DOMAIN = 'https://staging.krabiclaw.com'
  queryResponder = (query, params) => {
    if (
      query.includes('JOIN site_domains requested')
      && params[0] === 'pottery-house.krabiclaw.com'
    ) return site
    return null
  }
  const event = {
    path: '/',
    url: new URL('https://pottery-house-staging.krabiclaw.com/'),
    context: {},
    req: new Request('https://pottery-house-staging.krabiclaw.com/', {
      headers: { host: 'pottery-house-staging.krabiclaw.com' },
    }),
  } as unknown as H3Event

  await tenantResolution(event)

  assert.equal(event.context.siteId, site.id)
  assert.equal(event.context.canonicalDomain, 'pottery-house-staging.krabiclaw.com')
  assert.equal(event.context.tenantHost, 'pottery-house-staging.krabiclaw.com')
  assert.deepEqual(calls[0]?.params, ['pottery-house.krabiclaw.com'])
})

test('staging platform host ignores tenant headers and remains platform-scoped', async () => {
  runtimeEnv.NUXT_PUBLIC_PLATFORM_DOMAIN = 'https://staging.krabiclaw.com'
  const event = {
    path: '/',
    url: new URL('https://staging.krabiclaw.com/'),
    context: {},
    req: new Request('https://staging.krabiclaw.com/', {
      headers: { host: 'staging.krabiclaw.com', 'x-preview-tenant': 'pottery-house' },
    }),
  } as unknown as H3Event

  await tenantResolution(event)

  assert.equal(event.context.tenantType, 'platform')
  assert.equal(event.context.siteId, null)
  assert.equal(calls.length, 0)
})

test('unknown staging aliases fail closed without falling through to custom-domain resolution', async () => {
  runtimeEnv.NUXT_PUBLIC_PLATFORM_DOMAIN = 'https://staging.krabiclaw.com'
  queryResponder = (query) => query.includes("sd.type IN ('custom', 'subdomain')") ? site : null
  const event = {
    path: '/',
    url: new URL('https://unknown-staging.krabiclaw.com/'),
    context: {},
    req: new Request('https://unknown-staging.krabiclaw.com/', {
      headers: { host: 'unknown-staging.krabiclaw.com' },
    }),
  } as unknown as H3Event

  await tenantResolution(event)

  assert.equal(event.context.tenantType, 'tenant-404')
  assert.equal(event.context.siteId, null)
  assert.equal(calls.length, 1)
  assert.ok(calls[0]?.query.includes('JOIN site_domains requested'))
})
