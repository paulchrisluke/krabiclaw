import ogImageFallbackBase64 from '~/server/assets/og-image-fallback'

// Static, hand-verified 1200x630 fallback image — the safety net tier of the OG image
// pipeline (server/utils/og-image/pipeline.ts) when dynamic rendering isn't available.
// Regenerate with `node scripts/generate-og-fallback-image.mjs` if the brand card changes.
export default defineEventHandler(() => {
  const binary = atob(ogImageFallbackBase64)
  const image = Uint8Array.from(binary, character => character.charCodeAt(0))

  return new Response(image, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(image.byteLength),
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
