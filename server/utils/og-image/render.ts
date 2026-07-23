import satori, { init as initSatori } from 'satori/standalone'
import { Resvg, initWasm, type InitInput } from '@resvg/resvg-wasm'
import type { ReactNode } from 'react'
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, type OgImageRenderPayload } from '~/utils/social-metadata'
import { getOgImageFonts } from './fonts.ts'
import { resolveOgImageRenderer } from './renderers/index.ts'
import { fetchImageAsDataUri } from './fetch-image.ts'
import { convertWebpDataUriToPng } from './webp-to-png.ts'
import platformLogoBase64 from '~/server/assets/platform-logo'

// A same-zone self-fetch (this Worker requesting its own krabiclaw.com/krabi-claw-logo.png)
// was found to silently fail in production while third-party image URLs fetch fine — see
// server/assets/platform-logo.ts. Resolve the platform's own logo from the bundled asset
// instead of going through fetchImageAsDataUri whenever the URL points at that file, so the
// brand mark on platform-template cards never depends on that self-fetch succeeding.
function resolveLogoDataUri(logoUrl: string | null | undefined): Promise<string | null> {
  if (logoUrl) {
    try {
      const url = new URL(logoUrl)
      const platformDomain = process.env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com'
      const platformOrigin = platformDomain.startsWith('http') ? platformDomain : `https://${platformDomain}`
      if (url.pathname === '/krabi-claw-logo.png' && url.origin === new URL(platformOrigin).origin) {
        return Promise.resolve(`data:image/png;base64,${platformLogoBase64}`)
      }
    } catch {
      // Not a parseable absolute URL — fall through to the normal fetch path.
    }
  }
  return fetchImageAsDataUri(logoUrl, { timeoutMs: 4000 })
}

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

async function loadBundledWebpDecoderWasm(): Promise<WebAssembly.Module> {
  const { default: wasmModule } = await import('@jsquash/webp/codec/dec/webp_dec.wasm')
  return wasmModule
}

async function loadBundledPngEncoderWasm(): Promise<WebAssembly.Module> {
  // squoosh_png_bg.wasm ships its own wasm-bindgen .d.ts declaring named function exports,
  // which TypeScript prefers over this repo's ambient `declare module '*.wasm'` default-export
  // fallback (types/wasm.d.ts) — the real runtime import (matching resvg/yoga/webp_dec, all
  // bundled by Wrangler as a precompiled Module) does resolve to { default: WebAssembly.Module }.
  const mod = await import('@jsquash/png/codec/pkg/squoosh_png_bg.wasm') as unknown as { default: WebAssembly.Module }
  return mod.default
}

// Satori 0.26's image decoder throws for WebP data URIs — see the acceptedContentTypes
// comment below. Tenant media (background photos, logos, favicons) is sometimes imported
// as WebP unchanged from its original source file, so any of the three image slots below
// can hit this. Re-encode to PNG rather than reject outright, so imported WebP photos
// still render instead of silently falling back to the flat template gradient.
async function resolveWebpSafeDataUri(
  dataUri: string | null,
  deps: Pick<RenderOgImageDeps, 'webpDecoderWasmModule' | 'pngEncoderWasmModule'>,
): Promise<string | null> {
  if (!dataUri || !dataUri.startsWith('data:image/webp')) return dataUri
  const [webpDecoderWasmModule, pngEncoderWasmModule] = await Promise.all([
    deps.webpDecoderWasmModule ? Promise.resolve(deps.webpDecoderWasmModule) : loadBundledWebpDecoderWasm(),
    deps.pngEncoderWasmModule ? Promise.resolve(deps.pngEncoderWasmModule) : loadBundledPngEncoderWasm(),
  ])
  return convertWebpDataUriToPng(dataUri, { webpDecoderWasmModule, pngEncoderWasmModule })
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
  /**
   * jsquash's emscripten/wasm-bindgen glue instantiates from a real WebAssembly.Module
   * (not raw bytes) — tests must pass an already-compiled Module. Deployed Workers omit
   * these so Wrangler supplies the statically imported files as precompiled Modules.
   */
  webpDecoderWasmModule?: WebAssembly.Module
  pngEncoderWasmModule?: WebAssembly.Module
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

  const [rawBackgroundImageDataUri, rawLogoDataUri, rawFaviconDataUri] = await Promise.all([
    // WebP is accepted here (unlike before) and converted to PNG below via
    // resolveWebpSafeDataUri — Satori itself still can't decode WebP directly.
    fetchImageAsDataUri(payload.backgroundImageUrl, {
      timeoutMs: 4000,
      acceptedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    }),
    resolveLogoDataUri(payload.logoUrl),
    fetchImageAsDataUri(payload.faviconUrl, { timeoutMs: 4000 }),
  ])

  const [backgroundImageDataUri, logoDataUri, faviconDataUri] = await Promise.all([
    resolveWebpSafeDataUri(rawBackgroundImageDataUri, deps),
    resolveWebpSafeDataUri(rawLogoDataUri, deps),
    resolveWebpSafeDataUri(rawFaviconDataUri, deps),
  ])

  const renderer = resolveOgImageRenderer(payload.template)
  const tree = renderer({ ...payload, backgroundImageDataUri, logoDataUri, faviconDataUri })

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
