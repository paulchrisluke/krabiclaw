import ogImagePart1 from '~/server/assets/og-image-part-1'
import ogImagePart2 from '~/server/assets/og-image-part-2'

const OG_IMAGE_BASE64 = `${ogImagePart1}${ogImagePart2}`

export default defineEventHandler(() => {
  const binary = atob(OG_IMAGE_BASE64)
  const image = Uint8Array.from(binary, character => character.charCodeAt(0))

  return new Response(image, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
