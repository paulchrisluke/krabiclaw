import ogImagePart1 from '~/server/assets/og-image-part-1'
import ogImagePart2 from '~/server/assets/og-image-part-2'

const OG_IMAGE_BASE64 = `${ogImagePart1}${ogImagePart2}`

export default defineEventHandler((event) => {
  const binary = atob(OG_IMAGE_BASE64)
  const image = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    image[index] = binary.charCodeAt(index)
  }

  setHeader(event, 'Content-Type', 'image/jpeg')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'Content-Length', image.byteLength)

  return image
})
