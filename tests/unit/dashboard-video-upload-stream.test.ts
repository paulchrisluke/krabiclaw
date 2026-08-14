import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type JsonResult = { body: Record<string, unknown>; status: number }
type TestEvent = {
  params: { siteId: string }
  headers: Record<string, string>
  query: Record<string, string>
  body: ReadableStream<Uint8Array>
}

const state: {
  putBodies: ReadableStream[]
  putKeys: string[]
  getRanges: Array<{ offset: number; length?: number }>
  deletes: string[]
  assets: Array<Record<string, unknown>>
  deleteError: Error | null
} = {
  putBodies: [],
  putKeys: [],
  getRanges: [],
  deletes: [],
  assets: [],
  deleteError: null,
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
    getQuery: (event: TestEvent) => event.query,
    getRequestWebStream: (event: TestEvent) => event.body,
  },
})

mock.module('../../server/utils/api-response.ts', {
  namedExports: {
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
    getAuthSession: async () => ({ user: { id: 'user-1' } }),
  },
})

mock.module('../../server/db/index.ts', {
  namedExports: {
    queryFirst: async <T>(_db: unknown, query: string): Promise<T | null> => {
      if (query.includes('FROM sites')) return { organization_id: 'org-1' } as T
      if (query.includes('FROM member')) {
        return { userId: 'user-1', member_id: 'member-1', member_role: 'owner' } as T
      }
      if (query.includes('FROM business_locations')) return { id: 'location-1' } as T
      throw new Error(`Unexpected query: ${query}`)
    },
  },
})

mock.module('../../server/utils/cloudflare-r2.ts', {
  namedExports: {
    buildR2Key: (siteId: string, assetId: string, filename: string) => `sites/${siteId}/media/${assetId}-${filename}`,
    getR2Url: (_env: unknown, key: string) => `https://media.example.com/${key}`,
  },
})

mock.module('../../server/utils/member-access.ts', {
  namedExports: {
    assertResourceAccess: async () => {},
  },
})

mock.module('../../server/utils/media-asset-manager.ts', {
  namedExports: {
    createMediaAsset: async (_db: unknown, asset: Record<string, unknown>) => {
      state.assets.push(asset)
    },
  },
})

const previousGlobals = {
  defineEventHandler: globalThis.defineEventHandler,
  getRouterParam: globalThis.getRouterParam,
}
globalThis.defineEventHandler = (handler: unknown) => handler
globalThis.getRouterParam = (event: TestEvent, name: string) => event.params[name as 'siteId']

const { default: handler } = await import('../../server/api/editor/sites/[siteId]/media/upload.post.ts?raw-stream-test') as {
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
  state.assets = []
  state.deleteError = null
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
    params: { siteId: 'site-1' },
    headers: {
      'content-length': String(mp4Signature.byteLength),
      'content-type': 'video/mp4',
    },
    query: {
      filename: 'clip.mp4',
      locationId: 'location-1',
      category: 'interior',
    },
    body,
    ...overrides,
  }
}

test('streams the exact request body into R2, range-verifies it, and persists the canonical asset', async () => {
  const request = event()

  const response = await handler(request)

  assert.equal(response.status, 200)
  assert.equal(state.putBodies.length, 1)
  assert.equal(state.putBodies[0], request.body)
  assert.deepEqual(state.getRanges, [{ offset: 0, length: mp4Signature.byteLength }])
  assert.equal(state.deletes.length, 0)
  assert.equal(state.assets.length, 1)
  assert.equal(state.assets[0]?.provider, 'cloudflare_r2')
  assert.equal(state.assets[0]?.kind, 'video')
  assert.equal(state.assets[0]?.mime_type, 'video/mp4')
  assert.equal(state.assets[0]?.file_size, mp4Signature.byteLength)
  assert.equal(state.assets[0]?.r2_key, state.putKeys[0])
  assert.equal(state.assets[0]?.public_url, `https://media.example.com/${state.putKeys[0]}`)
})

test('rejects an oversized declared body before R2 receives a stream', async () => {
  const response = await handler(event({
    headers: {
      'content-length': String(50 * 1024 * 1024 + 1),
      'content-type': 'video/mp4',
    },
  }))

  assert.equal(response.status, 413)
  assert.equal(state.putBodies.length, 0)
  assert.equal(state.assets.length, 0)
})

test('deletes the R2 object once when magic bytes do not match the declared MIME', async () => {
  storedSignature = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])

  await assert.rejects(() => handler(event()), /File type mismatch/)

  assert.equal(state.putBodies.length, 1)
  assert.deepEqual(state.deletes, [state.putKeys[0]])
  assert.equal(state.assets.length, 0)
})

test('surfaces both the upload and one-attempt cleanup errors', async () => {
  storedSignature = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
  state.deleteError = new Error('R2 delete unavailable')

  const response = await handler(event())

  assert.equal(response.status, 500)
  assert.match(String(response.body.error), /File type mismatch/)
  assert.match(String(response.body.error), /R2 delete unavailable/)
  assert.deepEqual(state.deletes, [state.putKeys[0]])
  assert.equal(state.assets.length, 0)
})
