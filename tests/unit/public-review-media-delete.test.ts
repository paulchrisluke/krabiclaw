import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { mock } from 'node:test'

type JsonResult = { body: Record<string, unknown>; status: number }
type TestEvent = { params: { requestId: string; assetId: string } }

interface StoredAsset {
  id: string
  siteId: string
  provider: 'cloudflare_images' | 'cloudflare_r2'
  status: 'active' | 'deleted'
  r2Key: string | null
  cloudflareImageId: string | null
}

interface StoredReviewMedia {
  id: string
  requestId: string
  customerId: string
  assetId: string
  reviewId: string | null
  status: 'pending' | 'deleted'
}

const state: {
  body: Record<string, unknown>
  sessionUserId: string | null
  assets: StoredAsset[]
  links: StoredReviewMedia[]
  r2Deletes: string[]
  imageDeletes: string[]
  providerErrors: Map<string, Error>
  linkTransitions: string[]
  beforeRollback: (() => void) | null
} = {
  body: { token: 'review-token' },
  sessionUserId: 'anonymous-1',
  assets: [],
  links: [],
  r2Deletes: [],
  imageDeletes: [],
  providerErrors: new Map(),
  linkTransitions: [],
  beforeRollback: null,
}

function seed() {
  state.body = { token: 'review-token' }
  state.sessionUserId = 'anonymous-1'
  state.assets = [
    {
      id: 'asset-video',
      siteId: 'site-1',
      provider: 'cloudflare_r2',
      status: 'active',
      r2Key: 'sites/site-1/media/asset-video.mp4',
      cloudflareImageId: 'video-poster',
    },
    {
      id: 'asset-image',
      siteId: 'site-1',
      provider: 'cloudflare_images',
      status: 'active',
      r2Key: null,
      cloudflareImageId: 'review-image',
    },
    {
      id: 'asset-other-request',
      siteId: 'site-1',
      provider: 'cloudflare_r2',
      status: 'active',
      r2Key: 'sites/site-1/media/asset-other-request.mp4',
      cloudflareImageId: null,
    },
  ]
  state.links = [
    {
      id: 'link-video',
      requestId: 'request-1',
      customerId: 'customer-1',
      assetId: 'asset-video',
      reviewId: null,
      status: 'pending',
    },
    {
      id: 'link-image',
      requestId: 'request-1',
      customerId: 'customer-1',
      assetId: 'asset-image',
      reviewId: null,
      status: 'pending',
    },
    {
      id: 'link-other-request',
      requestId: 'request-2',
      customerId: 'customer-1',
      assetId: 'asset-other-request',
      reviewId: null,
      status: 'pending',
    },
  ]
  state.r2Deletes = []
  state.imageDeletes = []
  state.providerErrors = new Map()
  state.linkTransitions = []
  state.beforeRollback = null
}

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cleanString: (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '',
    cloudflareEnv: () => ({ DB: {} }),
    readRequiredBody: async () => state.body,
    jsonResponse: (body: Record<string, unknown>, options: { status?: number } = {}): JsonResult => ({
      body,
      status: options.status ?? 200,
    }),
  },
})

mock.module('nitro/h3', {
  namedExports: {
    getRouterParam: (event: TestEvent, name: string) => event.params[name as keyof TestEvent['params']],
    readBody: async () => state.body,
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    getAuthSession: async () => state.sessionUserId ? { user: { id: state.sessionUserId } } : null,
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string, params: unknown[]): Promise<T | null> => {
      assert.match(query, /FROM review_media rm/)
      const [requestId, assetId, customerId, siteId] = params.map(String)
      const link = state.links.find(item =>
        item.requestId === requestId
        && item.assetId === assetId
        && item.customerId === customerId
        && item.reviewId === null
        && (item.status === 'pending' || item.status === 'deleted'),
      )
      const asset = state.assets.find(item => item.id === assetId && item.siteId === siteId)
      if (!link || !asset) return null
      return {
        id: link.id,
        link_status: link.status,
        media_asset_status: asset.status,
      } as T
    },
    execute: async (_db: unknown, query: string, params: unknown[]) => {
      assert.match(query, /UPDATE review_media/)
      const [, linkId, requestId, assetId, customerId, siteId] = params.map(String)
      const link = state.links.find(item =>
        item.id === linkId
        && item.requestId === requestId
        && item.assetId === assetId
        && item.customerId === customerId
        && item.reviewId === null
      )
      if (!link) return { meta: { changes: 0 } }

      if (/SET status = 'pending'/.test(query)) {
        state.beforeRollback?.()
        state.beforeRollback = null
        const asset = state.assets.find(item => item.id === assetId && item.siteId === siteId && item.status !== 'deleted')
        if (link.status !== 'deleted' || !asset) return { meta: { changes: 0 } }
        link.status = 'pending'
        state.linkTransitions.push(`${link.id}:pending`)
        return { meta: { changes: 1 } }
      }

      if (/AND status = 'pending'/.test(query) && link.status !== 'pending') {
        return { meta: { changes: 0 } }
      }
      if (/AND status IN \('pending', 'deleted'\)/.test(query) && !['pending', 'deleted'].includes(link.status)) {
        return { meta: { changes: 0 } }
      }
      if (link.status !== 'deleted') {
        link.status = 'deleted'
        state.linkTransitions.push(`${link.id}:deleted`)
      }
      return { meta: { changes: 1 } }
    },
  },
})

mock.module('../../server/utils/media-asset-manager.ts', {
  namedExports: {
    deleteMediaAsset: async (
      _db: unknown,
      _env: unknown,
      assetId: string,
      siteId: string,
      _deletedByUserId: string,
    ) => {
      const asset = state.assets.find(item => item.id === assetId && item.siteId === siteId && item.status !== 'deleted')
      if (!asset) throw Object.assign(new Error('Media asset not found'), { statusCode: 404 })
      const link = state.links.find(item => item.assetId === assetId && item.reviewId === null)
      assert.equal(link?.status, 'deleted', 'the pending review link must be claimed before provider cleanup')

      if (asset.r2Key) state.r2Deletes.push(asset.r2Key)
      if (asset.cloudflareImageId) state.imageDeletes.push(asset.cloudflareImageId)
      const providerError = state.providerErrors.get(assetId)
      if (providerError) throw providerError
      asset.status = 'deleted'
    },
  },
})

mock.module('../../server/utils/review-requests.ts', {
  namedExports: {
    getReviewRequestByToken: async (_db: unknown, token: string) => {
      if (token !== 'review-token') return null
      return {
        request: {
          id: 'request-1',
          customer_id: 'customer-1',
          user_id: null,
          anonymous_user_id: 'anonymous-1',
        },
        context: {
          site_id: 'site-1',
        },
      }
    },
  },
})

const previousGlobals = {
  defineEventHandler: globalThis.defineEventHandler,
  getRouterParam: globalThis.getRouterParam,
  readBody: globalThis.readBody,
}
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: TestEvent, name: string) => event.params[name as keyof TestEvent['params']]
globalThis.readBody = async () => state.body

const { default: handler } = await import('../../server/api/public/review-requests/[requestId]/media/[assetId].delete.ts?public-review-media-delete-test') as {
  default: (_event: TestEvent) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousGlobals.defineEventHandler
  globalThis.getRouterParam = previousGlobals.getRouterParam
  globalThis.readBody = previousGlobals.readBody
})

test.beforeEach(seed)

test('deletes the exact pending review link plus R2 and Cloudflare Images storage', async () => {
  const videoResponse = await handler({ params: { requestId: 'request-1', assetId: 'asset-video' } })
  const imageResponse = await handler({ params: { requestId: 'request-1', assetId: 'asset-image' } })

  assert.deepEqual(videoResponse, {
    status: 200,
    body: { deleted: true, assetId: 'asset-video' },
  })
  assert.deepEqual(imageResponse, {
    status: 200,
    body: { deleted: true, assetId: 'asset-image' },
  })
  assert.deepEqual(state.r2Deletes, ['sites/site-1/media/asset-video.mp4'])
  assert.deepEqual(state.imageDeletes, ['video-poster', 'review-image'])
  assert.deepEqual(state.linkTransitions, ['link-video:deleted', 'link-image:deleted'])
  assert.equal(state.links.find(item => item.id === 'link-video')?.status, 'deleted')
  assert.equal(state.links.find(item => item.id === 'link-image')?.status, 'deleted')
})

test('a provider failure keeps the pending link actionable and a later request retries once', async () => {
  state.providerErrors.set('asset-video', new Error('R2 unavailable'))

  const failed = await handler({ params: { requestId: 'request-1', assetId: 'asset-video' } })

  assert.equal(failed.status, 500)
  assert.match(String(failed.body.error), /try again/i)
  assert.equal(state.links.find(item => item.id === 'link-video')?.status, 'pending')
  assert.equal(state.assets.find(item => item.id === 'asset-video')?.status, 'active')
  assert.deepEqual(state.r2Deletes, ['sites/site-1/media/asset-video.mp4'])
  assert.deepEqual(state.imageDeletes, ['video-poster'])
  assert.deepEqual(state.linkTransitions, ['link-video:deleted', 'link-video:pending'])

  state.providerErrors.delete('asset-video')
  const retried = await handler({ params: { requestId: 'request-1', assetId: 'asset-video' } })

  assert.equal(retried.status, 200)
  assert.equal(state.links.find(item => item.id === 'link-video')?.status, 'deleted')
  assert.deepEqual(state.r2Deletes, [
    'sites/site-1/media/asset-video.mp4',
    'sites/site-1/media/asset-video.mp4',
  ])
  assert.deepEqual(state.imageDeletes, ['video-poster', 'video-poster'])
})

test('repeats success only for the exact known deleted link without another provider call', async () => {
  const first = await handler({ params: { requestId: 'request-1', assetId: 'asset-image' } })
  const repeated = await handler({ params: { requestId: 'request-1', assetId: 'asset-image' } })

  assert.equal(first.status, 200)
  assert.deepEqual(repeated, {
    status: 200,
    body: { deleted: true, assetId: 'asset-image' },
  })
  assert.deepEqual(state.imageDeletes, ['review-image'])
  assert.deepEqual(state.linkTransitions, ['link-image:deleted'])
})

test('converges when another exact delete finishes between provider failure and rollback', async () => {
  state.providerErrors.set('asset-video', new Error('R2 unavailable'))
  state.beforeRollback = () => {
    const asset = state.assets.find(item => item.id === 'asset-video')
    if (asset) asset.status = 'deleted'
  }

  const response = await handler({ params: { requestId: 'request-1', assetId: 'asset-video' } })

  assert.deepEqual(response, {
    status: 200,
    body: { deleted: true, assetId: 'asset-video' },
  })
  assert.equal(state.links.find(item => item.id === 'link-video')?.status, 'deleted')
  assert.deepEqual(state.linkTransitions, ['link-video:deleted'])
})

test('returns 404 for the same customer and site asset outside the token-scoped request ID', async () => {
  const response = await handler({ params: { requestId: 'request-1', assetId: 'asset-other-request' } })

  assert.equal(response.status, 404)
  assert.equal(response.body.error, 'Review media not found')
  assert.deepEqual(state.r2Deletes, [])
  assert.deepEqual(state.imageDeletes, [])
  assert.deepEqual(state.linkTransitions, [])
})

test('requires the session that owns the token-scoped request', async () => {
  state.sessionUserId = 'anonymous-2'

  const response = await handler({ params: { requestId: 'request-1', assetId: 'asset-image' } })

  assert.equal(response.status, 403)
  assert.deepEqual(state.imageDeletes, [])
})

test('the page bounds uploads, cleans failed images, and keeps previews until exact deletion succeeds', () => {
  const source = readFileSync(new URL('../../pages/locations/[slug]/review-submit.vue', import.meta.url), 'utf8')
  const uploadImageStart = source.indexOf('async function uploadImage(file: File)')
  const uploadVideoStart = source.indexOf('async function uploadVideo(file: File)', uploadImageStart)
  const start = source.indexOf('async function removeMedia(assetId: string)')
  const end = source.indexOf('async function submitReview()', start)
  const helperStart = source.indexOf('function discardReviewMedia(', start)
  const uploadImage = source.slice(uploadImageStart, uploadVideoStart)
  const uploadVideo = source.slice(uploadVideoStart, start)
  const removeMedia = source.slice(start, end)
  const discardHelper = source.slice(helperStart, end)
  const deleteRequest = removeMedia.indexOf('await discardReviewMedia')
  const revokePreview = removeMedia.indexOf('URL.revokeObjectURL')
  const removePreview = removeMedia.indexOf('media.value = media.value.filter')

  assert.ok(uploadImageStart >= 0 && uploadVideoStart > uploadImageStart)
  assert.match(uploadImage, /fetch\(upload\.uploadUrl,[\s\S]*signal: mediaUploadSignal\(\)/)
  assert.match(uploadImage, /catch \(error\)[\s\S]*await discardReviewMedia\(requestId, upload\.assetId\)/)
  assert.match(uploadImage, /AggregateError\(\[error, cleanupError\]/)
  assert.match(uploadVideo, /signal: mediaUploadSignal\(controller\.signal\)/)
  assert.ok(start >= 0 && end > start && helperStart > start)
  assert.ok(deleteRequest >= 0)
  assert.match(discardHelper, /method: 'DELETE'/)
  assert.match(discardHelper, /value\.assetId === assetId/)
  assert.ok(revokePreview > deleteRequest)
  assert.ok(removePreview > revokePreview)
  assert.match(removeMedia, /catch \(error\)[\s\S]*mediaError\.value/)
})
