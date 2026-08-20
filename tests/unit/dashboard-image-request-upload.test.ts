import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type JsonResult = { body: Record<string, unknown>; status: number }
type TestEvent = { params: { siteId: string } }

const state: {
  requestImageCalls: number
  persistError: Error | null
  deleteError: Error | null
  deletedImageIds: string[]
  boundaryErrors: unknown[]
} = {
  requestImageCalls: 0,
  persistError: null,
  deleteError: null,
  deletedImageIds: [],
  boundaryErrors: [],
}

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cloudflareEnv: () => ({ DB: {} }),
    readRequiredBody: async () => ({ filename: 'photo.jpg', category: 'exterior' }),
    jsonResponse: (body: Record<string, unknown>, options: { status?: number } = {}): JsonResult => ({
      body,
      status: options.status ?? 200,
    }),
    rethrowHttpError: (error: unknown) => {
      state.boundaryErrors.push(error)
    },
  },
})

mock.module('nitro/h3', {
  namedExports: {
    getRouterParam: (event: TestEvent, name: string) => event.params[name as 'siteId'],
    readBody: async () => ({ filename: 'photo.jpg', category: 'exterior' }),
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    getAuthSession: async () => ({ user: { id: 'user-1' } }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string): Promise<T> => {
      if (query.includes('FROM sites')) {
        return { id: 'site-1', organization_id: 'org-1' } as T
      }
      if (query.includes('FROM member')) {
        return { userId: 'user-1', member_id: 'member-1', member_role: 'owner' } as T
      }
      throw new Error(`Unexpected query: ${query}`)
    },
  },
})

mock.module('../../server/utils/cloudflare-images.ts', {
  namedExports: {
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
    createMediaAsset: async () => {
      if (state.persistError) throw state.persistError
    },
  },
})

mock.module('../../server/utils/member-access.ts', {
  namedExports: {
    assertResourceAccess: async () => {},
  },
})

const previousGlobals = {
  defineEventHandler: globalThis.defineEventHandler,
  getRouterParam: globalThis.getRouterParam,
  readBody: globalThis.readBody,
}
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: TestEvent, name: string) => event.params[name as 'siteId']
globalThis.readBody = async () => ({ filename: 'photo.jpg', category: 'exterior' })

const { default: handler } = await import('../../server/api/editor/sites/[siteId]/media/request-upload.post.ts?dashboard-image-request-upload-test') as {
  default: (_event: TestEvent) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousGlobals.defineEventHandler
  globalThis.getRouterParam = previousGlobals.getRouterParam
  globalThis.readBody = previousGlobals.readBody
})

test.beforeEach(() => {
  state.requestImageCalls = 0
  state.persistError = null
  state.deleteError = null
  state.deletedImageIds = []
  state.boundaryErrors = []
})

test('preserves the persistence failure after one successful provider cleanup', async () => {
  const persistError = new Error('D1 persistence unavailable')
  state.persistError = persistError

  const response = await handler({ params: { siteId: 'site-1' } })

  assert.equal(response.status, 500)
  assert.equal(response.body.message, persistError.message)
  assert.equal(state.requestImageCalls, 1)
  assert.deepEqual(state.deletedImageIds, ['image-1'])
  assert.deepEqual(state.boundaryErrors, [persistError])
})

test('surfaces persistence and one-attempt provider cleanup failures together', async () => {
  const persistError = new Error('D1 persistence unavailable')
  const cleanupError = new Error('Images delete unavailable')
  state.persistError = persistError
  state.deleteError = cleanupError

  const response = await handler({ params: { siteId: 'site-1' } })

  assert.equal(response.status, 500)
  assert.match(String(response.body.message), /D1 persistence unavailable/)
  assert.match(String(response.body.message), /Cloudflare Images cleanup failed: Images delete unavailable/)
  assert.equal(state.requestImageCalls, 1)
  assert.deepEqual(state.deletedImageIds, ['image-1'])
  assert.equal(state.boundaryErrors.length, 1)
  assert.ok(state.boundaryErrors[0] instanceof AggregateError)
  assert.deepEqual(state.boundaryErrors[0].errors, [persistError, cleanupError])
})
