import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOgImage } from '~/server/utils/og-image/pipeline.ts'
import { renderOgImagePng } from '~/server/utils/og-image/render.ts'
import { computeOgImageCacheKey, type OgImageRenderPayload } from '~/utils/social-metadata.ts'

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

const wasmBytes = await readFile(path.join(repoRoot, 'node_modules/@resvg/resvg-wasm/index_bg.wasm'))
const yogaBytes = await readFile(path.join(repoRoot, 'node_modules/satori/yoga.wasm'))
const deps = {
  render: (payload: OgImageRenderPayload) => renderOgImagePng(payload, {
    wasmModule: wasmBytes,
    yogaModule: yogaBytes,
  }),
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

test('resolveOgImage renders without R2/KV bindings', async () => {
  const result = await resolveOgImage(fakeEvent({}), PAYLOAD, deps)
  assert.equal(result.source, 'generated')
  assert.ok(result.bytes.byteLength > 0)
  assert.equal(result.cacheKey, computeOgImageCacheKey(PAYLOAD))
})

test('resolveOgImage identifies renderer failures when serving the static fallback', async () => {
  const result = await resolveOgImage(fakeEvent({}), PAYLOAD, {
    render: async () => { throw new Error('renderer unavailable') },
  })
  assert.equal(result.source, 'fallback')
  assert.equal(result.fallbackReason, 'renderer_error')
})

test('resolveOgImage renders and caches in KV, then serves from cache on the next call', async () => {
  const kv = new FakeKv()
  const env = { SITE_CACHE: kv }

  const first = await resolveOgImage(fakeEvent(env), PAYLOAD, deps)
  assert.equal(first.source, 'generated')
  assert.ok(first.bytes.byteLength > 1000)

  assert.equal(kv.store.size, 1, 'should have written the rendered bytes to KV')

  const second = await resolveOgImage(fakeEvent(env), PAYLOAD, deps)
  assert.equal(second.source, 'cache')
  assert.deepEqual(Array.from(second.bytes), Array.from(first.bytes))
})

test('resolveOgImage cache key is stable across calls for identical payloads and differs for different ones', async () => {
  const other: OgImageRenderPayload = { ...PAYLOAD, title: 'Different Title' }
  const a = await resolveOgImage(fakeEvent({}), PAYLOAD, deps)
  const b = await resolveOgImage(fakeEvent({}), PAYLOAD, deps)
  const c = await resolveOgImage(fakeEvent({}), other, deps)
  assert.equal(a.cacheKey, b.cacheKey)
  assert.notEqual(a.cacheKey, c.cacheKey)
})
