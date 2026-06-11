#!/usr/bin/env node
/**
 * Migrate curated tenant media away from `external_url` into Cloudflare-hosted storage.
 *
 * Rules:
 * - Images -> Cloudflare Images
 * - Videos/files -> Cloudflare R2
 *
 * Sources can be:
 * - local Worker-served files under /public
 * - remote absolute URLs (for example Unsplash)
 *
 * Dry-run by default.
 *
 * Examples:
 *   node scripts/migrate-curated-media.mjs
 *   node scripts/migrate-curated-media.mjs --staging
 *   node scripts/migrate-curated-media.mjs --staging --apply
 *   node scripts/migrate-curated-media.mjs --remote --site-id site-demo --apply
 *   node scripts/migrate-curated-media.mjs --site-id site-pottery-house --asset-id media-ph-beach
 */

import { parseArgs } from 'node:util'
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const CLOUDFLARE_IMAGES_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
])

const DEFAULT_SITE_IDS = ['site-demo', 'site-pottery-house']
const R2_BUCKET = 'krabiclaw-media'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const text = requireText(path)
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1)
    if (!key || process.env[key] !== undefined) continue
    process.env[key] = value
  }
}

function requireText(path) {
  const result = spawnSync('cat', [path], { encoding: 'utf8', cwd: process.cwd() })
  if (result.status !== 0) throw new Error(`Failed to read ${path}`)
  return result.stdout
}

loadEnvFile(join(process.cwd(), '.env'))
loadEnvFile(join(process.cwd(), '.dev.vars'))

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    local: { type: 'boolean', default: false },
    staging: { type: 'boolean', default: false },
    remote: { type: 'boolean', default: false },
    report: { type: 'string' },
    'site-id': { type: 'string' },
    'asset-id': { type: 'string' },
  },
  allowPositionals: false,
})

const selectedEnvFlags = [values.local, values.staging, values.remote].filter(Boolean).length
if (selectedEnvFlags > 1) {
  console.error('Error: choose only one of --local, --staging, or --remote')
  process.exit(1)
}

const TARGET =
  values.staging ? 'staging' :
  values.remote ? 'remote' :
  'local'

const APPLY = values.apply
const REPORT_PATH = values.report ? String(values.report).trim() : ''
const SITE_IDS = (values['site-id'] ? values['site-id'].split(',') : DEFAULT_SITE_IDS)
  .map(value => value.trim())
  .filter(Boolean)
const ASSET_IDS = (values['asset-id'] ? values['asset-id'].split(',') : [])
  .map(value => value.trim())
  .filter(Boolean)

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || ''
const IMAGES_TOKEN = process.env.CLOUDFLARE_IMAGES_API_TOKEN || ''
const IMAGES_BASE = process.env.CLOUDFLARE_IMAGES_VARIANT_BASE || ''
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || 'https://media.krabiclaw.com').replace(/\/+$/, '')

function wranglerEnvArgs() {
  if (TARGET === 'staging') return ['--env', 'staging', '--remote']
  if (TARGET === 'remote') return ['--remote']
  return ['--local']
}

function d1Json(sql) {
  const result = spawnSync('yarn', [
    '-s',
    'wrangler',
    'd1',
    'execute',
    'DB',
    ...wranglerEnvArgs(),
    '--command',
    sql,
    '--json',
  ], { encoding: 'utf8', cwd: process.cwd() })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'D1 query failed')
  }

  const parsed = JSON.parse(result.stdout)
  return parsed?.[0]?.results ?? []
}

function d1Exec(sql) {
  const result = spawnSync('yarn', [
    '-s',
    'wrangler',
    'd1',
    'execute',
    'DB',
    ...wranglerEnvArgs(),
    '--command',
    sql,
  ], { encoding: 'utf8', cwd: process.cwd() })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'D1 execute failed')
  }
}

function r2Put(localPath, r2Key, contentType) {
  const result = spawnSync('yarn', [
    '-s',
    'wrangler',
    'r2',
    'object',
    'put',
    `${R2_BUCKET}/${r2Key}`,
    '--file',
    localPath,
    '--content-type',
    contentType,
    ...wranglerEnvArgs(),
  ], { encoding: 'utf8', cwd: process.cwd() })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `R2 upload failed for ${r2Key}`)
  }
}

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

function buildR2Key(siteId, assetId, fileName) {
  const clean = String(fileName || 'upload')
    .replace(/[\\/]+/g, '-')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '') || 'upload'
  const ext = extname(clean)
  return `sites/${siteId}/media/${assetId}${ext}`
}

function normalizeMimeType(input, fallbackName = '') {
  const value = String(input || '').split(';', 1)[0].trim().toLowerCase()
  if (value === 'image/jpg') return 'image/jpeg'
  if (value) return value

  const ext = extname(fallbackName).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

function normalizeFileName(asset) {
  const current = String(asset.file_name || '').trim()
  if (current) return current
  const fromUrl = String(asset.public_url || '').split('?')[0].split('#')[0]
  const candidate = basename(fromUrl)
  return candidate || `${asset.id}${extname(fromUrl)}`
}

async function resolveSource(asset) {
  const publicUrl = String(asset.public_url || '')
  const fileName = normalizeFileName(asset)

  if (publicUrl.startsWith('/')) {
    const localPath = join(process.cwd(), 'public', publicUrl.replace(/^\//, ''))
    await access(localPath)
    const bytes = await readFile(localPath)
    const fileStat = await stat(localPath)
    return {
      bytes,
      fileName,
      fileSize: fileStat.size,
      mimeType: normalizeMimeType(asset.mime_type, fileName),
      sourceLabel: localPath,
    }
  }

  if (publicUrl.startsWith('http://') || publicUrl.startsWith('https://')) {
    const response = await fetch(publicUrl, {
      headers: {
        // Helps with some image CDNs and avoids HTML pages for browser-oriented origins.
        'user-agent': 'krabiclaw-media-migrator/1.0',
      },
    })
    if (!response.ok) {
      throw new Error(`fetch failed with HTTP ${response.status} for ${publicUrl}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return {
      bytes: Buffer.from(arrayBuffer),
      fileName,
      fileSize: Number(response.headers.get('content-length')) || arrayBuffer.byteLength,
      mimeType: normalizeMimeType(response.headers.get('content-type'), fileName),
      sourceLabel: publicUrl,
    }
  }

  throw new Error(`unsupported source URL: ${publicUrl}`)
}

async function uploadImage(bytes, fileName, mimeType) {
  if (!ACCOUNT_ID || !IMAGES_TOKEN || !IMAGES_BASE) {
    throw new Error('Cloudflare Images credentials are not configured in env')
  }
  if (!CLOUDFLARE_IMAGES_TYPES.has(mimeType)) {
    throw new Error(`unsupported Cloudflare Images mime type: ${mimeType}`)
  }

  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType }), fileName)

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/images/v1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${IMAGES_TOKEN}`,
    },
    body: form,
  })

  if (!response.ok) {
    throw new Error(`Cloudflare Images upload failed (${response.status}): ${await response.text()}`)
  }

  const data = await response.json()
  const imageId = data?.result?.id
  if (!imageId) {
    throw new Error(`Cloudflare Images upload returned no image id: ${JSON.stringify(data)}`)
  }

  return {
    provider: 'cloudflare_images',
    cloudflareImageId: imageId,
    r2Key: null,
    publicUrl: `${IMAGES_BASE}/${imageId}/public`,
    thumbnailUrl: `${IMAGES_BASE}/${imageId}/thumbnail`,
  }
}

async function uploadR2(asset, bytes, fileName, mimeType) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'kc-curated-media-'))
  const localPath = join(tmpDir, fileName)

  try {
    await writeFile(localPath, bytes)
    const r2Key = buildR2Key(asset.site_id, asset.id, fileName)
    r2Put(localPath, r2Key, mimeType)
    return {
      provider: 'cloudflare_r2',
      cloudflareImageId: null,
      r2Key,
      publicUrl: `${MEDIA_BASE_URL}/${r2Key}`,
      thumbnailUrl: null,
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

function buildUpdateSql(asset, upload, source) {
  const sourceMode = upload.provider === 'cloudflare_images' ? 'uploaded' : 'uploaded'
  return `
    UPDATE media_assets
    SET
      provider = ${sqlQuote(upload.provider)},
      source = ${sqlQuote(sourceMode)},
      cloudflare_image_id = ${sqlQuote(upload.cloudflareImageId)},
      r2_key = ${sqlQuote(upload.r2Key)},
      public_url = ${sqlQuote(upload.publicUrl)},
      thumbnail_url = ${sqlQuote(upload.thumbnailUrl)},
      mime_type = ${sqlQuote(source.mimeType)},
      file_name = ${sqlQuote(source.fileName)},
      file_size = ${source.fileSize || 'NULL'},
      updated_at = ${sqlQuote(new Date().toISOString())}
    WHERE id = ${sqlQuote(asset.id)} AND site_id = ${sqlQuote(asset.site_id)};
  `.trim()
}

async function migrateAsset(asset) {
  const source = await resolveSource(asset)
  const target = source.mimeType.startsWith('image/') && CLOUDFLARE_IMAGES_TYPES.has(source.mimeType)
    ? 'cloudflare_images'
    : 'cloudflare_r2'

  const preview = {
    id: asset.id,
    siteId: asset.site_id,
    kind: asset.kind,
    from: asset.public_url,
    target,
    mimeType: source.mimeType,
    fileName: source.fileName,
    fileSize: source.fileSize,
  }

  if (!APPLY) return { preview, applied: false }

  const upload = target === 'cloudflare_images'
    ? await uploadImage(source.bytes, source.fileName, source.mimeType)
    : await uploadR2(asset, source.bytes, source.fileName, source.mimeType)

  const sql = buildUpdateSql(asset, upload, source)
  d1Exec(sql)

  return {
    preview: {
      ...preview,
      provider: upload.provider,
      publicUrl: upload.publicUrl,
      thumbnailUrl: upload.thumbnailUrl,
    },
    applied: true,
  }
}

function buildAssetQuery() {
  const siteFilter = SITE_IDS.length
    ? `site_id IN (${SITE_IDS.map(sqlQuote).join(', ')})`
    : '1 = 1'
  const assetFilter = ASSET_IDS.length
    ? `AND id IN (${ASSET_IDS.map(sqlQuote).join(', ')})`
    : ''

  return `
    SELECT
      id,
      organization_id,
      site_id,
      location_id,
      provider,
      kind,
      source,
      public_url,
      thumbnail_url,
      mime_type,
      file_name,
      file_size,
      status
    FROM media_assets
    WHERE ${siteFilter}
      AND provider = 'external_url'
      AND status = 'active'
      ${assetFilter}
    ORDER BY site_id, id;
  `.trim()
}

function printHeader() {
  console.log('')
  console.log('Curated media migration')
  console.log(`target: ${TARGET}`)
  console.log(`mode:   ${APPLY ? 'apply' : 'dry-run'}`)
  console.log(`sites:  ${SITE_IDS.join(', ')}`)
  if (ASSET_IDS.length) console.log(`assets: ${ASSET_IDS.join(', ')}`)
  console.log('')
}

async function main() {
  printHeader()
  const assets = d1Json(buildAssetQuery())
  if (!assets.length) {
    console.log('No matching external_url assets found.')
    return
  }

  const summary = {
    total: assets.length,
    cloudflare_images: 0,
    cloudflare_r2: 0,
    failures: 0,
  }
  const report = []

  for (const asset of assets) {
    try {
      const result = await migrateAsset(asset)
      const provider = result.preview.target || result.preview.provider
      summary[provider] += 1
      report.push({
        id: asset.id,
        siteId: asset.site_id,
        kind: asset.kind,
        applied: result.applied,
        sourceUrl: asset.public_url,
        targetProvider: provider,
        mimeType: result.preview.mimeType,
        fileName: result.preview.fileName,
        fileSize: result.preview.fileSize,
        publicUrl: result.preview.publicUrl ?? null,
        thumbnailUrl: result.preview.thumbnailUrl ?? null,
      })
      console.log(`[${result.applied ? 'migrated' : 'plan'}] ${asset.site_id} ${asset.id}`)
      console.log(`  kind: ${asset.kind}`)
      console.log(`  from: ${asset.public_url}`)
      console.log(`  to:   ${provider}`)
      if (result.applied && result.preview.publicUrl) {
        console.log(`  url:  ${result.preview.publicUrl}`)
      }
    } catch (error) {
      summary.failures += 1
      const message = error instanceof Error ? error.message : String(error)
      console.log(`[failed] ${asset.site_id} ${asset.id}`)
      console.log(`  from: ${asset.public_url}`)
      console.log(`  error: ${message}`)
    }
  }

  console.log('')
  console.log('Summary')
  console.log(`  total: ${summary.total}`)
  console.log(`  images -> Cloudflare Images: ${summary.cloudflare_images}`)
  console.log(`  files/videos -> R2: ${summary.cloudflare_r2}`)
  console.log(`  failures: ${summary.failures}`)
  console.log('')
  if (REPORT_PATH) {
    await writeFile(REPORT_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      target: TARGET,
      apply: APPLY,
      sites: SITE_IDS,
      assets: report,
      summary,
    }, null, 2) + '\n')
    console.log(`Report written to ${REPORT_PATH}`)
    console.log('')
  }
  if (!APPLY) {
    console.log('Dry run only. Re-run with --apply to upload assets and update D1.')
  }
}

await main()
