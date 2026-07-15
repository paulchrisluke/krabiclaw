import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

// Stub the remote-image fetch so the "unresolvable background image" test below is
// deterministic and offline — it exercises renderOgImagePng's fallback-on-failure
// branch, not real DNS/network failure behavior against a .invalid host (which is
// slow and can behave differently, or be entirely blocked, in CI).
mock.module('../../server/utils/og-image/fetch-image.ts', {
  namedExports: { fetchImageAsDataUri: async () => null },
})

const { renderOgImagePng } = await import('../../server/utils/og-image/render.ts')

async function loadWasmBytes() {
  return await readFile(path.join(repoRoot, 'node_modules/@resvg/resvg-wasm/index_bg.wasm'))
}

/** Reads just enough of a PNG's IHDR chunk to assert width/height without a decoder dependency. */
function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < signature.length; i++) {
    assert.equal(bytes[i], signature[i], 'output must start with the PNG signature')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // IHDR chunk always immediately follows the 8-byte signature: 4-byte length, 4-byte "IHDR",
  // then 4-byte width, 4-byte height (big-endian).
  const chunkType = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!)
  assert.equal(chunkType, 'IHDR')
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

test('renderOgImagePng produces real, decodable 1200x630 PNG bytes for the platform template', async () => {
  const wasmBytes = await loadWasmBytes()
  const bytes = await renderOgImagePng(
    {
      template: 'platform',
      title: 'Local SEO Websites Managed Through ChatGPT',
      description: 'Beautiful local business websites edited through ChatGPT.',
      siteName: 'KrabiClaw',
    },
    { wasmModule: wasmBytes },
  )

  assert.ok(bytes.byteLength > 1000, 'rendered image should not be a trivially empty file')
  const { width, height } = readPngDimensions(bytes)
  assert.equal(width, 1200)
  assert.equal(height, 630)
})

test('renderOgImagePng produces valid output for the saya and blawby templates too', async () => {
  const wasmBytes = await loadWasmBytes()

  for (const template of ['saya', 'blawby'] as const) {
    const bytes = await renderOgImagePng(
      {
        template,
        title: `${template} card`,
        description: 'A generated social card.',
        siteName: 'Example Business',
        label: 'Service',
      },
      { wasmModule: wasmBytes },
    )
    const { width, height } = readPngDimensions(bytes)
    assert.equal(width, 1200, `${template} width`)
    assert.equal(height, 630, `${template} height`)
  }
})

test('renderOgImagePng ignores an unresolvable background image URL rather than failing', async () => {
  const wasmBytes = await loadWasmBytes()
  const bytes = await renderOgImagePng(
    {
      template: 'blawby',
      title: 'Estate Planning',
      siteName: 'North Carolina Legal Services',
      backgroundImageUrl: 'https://this-host-does-not-exist.invalid/hero.jpg',
    },
    { wasmModule: wasmBytes },
  )
  const { width, height } = readPngDimensions(bytes)
  assert.equal(width, 1200)
  assert.equal(height, 630)
})
