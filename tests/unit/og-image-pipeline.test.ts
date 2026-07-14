import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOgImage } from '~/server/utils/og-image/pipeline.ts'
import { computeOgImageCacheKey, type OgImageRenderPayload } from '~/utils/social-metadata.ts'
import { __resetOgRendererWasmCacheForTests, OG_RENDERER_WASM_R2_KEY } from '~/server/utils/og-image/wasm-loader.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

const PAYLOAD: OgImageRenderPayload = {
  template: 'platform',
  title: 'Test Page',
  description: 'A test description.',
  siteName: 'KrabiClaw',
}

function fakeEvent(env: Record<string, unknown>) {
  return { context: { cloudflare: { env } } } as unknown as Parameters<typeof resolveOgImage>[0]
}

class FakeKv {
  store = new Map<string, ArrayBuffer>()
  async get(key: string, _type: 'arrayBuffer') {
    return this.store.get(key) ?? null
  }
  async put(key: string, value: ArrayBuffer) {
    this.store.set(key, value)
  }
}

class FakeBucket {
  object: { arrayBuffer(): Promise<ArrayBuffer> } | null
  constructor(object: { arrayBuffer(): Promise<ArrayBuffer> } | null) {
    this.object = object
  }
  async get(key: string) {
    if (key !== OG_RENDERER_WASM_R2_KEY) return null
    return this.object
  }
}

test.beforeEach(() => {
  __resetOgRendererWasmCacheForTests()
})

test('resolveOgImage falls back to the static image when no R2/KV bindings are present', async () => {
  const result = await resolveOgImage(fakeEvent({}), PAYLOAD)
  assert.equal(result.source, 'fallback')
  assert.ok(result.bytes.byteLength > 0)
  assert.equal(result.cacheKey, computeOgImageCacheKey(PAYLOAD))
})

test('resolveOgImage falls back to the static image when the R2 wasm object is missing', async () => {
  const bucket = new FakeBucket(null)
  const result = await resolveOgImage(fakeEvent({ MEDIA_BUCKET: bucket }), PAYLOAD)
  assert.equal(result.source, 'fallback')
})

test('resolveOgImage renders and caches in KV when both bindings are present, then serves from cache on the next call', async () => {
  const wasmBytes = await readFile(path.join(repoRoot, 'node_modules/@resvg/resvg-wasm/index_bg.wasm'))
  const bucket = new FakeBucket({ arrayBuffer: async () => wasmBytes.buffer as ArrayBuffer })
  const kv = new FakeKv()
  const env = { MEDIA_BUCKET: bucket, SITE_CACHE: kv }

  const first = await resolveOgImage(fakeEvent(env), PAYLOAD)
  assert.equal(first.source, 'generated')
  assert.ok(first.bytes.byteLength > 1000)

  assert.equal(kv.store.size, 1, 'should have written the rendered bytes to KV')

  const second = await resolveOgImage(fakeEvent(env), PAYLOAD)
  assert.equal(second.source, 'cache')
  assert.deepEqual(Array.from(second.bytes), Array.from(first.bytes))
})

test('resolveOgImage cache key is stable across calls for identical payloads and differs for different ones', async () => {
  const other: OgImageRenderPayload = { ...PAYLOAD, title: 'Different Title' }
  const a = await resolveOgImage(fakeEvent({}), PAYLOAD)
  const b = await resolveOgImage(fakeEvent({}), PAYLOAD)
  const c = await resolveOgImage(fakeEvent({}), other)
  assert.equal(a.cacheKey, b.cacheKey)
  assert.notEqual(a.cacheKey, c.cacheKey)
})
