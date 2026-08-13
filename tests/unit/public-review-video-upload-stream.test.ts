import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { REVIEW_VIDEO_MAX_BYTES } from '../../config/media-limits.ts'

type JsonResult = { body: Record<string, unknown>; status: number }
type TestEvent = {
  params: { requestId: string }
  headers: Record<string, string>
  body: ReadableStream<Uint8Array>
}

const state: {
  putBodies: ReadableStream[]
  putKeys: string[]
  getRanges: Array<{ offset: number; length?: number }>
  deletes: string[]
  batches: Array<Array<{ query: string; params?: unknown[] }>>
  batchError: Error | null
  deleteError: Error | null
  requestOwnerId: string | null
} = {
  putBodies: [],
  putKeys: [],
  getRanges: [],
  deletes: [],
  batches: [],
  batchError: null,
  deleteError: null,
  requestOwnerId: 'user-1',
}

const mp4Signature = new Uint8Array([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
])

let storedSize = mp4Signature.byteLength
let storedSignature = mp4Signature

const mediaBucket = {
  async put(key: string, body: ReadableStream) {
    state.putKeys.push(key)
    state.putBodies.push(body)
    return { size: storedSize }
  },
  async get(_key: string, options: { range: { offset: number; length?: number } }) {
    state.getRanges.push(options.range)
    return { arrayBuffer: async () => storedSignature.slice().buffer }
  },
  async delete(key: string) {
    state.deletes.push(key)
    if (state.deleteError) throw state.deleteError
  },
}

mock.module('h3', {
  namedExports: {
    createError: (input: { statusCode: number; statusMessage: string }) => Object.assign(
      new Error(input.statusMessage),
      input,
    ),
    getHeader: (event: TestEvent, name: string) => event.headers[name.toLowerCase()],
    getRequestWebStream: (event: TestEvent) => event.body,
  },
})

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
    cleanString: (value: unknown, maxLength: number) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '',
    cloudflareEnv: () => ({
      DB: {},
      MEDIA_BUCKET: mediaBucket,
      MEDIA_BASE_URL: 'https://media.example.com',
    }),
    jsonResponse: (body: Record<string, unknown>, options: { status?: number } = {}): JsonResult => ({
      body,
      status: options.status ?? 200,
    }),
    rethrowHttpError: (error: unknown) => {
      if (error && typeof error === 'object' && 'statusCode' in error) throw error
    },
  },
})

mock.module('../../server/utils/auth.ts', {
  namedExports: {
    getAuthSession: async () => ({ user: { id: 'user-1', isAnonymous: true } }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(): Promise<T> => ({ count: 0 }) as T,
    executeBatch: async (_db: unknown, queries: Array<{ query: string; params?: unknown[] }>) => {
      state.batches.push(queries)
      if (state.batchError) throw state.batchError
      return []
    },
  },
})

mock.module('../../server/utils/cloudflare-r2.ts', {
  namedExports: {
    buildR2Key: (siteId: string, assetId: string, filename: string) => `sites/${siteId}/media/${assetId}-${filename}`,
    getR2Url: (_env: unknown, key: string) => `https://media.example.com/${key}`,
  },
})

mock.module('../../server/utils/review-requests.ts', {
  namedExports: {
    getReviewRequestByToken: async () => ({
      request: {
        id: 'request-1',
        customer_id: 'customer-1',
        user_id: null,
        anonymous_user_id: state.requestOwnerId,
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
}
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: TestEvent, name: string) => event.params[name as 'requestId']

const { default: handler } = await import('../../server/api/public/review-requests/[requestId]/media/upload.post.ts?raw-review-stream-test') as {
  default: (_event: TestEvent) => Promise<JsonResult>
}

test.after(() => {
  globalThis.defineEventHandler = previousGlobals.defineEventHandler
  globalThis.getRouterParam = previousGlobals.getRouterParam
})

test.beforeEach(() => {
  state.putBodies = []
  state.putKeys = []
  state.getRanges = []
  state.deletes = []
  state.batches = []
  state.batchError = null
  state.deleteError = null
  state.requestOwnerId = 'user-1'
  storedSize = mp4Signature.byteLength
  storedSignature = mp4Signature
})

function event(overrides: Partial<TestEvent> = {}): TestEvent {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(mp4Signature)
      controller.close()
    },
  })
  return {
    params: { requestId: 'request-1' },
    headers: {
      'content-length': String(mp4Signature.byteLength),
      'content-type': 'video/mp4',
      'x-file-name': encodeURIComponent('visit clip.mp4'),
      'x-review-token': 'review-token',
    },
    body,
    ...overrides,
  }
}

test('streams the exact review video body into R2 and atomically persists its canonical state', async () => {
  const request = event()

  const response = await handler(request)

  assert.equal(response.status, 201)
  assert.equal(state.putBodies.length, 1)
  assert.equal(state.putBodies[0], request.body)
  assert.deepEqual(state.getRanges, [{ offset: 0, length: mp4Signature.byteLength }])
  assert.equal(state.deletes.length, 0)
  assert.equal(state.batches.length, 1)
  assert.equal(state.batches[0]?.length, 4)
  assert.match(state.batches[0]?.[0]?.query ?? '', /INSERT INTO media_assets/)
  assert.match(state.batches[0]?.[1]?.query ?? '', /INSERT INTO review_media/)
  assert.match(state.batches[0]?.[2]?.query ?? '', /UPDATE review_requests/)
  assert.match(state.batches[0]?.[3]?.query ?? '', /INSERT INTO site_events/)
  assert.equal(response.body.kind, 'video')
  assert.equal(response.body.status, 'pending')
  assert.equal(response.body.publicUrl, `https://media.example.com/${state.putKeys[0]}`)
})

test('rejects an oversized declared review video before R2 receives a stream', async () => {
  const response = await handler(event({
    headers: {
      'content-length': String(REVIEW_VIDEO_MAX_BYTES + 1),
      'content-type': 'video/mp4',
      'x-file-name': 'clip.mp4',
      'x-review-token': 'review-token',
    },
  }))

  assert.equal(response.status, 413)
  assert.equal(response.body.error, 'Videos must be 100 MB or smaller.')
  assert.equal(state.putBodies.length, 0)
  assert.equal(state.batches.length, 0)
})

test('rejects a session that does not own the review request before R2 receives a stream', async () => {
  state.requestOwnerId = 'different-user'

  const response = await handler(event())

  assert.equal(response.status, 403)
  assert.equal(state.putBodies.length, 0)
  assert.equal(state.batches.length, 0)
})

test('deletes the R2 object once when its magic bytes do not match the declared MIME', async () => {
  storedSignature = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])

  await assert.rejects(() => handler(event()), /File type mismatch/)

  assert.equal(state.putBodies.length, 1)
  assert.deepEqual(state.deletes, [state.putKeys[0]])
  assert.equal(state.batches.length, 0)
})

test('deletes the R2 object once when canonical database persistence fails', async () => {
  state.batchError = new Error('D1 batch unavailable')

  const response = await handler(event())

  assert.equal(response.status, 500)
  assert.equal(response.body.message, 'D1 batch unavailable')
  assert.deepEqual(state.deletes, [state.putKeys[0]])
  assert.equal(state.batches.length, 1)
})

test('surfaces both persistence and one-attempt cleanup errors', async () => {
  state.batchError = new Error('D1 batch unavailable')
  state.deleteError = new Error('R2 delete unavailable')

  const response = await handler(event())

  assert.equal(response.status, 500)
  assert.match(String(response.body.error), /D1 batch unavailable/)
  assert.match(String(response.body.error), /R2 delete unavailable/)
  assert.deepEqual(state.deletes, [state.putKeys[0]])
})
