/**
 * Loads the resvg-wasm binary (~2.4MB) that server/utils/og-image/render.ts needs to
 * rasterize an SVG card to PNG. This is never bundled into the Worker script directly —
 * inlining ~3.3MB of base64 into the build risks the Cloudflare Workers script-size
 * budget on top of the rest of this app's Nitro bundle. Instead it's stored once in the
 * existing MEDIA_BUCKET R2 bucket (see scripts/upload-og-renderer-assets.mjs) and fetched
 * on first use per isolate, then cached at module scope for the isolate's lifetime.
 *
 * If the object hasn't been uploaded yet (fresh environment, or the one-time setup step
 * hasn't run), this resolves to null and the pipeline falls back to the static shared OG
 * image rather than failing the request — see server/utils/og-image/pipeline.ts.
 */
export const OG_RENDERER_WASM_R2_KEY = '_internal/og-renderer/resvg.wasm'

let cachedWasmBytes: ArrayBuffer | null = null

export interface R2LikeBucket {
  get(_key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
}

export async function loadResvgWasmFromR2(bucket: R2LikeBucket): Promise<ArrayBuffer | null> {
  if (cachedWasmBytes) return cachedWasmBytes
  try {
    const object = await bucket.get(OG_RENDERER_WASM_R2_KEY)
    if (!object) return null
    cachedWasmBytes = await object.arrayBuffer()
    return cachedWasmBytes
  } catch {
    return null
  }
}

/** Test-only hook to reset the module-scope cache between unit tests. */
export function __resetOgRendererWasmCacheForTests(): void {
  cachedWasmBytes = null
}
