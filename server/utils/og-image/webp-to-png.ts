import decodeWebp, { init as initWebpDecoder } from '@jsquash/webp/decode.js'
import encodePng, { init as initPngEncoder } from '@jsquash/png/encode.js'

// initWebpDecoder()/initPngEncoder() may only run once per isolate — cached at module scope
// so repeated conversions in the same Worker isolate (or the same test process) reuse the
// initialized module, matching the resvg/satori init pattern in render.ts.
let webpDecoderInit: Promise<unknown> | null = null
let pngEncoderInit: Promise<unknown> | null = null

async function ensureWebpDecoderInitialized(wasmModule?: WebAssembly.Module): Promise<void> {
  if (!webpDecoderInit) {
    webpDecoderInit = Promise.resolve(initWebpDecoder(wasmModule)).catch((error) => {
      webpDecoderInit = null
      throw error
    })
  }
  await webpDecoderInit
}

async function ensurePngEncoderInitialized(wasmModule?: WebAssembly.Module): Promise<void> {
  if (!pngEncoderInit) {
    pngEncoderInit = Promise.resolve(initPngEncoder(wasmModule)).catch((error) => {
      pngEncoderInit = null
      throw error
    })
  }
  await pngEncoderInit
}

export interface WebpToPngWasmDeps {
  webpDecoderWasmModule?: WebAssembly.Module
  pngEncoderWasmModule?: WebAssembly.Module
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
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

/**
 * Converts a `data:image/webp;base64,...` URI to an equivalent `data:image/png;base64,...`
 * URI. Satori 0.26's image decoder throws for WebP data URIs (see render.ts's
 * acceptedContentTypes comment), so any tenant media stored as WebP — e.g. imported
 * client photos carried over from their original source file's format, unchanged — needs
 * re-encoding before it can be used as an OG image background or brand mark.
 *
 * Returns null (rather than throwing) on any decode/encode failure, matching
 * fetchImageAsDataUri's fail-soft contract — an OG image background is always optional.
 */
export async function convertWebpDataUriToPng(
  dataUri: string,
  deps: WebpToPngWasmDeps = {},
): Promise<string | null> {
  const match = /^data:image\/webp;base64,(.+)$/.exec(dataUri)
  if (!match) return null
  try {
    await Promise.all([
      ensureWebpDecoderInitialized(deps.webpDecoderWasmModule),
      ensurePngEncoderInitialized(deps.pngEncoderWasmModule),
    ])
    const webpBytes = base64ToUint8Array(match[1]!)
    // base64ToUint8Array always allocates a fresh, dedicated ArrayBuffer (never a
    // SharedArrayBuffer or a view into a larger buffer), so this is a safe narrowing —
    // Uint8Array.prototype.buffer is just typed broadly as ArrayBufferLike in lib.dom.
    const imageData = await decodeWebp(webpBytes.buffer as ArrayBuffer)
    if (!imageData) return null
    const pngBuffer = await encodePng(imageData)
    return `data:image/png;base64,${arrayBufferToBase64(pngBuffer)}`
  } catch {
    return null
  }
}
