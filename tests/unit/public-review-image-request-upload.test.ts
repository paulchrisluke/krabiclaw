import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type JsonResult = { body: Record<string, unknown>; status: number }
type TestEvent = { params: { requestId: string; assetId?: string } }

const state: {
  body: Record<string, unknown>
  readError: Error | null
  requestImageCalls: number
  persistError: Error | null
  deleteError: Error | null
  deletedImageIds: string[]
  batches: Array<Array<{ query: string; params?: unknown[] }>>
} = {
  body: {},
  readError: null,
  requestImageCalls: 0,
  persistError: null,
  deleteError: null,
  deletedImageIds: [],
  batches: [],
}

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cleanString: (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '',
    cloudflareEnv: () => ({ DB: {} }),
    jsonResponse: (body: Record<string, unknown>, options: { status?: number } = {}): JsonResult => ({
      body,
      status: options.status ?? 200,
    }),
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    getAuthSession: async () => ({ user: { id: 'user-1', isAnonymous: true } }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    executeBatch: async (_db: unknown, queries: Array<{ query: string; params?: unknown[] }>) => {
      state.batches.push(queries)
      if (state.persistError) throw state.persistError
      return queries.map(() => ({ meta: { changes: 1 } }))
    },
    queryFirst: async <T>(_db: unknown, query: string): Promise<T> => (
      query.includes('SELECT id') ? { id: 'link-1' } : { count: 0 }
    ) as T,
  },
})

mock.module('../../server/utils/cloudflare-images.ts', {
  namedExports: {
    buildImageUrl: (_env: unknown, imageId: string, variant: string) => `https://images.example.com/${imageId}/${variant}`,
    deleteImage: async (_env: unknown, imageId: string) => {
      state.deletedImageIds.push(imageId)
      if (state.deleteError) throw state.deleteError
    },
    hasCloudflareImagesConfig: () => true,
    requestImageUpload: async () => {
      state.requestImageCalls += 1
      return { imageId: 'image-1', uploadUrl: 'https://upload.example.com' }
    },
  },
})

mock.module('../../server/utils/media-asset-manager.ts', {
  namedExports: {
    getMediaAsset: async () => ({
      id: 'asset-1',
      status: 'pending',
      cloudflare_image_id: 'image-1',
    }),
  },
})

mock.module('../../server/utils/review-requests.ts', {
  namedExports: {
    getReviewRequestByToken: async () => ({
      request: {
        id: 'request-1',
        customer_id: 'customer-1',
        user_id: null,
        anonymous_user_id: 'user-1',
      },
      context: {
        organization_id: 'org-1',
        site_id: 'site-1',
        location_id: 'location-1',
      },
    }),
  },
})

const previousGlobals = {
  defineEventHandler: globalThis.defineEventHandler,
  getRouterParam: globalThis.getRouterParam,
  readBody: globalThis.readBody,
}
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: TestEvent, name: string) => event.params[name as keyof TestEvent['params']]
globalThis.readBody = async () => {
  if (state.readError) throw state.readError
  return state.body
}

const { default: handler } = await import('../../server/api/public/review-requests/[requestId]/media/request-upload.post.ts?review-image-request-test') as {
  default: (_event: TestEvent) => Promise<JsonResult>
}
const { default: confirmHandler } = await import('../../server/api/public/review-requests/[requestId]/media/[assetId]/confirm.post.ts?review-image-confirm-test') as {
  default: (_event: TestEvent) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousGlobals.defineEventHandler
  globalThis.getRouterParam = previousGlobals.getRouterParam
  globalThis.readBody = previousGlobals.readBody
})

test.beforeEach(() => {
  state.body = {
    token: 'review-token',
    kind: 'image',
    filename: 'review.jpg',
  }
  state.readError = null
  state.requestImageCalls = 0
  state.persistError = null
  state.deleteError = null
  state.deletedImageIds = []
  state.batches = []
})

test('rejects malformed request JSON instead of converting it into an empty request', async () => {
  state.readError = new Error('Malformed JSON')

  await assert.rejects(() => handler({ params: { requestId: 'request-1' } }), /Malformed JSON/)

  assert.equal(state.requestImageCalls, 0)
})

test('rejects malformed confirmation JSON instead of converting it into an empty request', async () => {
  state.readError = new Error('Malformed confirmation JSON')

  await assert.rejects(
    () => confirmHandler({ params: { requestId: 'request-1', assetId: 'asset-1' } }),
    /Malformed confirmation JSON/,
  )
})

test('rejects the removed video compatibility branch before requesting external storage', async () => {
  state.body.kind = 'video'

  const response = await handler({ params: { requestId: 'request-1' } })

  assert.equal(response.status, 400)
  assert.equal(response.body.error, 'Invalid media type')
  assert.equal(state.requestImageCalls, 0)
})

test('atomically creates the pending image asset, review link, and request ownership', async () => {
  const response = await handler({ params: { requestId: 'request-1' } })

  assert.equal(response.status, 200)
  assert.equal(state.requestImageCalls, 1)
  assert.equal(state.batches.length, 1)
  assert.equal(state.batches[0]?.length, 3)
  assert.match(state.batches[0]?.[0]?.query ?? '', /INSERT INTO media_assets/)
  assert.match(state.batches[0]?.[1]?.query ?? '', /INSERT INTO review_media/)
  assert.match(state.batches[0]?.[2]?.query ?? '', /UPDATE review_requests/)
})

test('atomically activates a confirmed image and records its upload event', async () => {
  const response = await confirmHandler({ params: { requestId: 'request-1', assetId: 'asset-1' } })

  assert.equal(response.status, 200)
  assert.equal(state.batches.length, 1)
  assert.equal(state.batches[0]?.length, 2)
  assert.match(state.batches[0]?.[0]?.query ?? '', /INSERT INTO site_events/)
  assert.match(state.batches[0]?.[1]?.query ?? '', /UPDATE media_assets/)
  assert.equal(response.body.status, 'pending')
})

test('surfaces both image persistence and one-attempt cleanup errors', async () => {
  state.persistError = new Error('D1 unavailable')
  state.deleteError = new Error('Images delete unavailable')

  await assert.rejects(
    () => handler({ params: { requestId: 'request-1' } }),
    /D1 unavailable; Cloudflare Images cleanup failed: Images delete unavailable/,
  )

  assert.equal(state.requestImageCalls, 1)
  assert.deepEqual(state.deletedImageIds, ['image-1'])
})
