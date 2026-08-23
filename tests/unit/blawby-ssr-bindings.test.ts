import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { getResponseHeader, mockEvent } from 'nitro/h3'

const payload = {
  success: true as const,
  shell: {
    identity: {
      brand_name: 'North Carolina Legal Services',
      brand_description: null,
      logo_url: null,
      favicon_url: null,
      phone: null,
      banner_content: null,
      banner_dismissible: false,
      primary_location_address_street: null,
      primary_location_address_locality: null,
    },
    consultation: {
      mode: 'native_disabled' as const,
      cta_label: 'Contact us',
      external_url: null,
      schedule_path: '/schedule',
      confirmation_path: '/confirmation',
      tracking_enabled: false,
      contact_form_enabled: true,
      metadata: {},
    },
    compliance: null,
    themeTokens: { primary: '#123456' },
    offeringLinks: [],
    pageLinks: [],
  },
  route: {
    recipe: 'home' as const,
    page: {
      id: 'page-home',
      path: '/',
      title: 'Home',
      page_type: 'home',
      recipe: 'home',
      locale: 'en',
      summary: null,
      seo_title: null,
      seo_description: null,
      canonical_url: null,
      robots: null,
      blocks: [],
      updated_at: '2026-08-23T00:00:00.000Z',
    },
    offerings: [],
    offering: null,
    qa: [],
    reviews: [],
    posts: [],
    post: null,
  },
}

let resolverCalls = 0
let cachedValue: string | null = null
let cacheDeleteCalls = 0
let cachePutCalls = 0
const siteCache = {
  delete: async () => { cacheDeleteCalls += 1 },
}

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cloudflareEnv: () => ({ db: {}, SITE_CACHE: siteCache }),
    jsonResponse: (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), init),
    apiErrorResponse: (_event: unknown, status: number, code: string, message: string) =>
      new Response(JSON.stringify({ error: { code, message } }), { status }),
  },
})

mock.module('../../server/utils/mcp-route-helpers.ts', {
  namedExports: { getCloudflareWaitUntil: () => undefined },
})

mock.module('../../server/utils/professional-services.ts', {
  namedExports: {
    resolvePublicBlawbyDocumentOrThrow: async () => {
      resolverCalls += 1
      return payload
    },
  },
})

mock.module('../../server/utils/public-resource-cache.ts', {
  namedExports: {
    buildPublicBlawbyDocumentCacheKey: () => 'blawby-document',
    getPublicResourceCache: async () => cachedValue,
    putPublicResourceCache: async () => { cachePutCalls += 1 },
  },
})

mock.module('../../server/utils/tenant-hosts.ts', {
  namedExports: { isPreviewContext: () => false },
})

const { loadPublicBlawbyDocument } = await import('../../server/utils/public-blawby-document.ts')
const { default: documentHandler } = await import('../../server/api/public/sites/[siteId]/blawby/document.get.ts')

function createEvent(path: string) {
  const event = mockEvent(path)
  event.context.params = { siteId: 'site-ncls-blawby' }
  return event
}

test('Blawby SSR and API paths perform one canonical load without self-fetching and expose request metrics', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Blawby server document loading must not self-fetch')
  })

  resolverCalls = 0
  cacheDeleteCalls = 0
  cachePutCalls = 0
  cachedValue = JSON.stringify({ ...payload, route: { ...payload.route, page: null } })
  const ssrEvent = createEvent('/services')
  const ssrResult = await loadPublicBlawbyDocument(ssrEvent, 'site-ncls-blawby', 'home')

  assert.deepEqual(ssrResult, payload)
  assert.equal(resolverCalls, 1)
  assert.equal(cacheDeleteCalls, 1)
  assert.equal(cachePutCalls, 1)
  assert.equal(fetchMock.mock.callCount(), 0)

  resolverCalls = 0
  cacheDeleteCalls = 0
  cachePutCalls = 0
  cachedValue = JSON.stringify({
    ...payload,
    route: { ...payload.route, recipe: 'confirmation', page: null },
  })
  const mismatchedRecipeEvent = createEvent('/services')
  const mismatchedRecipeResult = await loadPublicBlawbyDocument(
    mismatchedRecipeEvent,
    'site-ncls-blawby',
    'home',
  )

  assert.deepEqual(mismatchedRecipeResult, payload)
  assert.equal(resolverCalls, 1)
  assert.equal(cacheDeleteCalls, 1)
  assert.equal(cachePutCalls, 1)
  assert.equal(fetchMock.mock.callCount(), 0)

  resolverCalls = 0
  cachedValue = null
  const apiEvent = createEvent('/api/public/sites/site-ncls-blawby/blawby/document?recipe=home')
  const response = await documentHandler(apiEvent)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), payload)
  assert.equal(resolverCalls, 1)
  assert.equal(fetchMock.mock.callCount(), 0)
  assert.equal(getResponseHeader(apiEvent, 'x-attempt-count'), '1')
  assert.equal(getResponseHeader(apiEvent, 'x-d1-query-count'), '0')
  assert.match(String(getResponseHeader(apiEvent, 'server-timing')), /document;dur=/)
})
