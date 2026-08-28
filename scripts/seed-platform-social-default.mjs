#!/usr/bin/env node
// One-off seed: uploads the platform's real default OG image to Cloudflare Images and creates
// the media_assets/media_placements rows every platform-owned page (and any tenant site with
// zero real media) falls back to — see server/utils/social-image-resolver.ts. Idempotent: re-
// running replaces the existing 'platform:platform:site:og_default' placement rather than
// duplicating it.
//
// Requires real Cloudflare credentials in the environment (CLOUDFLARE_IMAGES_API_TOKEN,
// CF_ACCOUNT_ID, CLOUDFLARE_IMAGES_VARIANT_BASE) — this sandbox does not have them; run this
// from an environment that does (see .env.example).
//
// Precondition: the reserved platform site row (id='platform') must already exist — it's
// created lazily by ensurePlatformMediaScope() (server/utils/platform-media.ts) the first time
// any platform content mutation runs. If `sites` has no id='platform' row yet, trigger that
// first (e.g. create any platform blog post/doc once) before running this script.
//
// Usage:
//   node scripts/seed-platform-social-default.mjs <path-to-1200x630-image> [--remote]
// The image must already be exactly 1200x630 (this script does not resize).

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { extname } from 'node:path'
import sharp from 'sharp'

const IMAGE_PATH = process.argv[2]
const REMOTE = process.argv.includes('--remote')

if (!IMAGE_PATH || !existsSync(IMAGE_PATH)) {
  console.error('Usage: node scripts/seed-platform-social-default.mjs <path-to-1200x630-image> [--remote]')
  process.exit(1)
}

const { width: sourceWidth, height: sourceHeight } = await sharp(IMAGE_PATH).metadata()
if (sourceWidth !== 1200 || sourceHeight !== 630) {
  console.error(`Image must be exactly 1200x630 — got ${sourceWidth}x${sourceHeight}. This script does not resize.`)
  process.exit(1)
}

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID
const CLOUDFLARE_IMAGES_API_TOKEN = process.env.CLOUDFLARE_IMAGES_API_TOKEN
const CLOUDFLARE_IMAGES_VARIANT_BASE = process.env.CLOUDFLARE_IMAGES_VARIANT_BASE
if (!CF_ACCOUNT_ID || !CLOUDFLARE_IMAGES_API_TOKEN || !CLOUDFLARE_IMAGES_VARIANT_BASE) {
  console.error('CF_ACCOUNT_ID, CLOUDFLARE_IMAGES_API_TOKEN, and CLOUDFLARE_IMAGES_VARIANT_BASE must be set (see .env.example).')
  process.exit(1)
}

const MIME_BY_EXT = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }
const mimeType = MIME_BY_EXT[extname(IMAGE_PATH).toLowerCase()]
if (!mimeType) {
  console.error(`Unsupported image extension: ${extname(IMAGE_PATH)}`)
  process.exit(1)
}

async function uploadToCloudflareImages() {
  const buffer = readFileSync(IMAGE_PATH)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimeType }), `platform-og-default${extname(IMAGE_PATH)}`)
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLOUDFLARE_IMAGES_API_TOKEN}` },
    body: form,
  })
  if (!res.ok) throw new Error(`Cloudflare Images upload failed ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const imageId = data?.result?.id
  if (!imageId) throw new Error(`Cloudflare Images upload returned no image id: ${JSON.stringify(data)}`)
  return {
    imageId,
    publicUrl: `${CLOUDFLARE_IMAGES_VARIANT_BASE}/${imageId}/public`,
  }
}

function runD1(sql) {
  // Values interpolated into `sql` are our own generated UUIDs and the CF-returned image
  // id/URL, not user input — sqlString() above still escapes them defensively.
  return execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', REMOTE ? '--remote' : '--local', '--command', sql], { stdio: 'inherit' })
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

async function main() {
  console.log(`Uploading ${IMAGE_PATH} to Cloudflare Images...`)
  const { imageId, publicUrl } = await uploadToCloudflareImages()
  console.log(`Uploaded: ${imageId} -> ${publicUrl}`)

  const assetId = crypto.randomUUID()
  const placementId = crypto.randomUUID()
  const now = new Date().toISOString()

  console.log(`Writing to ${REMOTE ? 'remote (production)' : 'local'} D1...`)
  // wrangler d1 execute --command runs one statement at a time; three separate calls rather
  // than a semicolon-joined string.
  runD1(`INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source, cloudflare_image_id, public_url, mime_type, width, height, alt_text, status, created_by_user_id, created_at, updated_at)
    SELECT ${sqlString(assetId)}, organization_id, id, 'image', 'cloudflare_images', 'uploaded', ${sqlString(imageId)}, ${sqlString(publicUrl)}, ${sqlString(mimeType)}, ${sourceWidth}, ${sourceHeight}, 'KrabiClaw', 'active', NULL, ${sqlString(now)}, ${sqlString(now)}
    FROM sites WHERE id = 'platform'`)
  runD1(`DELETE FROM media_placements WHERE owner_type = 'site' AND owner_id = 'platform' AND slot = 'og_default' AND asset_id != ${sqlString(assetId)}`)
  runD1(`INSERT INTO media_placements (id, organization_id, site_id, owner_type, owner_id, slot, asset_id, sort_order, status, created_at, updated_at)
    SELECT ${sqlString(placementId)}, organization_id, 'platform', 'site', 'platform', 'og_default', ${sqlString(assetId)}, 0, 'active', ${sqlString(now)}, ${sqlString(now)}
    FROM sites WHERE id = 'platform'`)
  console.log('Done. Platform default social image seeded.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
