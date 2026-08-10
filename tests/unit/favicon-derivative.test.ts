import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { normalizeFaviconSourceToPng } from '../../server/utils/favicon-derivative.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const resvgWasmModule = await readFile(path.join(repoRoot, 'node_modules/@resvg/resvg-wasm/index_bg.wasm'))
const webpDecoderWasmModule = await WebAssembly.compile(
  await readFile(path.join(repoRoot, 'node_modules/@jsquash/webp/codec/dec/webp_dec.wasm')),
)
const pngEncoderWasmModule = await WebAssembly.compile(
  await readFile(path.join(repoRoot, 'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm')),
)

async function assertCanonicalPng(source: Buffer, sourceType: string) {
  const bytes = await normalizeFaviconSourceToPng(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer,
    sourceType,
    { resvgWasmModule, webpDecoderWasmModule, pngEncoderWasmModule },
  )
  const metadata = await sharp(bytes).metadata()
  assert.equal(metadata.format, 'png')
  assert.equal(metadata.width, 512)
  assert.equal(metadata.height, 512)
}

test('normalizes JPEG, PNG, WebP, and SVG favicon sources to square 512px PNG', async () => {
  const raster = sharp({
    create: { width: 300, height: 120, channels: 4, background: { r: 20, g: 80, b: 160, alpha: 0.8 } },
  })
  const [jpeg, png, webp] = await Promise.all([
    raster.clone().jpeg().toBuffer(),
    raster.clone().png().toBuffer(),
    raster.clone().webp().toBuffer(),
  ])
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120"><rect width="300" height="120" fill="#1450a0"/></svg>')

  await assertCanonicalPng(jpeg, 'image/jpeg')
  await assertCanonicalPng(png, 'image/png')
  await assertCanonicalPng(webp, 'image/webp')
  await assertCanonicalPng(svg, 'image/svg+xml')
})

test('rejects non-image favicon sources', async () => {
  await assert.rejects(
    normalizeFaviconSourceToPng(new TextEncoder().encode('not an image').buffer, 'text/plain', { resvgWasmModule }),
    /Unsupported logo type for favicon/,
  )
})
