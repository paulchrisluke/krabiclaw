import satori from 'satori'
import { Resvg, initWasm, type InitInput } from '@resvg/resvg-wasm'
import type { ReactNode } from 'react'
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, type OgImageRenderPayload } from '~/utils/social-metadata'
import { getOgImageFonts } from './fonts.ts'
import { resolveOgImageRenderer } from './renderers/index.ts'
import { fetchImageAsDataUri } from './fetch-image.ts'

// initWasm() may only run once per isolate. Cached at module scope so repeated renders in
// the same Worker isolate (or the same test process) reuse the initialized module.
let resvgInit: Promise<void> | null = null

async function loadBundledResvgWasm(): Promise<WebAssembly.Module> {
  const { default: wasmModule } = await import('@resvg/resvg-wasm/index_bg.wasm')
  return wasmModule
}

async function ensureResvgInitialized(wasmModule?: InitInput): Promise<void> {
  if (!resvgInit) {
    resvgInit = Promise.resolve(wasmModule ?? loadBundledResvgWasm())
      .then(module => initWasm(module))
      .catch((error) => {
        resvgInit = null
        throw error
      })
  }
  await resvgInit
}

export interface RenderOgImageDeps {
  /**
   * Tests and local scripts can provide raw bytes. Deployed Workers omit this so Wrangler
   * supplies the statically imported file as a precompiled WebAssembly.Module.
   */
  wasmModule?: InitInput
}

/** Renders one OG image payload to real, decodable 1200×630 PNG bytes. */
export async function renderOgImagePng(
  payload: OgImageRenderPayload,
  deps: RenderOgImageDeps,
): Promise<Uint8Array> {
  await ensureResvgInitialized(deps.wasmModule)

  const [backgroundImageDataUri, logoDataUri] = await Promise.all([
    fetchImageAsDataUri(payload.backgroundImageUrl, { timeoutMs: 4000 }),
    fetchImageAsDataUri(payload.logoUrl, { timeoutMs: 4000 }),
  ])

  const renderer = resolveOgImageRenderer(payload.template)
  const tree = renderer({ ...payload, backgroundImageDataUri, logoDataUri })

  const svg = await satori(tree as unknown as ReactNode, {
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
    fonts: getOgImageFonts(),
  })

  // Resvg/RenderedImage hold WASM linear memory that isn't GC'd by JS — free()
  // both regardless of outcome so repeated renders in the same Worker isolate
  // (resvgInit is cached at module scope) don't leak memory across requests.
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: OG_IMAGE_WIDTH } })
  try {
    const rendered = resvg.render()
    try {
      return rendered.asPng()
    } finally {
      rendered.free()
    }
  } finally {
    resvg.free()
  }
}
