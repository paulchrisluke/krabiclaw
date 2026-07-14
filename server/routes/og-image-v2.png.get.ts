import ogImageFallbackBase64 from '~/server/assets/og-image-fallback'

// Static, hand-verified 1200x630 fallback image — the safety net tier of the OG image
// pipeline (server/utils/og-image/pipeline.ts) when dynamic rendering isn't available.
// Regenerate with `node scripts/generate-og-fallback-image.mjs` if the brand card changes.

// Decoded once per Worker isolate (lazily, on first request), not per request —
// mirrors pipeline.ts's own getFallbackBytes() caching convention.
let cachedImage: ReturnType<typeof Uint8Array.from> | null = null
function getImage() {
  if (!cachedImage) {
    const binary = atob(ogImageFallbackBase64)
    cachedImage = Uint8Array.from(binary, character => character.charCodeAt(0))
  }
  return cachedImage
}

export default defineEventHandler(() => {
  const image = getImage()

  return new Response(image, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(image.byteLength),
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
