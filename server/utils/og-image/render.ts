import satori, { init as initSatori } from 'satori/standalone'
import { Resvg, initWasm, type InitInput } from '@resvg/resvg-wasm'
import type { ReactNode } from 'react'
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, type OgImageRenderPayload } from '~/utils/social-metadata'
import { getOgImageFonts } from './fonts.ts'
import { resolveOgImageRenderer } from './renderers/index.ts'
import { fetchImageAsDataUri } from './fetch-image.ts'

// initWasm() may only run once per isolate. Cached at module scope so repeated renders in
// the same Worker isolate (or the same test process) reuse the initialized module.
let resvgInit: Promise<void> | null = null
let satoriInit: Promise<void> | null = null

async function loadBundledResvgWasm(): Promise<WebAssembly.Module> {
  const { default: wasmModule } = await import('@resvg/resvg-wasm/index_bg.wasm')
  return wasmModule
}

async function loadBundledYogaWasm(): Promise<WebAssembly.Module> {
  const { default: wasmModule } = await import('satori/yoga.wasm')
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

async function ensureSatoriInitialized(wasmModule?: InitInput): Promise<void> {
  if (!satoriInit) {
    satoriInit = Promise.resolve(wasmModule ?? loadBundledYogaWasm())
      .then(module => initSatori(module))
      .catch((error) => {
        satoriInit = null
        throw error
      })
  }
  await satoriInit
}

export interface RenderOgImageDeps {
  /**
   * Tests and local scripts can provide raw bytes. Deployed Workers omit this so Wrangler
   * supplies the statically imported file as a precompiled WebAssembly.Module.
   */
  wasmModule?: InitInput
  yogaModule?: InitInput
}

/** Renders one OG image payload to real, decodable 1200×630 PNG bytes. */
export async function renderOgImagePng(
  payload: OgImageRenderPayload,
  deps: RenderOgImageDeps,
): Promise<Uint8Array> {
  await Promise.all([
    ensureResvgInitialized(deps.wasmModule),
    ensureSatoriInitialized(deps.yogaModule),
  ])

  const [backgroundImageDataUri, logoDataUri] = await Promise.all([
    // Satori 0.26's image decoder throws for WebP data URIs. A background is optional,
    // so keep the page-specific title/branding on the template gradient instead of
    // failing the whole card into the generic static fallback.
    fetchImageAsDataUri(payload.backgroundImageUrl, {
      timeoutMs: 4000,
      acceptedContentTypes: ['image/png', 'image/jpeg'],
    }),
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
