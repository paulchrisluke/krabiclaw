import { createError } from 'h3'
import { Resvg } from '@resvg/resvg-wasm'
import type { InitInput } from '@resvg/resvg-wasm'
import { getR2KeyFromPublicUrl, getR2Url, uploadToR2 } from '~/server/utils/cloudflare-r2'
import { isCloudflareImagesUrl } from '~/server/utils/tenant-favicon'
import { ensureResvgInitialized } from '~/server/utils/resvg-runtime'
import { convertWebpBytesToPng } from '~/server/utils/og-image/webp-to-png'

const FAVICON_SIZE = 512
const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const SUPPORTED_SOURCE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
])

function mediaBucket(env: ApiRecord): R2Bucket {
  if (!env.MEDIA_BUCKET) throw new Error('MEDIA_BUCKET binding not available')
  return env.MEDIA_BUCKET
}

function contentType(headers: Headers): string {
  return headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() || ''
}

function cloudflareSquareSourceUrl(sourceUrl: string): string {
  return sourceUrl.replace(
    /\/[a-zA-Z0-9_-]+$/,
    `/w=${FAVICON_SIZE},h=${FAVICON_SIZE},fit=pad,background=white,anim=false,f=webp`,
  )
}

async function readBoundedResponse(response: Response): Promise<ArrayBuffer> {
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > MAX_SOURCE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Logo exceeds the 10 MB favicon source limit' })
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Logo exceeds the 10 MB favicon source limit' })
  }
  return bytes
}

async function loadSource(env: ApiRecord, sourceUrl: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const r2Key = getR2KeyFromPublicUrl(env, sourceUrl)
  if (r2Key) {
    const object = await mediaBucket(env).get(r2Key)
    if (!object) throw createError({ statusCode: 422, statusMessage: 'Logo media object is missing' })
    if (object.size > MAX_SOURCE_BYTES) {
      throw createError({ statusCode: 413, statusMessage: 'Logo exceeds the 10 MB favicon source limit' })
    }
    const type = object.httpMetadata?.contentType?.split(';', 1)[0]?.trim().toLowerCase() || ''
    return { bytes: await object.arrayBuffer(), contentType: type }
  }

  if (!isCloudflareImagesUrl(sourceUrl)) {
    throw createError({ statusCode: 422, statusMessage: 'Site logos must use managed KrabiClaw media' })
  }

  const response = await fetch(cloudflareSquareSourceUrl(sourceUrl), {
    headers: { accept: 'image/webp,image/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw createError({ statusCode: 422, statusMessage: `Could not read the uploaded logo (${response.status})` })
  }
  return { bytes: await readBoundedResponse(response), contentType: contentType(response.headers) }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export interface FaviconNormalizationDeps {
  resvgWasmModule?: InitInput
  webpDecoderWasmModule?: WebAssembly.Module
  pngEncoderWasmModule?: WebAssembly.Module
}

async function renderEmbeddedSourceToPng(
  bytes: ArrayBuffer,
  sourceType: string,
  deps: FaviconNormalizationDeps,
): Promise<Uint8Array> {
  await ensureResvgInitialized(deps.resvgWasmModule)
  const source = `data:${sourceType};base64,${arrayBufferToBase64(bytes)}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FAVICON_SIZE}" height="${FAVICON_SIZE}" viewBox="0 0 ${FAVICON_SIZE} ${FAVICON_SIZE}"><rect width="100%" height="100%" fill="white"/><image href="${source}" x="0" y="0" width="${FAVICON_SIZE}" height="${FAVICON_SIZE}" preserveAspectRatio="xMidYMid meet"/></svg>`
  const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: FAVICON_SIZE } })
  try {
    const rendered = renderer.render()
    try {
      return rendered.asPng()
    } finally {
      rendered.free()
    }
  } finally {
    renderer.free()
  }
}

export async function normalizeFaviconSourceToPng(
  bytes: ArrayBuffer,
  sourceType: string,
  deps: FaviconNormalizationDeps = {},
): Promise<Uint8Array> {
  if (!SUPPORTED_SOURCE_TYPES.has(sourceType)) {
    throw createError({ statusCode: 415, statusMessage: `Unsupported logo type for favicon: ${sourceType || 'unknown'}` })
  }
  if (sourceType === 'image/webp') {
    const webpDecoderWasmModule = deps.webpDecoderWasmModule ?? (await import('@jsquash/webp/codec/dec/webp_dec.wasm')).default
    const pngEncoderWasmModule = deps.pngEncoderWasmModule
      ?? (await import('@jsquash/png/codec/pkg/squoosh_png_bg.wasm') as unknown as { default: WebAssembly.Module }).default
    const png = await convertWebpBytesToPng(bytes, {
      webpDecoderWasmModule,
      pngEncoderWasmModule,
    })
    if (!png) throw createError({ statusCode: 422, statusMessage: 'Could not convert the uploaded logo to PNG' })
    const pngBuffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer
    return renderEmbeddedSourceToPng(pngBuffer, 'image/png', deps)
  }
  return renderEmbeddedSourceToPng(bytes, sourceType, deps)
}

export async function materializeTenantFavicon(
  env: ApiRecord,
  input: { siteId: string; assetId: string; sourceUrl: string },
): Promise<{ key: string; publicUrl: string }> {
  const source = await loadSource(env, input.sourceUrl)
  const png = await normalizeFaviconSourceToPng(source.bytes, source.contentType)
  const key = `sites/${input.siteId}/favicons/${input.assetId}.png`
  await uploadToR2(env, key, png, 'image/png')
  return { key, publicUrl: getR2Url(env, key) }
}
