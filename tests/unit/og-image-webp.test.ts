import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

const { convertWebpDataUriToPng } = await import('../../server/utils/og-image/webp-to-png.ts')

// jsquash's emscripten/wasm-bindgen glue instantiates from a real, already-compiled
// WebAssembly.Module (unlike resvg/satori, which accept raw bytes directly) — see
// webp-to-png.ts's WebpToPngWasmDeps comment.
const webpDecoderWasmModule = await WebAssembly.compile(
  await readFile(path.join(repoRoot, 'node_modules/@jsquash/webp/codec/dec/webp_dec.wasm')),
)
const pngEncoderWasmModule = await WebAssembly.compile(
  await readFile(path.join(repoRoot, 'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm')),
)

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function assertPngSignature(bytes: Uint8Array) {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    assert.equal(bytes[i], PNG_SIGNATURE[i], 'output must start with the PNG signature')
  }
}

test('convertWebpDataUriToPng converts a real WebP image to a decodable PNG data URI', async () => {
  const webpBuffer = await sharp({
    create: { width: 4, height: 3, channels: 3, background: { r: 200, g: 50, b: 10 } },
  }).webp().toBuffer()
  const webpDataUri = `data:image/webp;base64,${webpBuffer.toString('base64')}`

  const pngDataUri = await convertWebpDataUriToPng(webpDataUri, {
    webpDecoderWasmModule,
    pngEncoderWasmModule,
  })

  assert.ok(pngDataUri, 'conversion should succeed for a valid WebP image')
  assert.match(pngDataUri!, /^data:image\/png;base64,/)

  const pngBytes = Buffer.from(pngDataUri!.slice('data:image/png;base64,'.length), 'base64')
  assertPngSignature(pngBytes)

  // Round-trip through sharp to confirm the re-encoded PNG is actually a valid,
  // correctly-sized image — not just bytes that merely start with the right signature.
  const decoded = await sharp(pngBytes).metadata()
  assert.equal(decoded.width, 4)
  assert.equal(decoded.height, 3)
})

test('convertWebpDataUriToPng passes through null for a non-WebP data URI', async () => {
  const result = await convertWebpDataUriToPng('data:image/png;base64,abc123', {
    webpDecoderWasmModule,
    pngEncoderWasmModule,
  })
  assert.equal(result, null)
})

test('convertWebpDataUriToPng returns null rather than throwing for malformed WebP bytes', async () => {
  const badWebpDataUri = `data:image/webp;base64,${Buffer.from('not a real webp').toString('base64')}`
  const result = await convertWebpDataUriToPng(badWebpDataUri, {
    webpDecoderWasmModule,
    pngEncoderWasmModule,
  })
  assert.equal(result, null)
})
