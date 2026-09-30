import sharp from 'sharp'
import { DOCS_CATEGORY_ART } from '../utils/docs-category-art.ts'
// Offline build assets only: no CMS writes or authenticated requests.
for (const [slug, art] of Object.entries(DOCS_CATEGORY_ART)) {
  const base = `public/platform/docs/categories/${art.file}`
  const metadata = await sharp(`${base}.png`).metadata()
  const stats = await sharp(`${base}.png`).stats()
  if (!metadata.hasAlpha || stats.channels[3].min !== 0) throw new Error(`${slug}: transparent source required`)
  const artwork = await sharp(`${base}.png`).resize(1080, 600, { fit: 'inside' }).toBuffer()
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#101123' } })
    .composite([{ input: artwork, gravity: 'center' }]).removeAlpha().png().toFile(`${base}-og.png`)
  console.log(`${slug}: ${metadata.width}x${metadata.height} transparent source → opaque 1200x630 OG`)
}
