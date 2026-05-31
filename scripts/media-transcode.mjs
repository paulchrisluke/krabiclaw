#!/usr/bin/env node
/**
 * Transcode video files for the KrabiClaw media pipeline.
 *
 * Requires ffmpeg in PATH.
 *
 * Mode 1 — transcode a directory of new client videos, upload to R2, seed D1:
 *   node scripts/media-transcode.mjs --slug <slug> --dir <path> [--remote]
 *
 * Mode 2 — re-transcode an existing R2 asset in-place:
 *   node scripts/media-transcode.mjs --slug <slug> --asset-id <id> [--remote]
 *
 * Options:
 *   --max-duration <s>   Trim if video is longer than N seconds (default: 15)
 *   --crf <n>            H.264 CRF, 0–51, lower = better quality (default: 26)
 *   --remote             Use remote D1/R2 (default: local)
 */

import { parseArgs } from 'node:util'
import { readdir, stat, mkdir, unlink } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { existsSync } from 'node:fs'
import { spawnSync, execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

// ── Args ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    slug: { type: 'string' },
    dir: { type: 'string' },
    'asset-id': { type: 'string' },
    remote: { type: 'boolean', default: false },
    'max-duration': { type: 'string', default: '15' },
    crf: { type: 'string', default: '30' },
    'max-height': { type: 'string', default: '720' },
    'max-bitrate': { type: 'string', default: '500' },
    'thumbnail-at': { type: 'string', default: '0.1' },
    'thumbnail-only': { type: 'boolean', default: false },
  },
  allowPositionals: true,
})

const SLUG = args.slug
const DIR = args.dir
const ASSET_ID = args['asset-id']
const REMOTE = args.remote
const MAX_DURATION = parseInt(args['max-duration'], 10)
const CRF = parseInt(args.crf, 10)
const MAX_HEIGHT = parseInt(args['max-height'], 10)
const MAX_BITRATE = parseInt(args['max-bitrate'], 10)
const THUMBNAIL_AT = parseFloat(args['thumbnail-at'])
const THUMBNAIL_ONLY = args['thumbnail-only']
const D1_FLAG = REMOTE ? '--remote' : '--local'
const R2_BUCKET = 'krabiclaw-media'

if (!SLUG) {
  console.error('Error: --slug is required')
  process.exit(1)
}
if (!DIR && !ASSET_ID) {
  console.error('Error: either --dir or --asset-id is required')
  process.exit(1)
}
if (DIR && ASSET_ID) {
  console.error('Error: --dir and --asset-id are mutually exclusive')
  process.exit(1)
}

const SLUG_SAFE = /^[a-zA-Z0-9_-]+$/
if (!SLUG_SAFE.test(SLUG)) {
  console.error('Error: --slug contains invalid characters')
  process.exit(1)
}

// ── ffmpeg / ffprobe check ────────────────────────────────────────────────────

function requireBin(name) {
  const result = spawnSync('which', [name], { encoding: 'utf8' })
  if (result.status !== 0) {
    console.error(`Error: ${name} not found in PATH. Install with: brew install ffmpeg`)
    process.exit(1)
  }
}
requireBin('ffmpeg')
requireBin('ffprobe')

// ── Helpers ───────────────────────────────────────────────────────────────────

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'])

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function probeDuration(filePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'stream=duration',
      '-select_streams', 'v:0',
      '-of', 'csv=p=0',
      filePath,
    ], { encoding: 'utf8' })
    const dur = parseFloat(out.trim())
    return Number.isFinite(dur) ? dur : null
  } catch {
    return null
  }
}

function probeResolution(filePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'stream=width,height',
      '-select_streams', 'v:0',
      '-of', 'csv=p=0',
      filePath,
    ], { encoding: 'utf8' })
    const [w, h] = out.trim().split(',').map(Number)
    return { width: w || null, height: h || null }
  } catch {
    return { width: null, height: null }
  }
}

function transcode(inputPath, outputPath, duration) {
  const ffmpegArgs = ['-y', '-i', inputPath]
  if (duration && duration > MAX_DURATION) {
    ffmpegArgs.push('-t', String(MAX_DURATION))
  }
  // Scale so the shorter dimension is ≤ MAX_HEIGHT; never upscale
  const scaleFilter = `scale='if(gt(ih,iw),min(iw\\,${MAX_HEIGHT}),trunc(iw/2)*2)':'if(gt(ih,iw),trunc(ih/2)*2,min(ih\\,${MAX_HEIGHT}))':flags=lanczos`
  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-crf', String(CRF),
    '-preset', 'slow',
    '-maxrate', `${MAX_BITRATE}k`,
    '-bufsize', `${MAX_BITRATE * 2}k`,
    '-an',
    '-vf', scaleFilter,
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    outputPath,
  )
  const result = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${inputPath}`)
  }
}

function extractThumbnail(inputPath, outputPath, seekSeconds = 0.1) {
  // 640×360 WebP poster — sized for largest mobile viewport at 2x DPR, ~40KB
  const result = spawnSync('ffmpeg', [
    '-y',
    '-ss', String(seekSeconds),
    '-i', inputPath,
    '-vframes', '1',
    '-update', '1',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720',
    '-c:v', 'libwebp',
    '-quality', '72',
    outputPath,
  ], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`ffmpeg thumbnail extraction failed for ${inputPath}`)
  }
}

function r2Put(localPath, r2Key, contentType = 'video/mp4') {
  const result = spawnSync('yarn', [
    'wrangler', 'r2', 'object', 'put',
    `${R2_BUCKET}/${r2Key}`,
    '--file', localPath,
    '--content-type', contentType,
    REMOTE ? '--remote' : '--local',
  ], { stdio: 'inherit', cwd: process.cwd() })
  if (result.status !== 0) throw new Error(`R2 upload failed for ${r2Key}`)
}

function r2Get(r2Key, localPath) {
  const result = spawnSync('yarn', [
    'wrangler', 'r2', 'object', 'get',
    `${R2_BUCKET}/${r2Key}`,
    '--file', localPath,
    REMOTE ? '--remote' : '--local',
  ], { stdio: 'inherit', cwd: process.cwd() })
  if (result.status !== 0) throw new Error(`R2 download failed for ${r2Key}`)
}

function d1Query(sql) {
  const result = spawnSync('yarn', [
    'wrangler', 'd1', 'execute', 'DB',
    D1_FLAG, '--command', sql, '--json',
  ], { encoding: 'utf8', cwd: process.cwd() })
  const raw = (result.stdout ?? '') + (result.stderr ?? '')
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return null
  try {
    const arr = JSON.parse(match[0])
    return arr[0]?.results ?? null
  } catch {
    return null
  }
}

function d1Execute(sql) {
  const result = spawnSync('yarn', [
    'wrangler', 'd1', 'execute', 'DB',
    D1_FLAG, '--command', sql,
  ], { stdio: 'inherit', cwd: process.cwd() })
  if (result.status !== 0) throw new Error('D1 execute failed')
}

function lookupSite(slug) {
  const rows = d1Query(`SELECT id, organization_id FROM sites WHERE slug = '${slug}' LIMIT 1`)
  if (!rows?.length) {
    console.error(`Error: No site found for slug '${slug}' in ${REMOTE ? 'remote' : 'local'} D1`)
    process.exit(1)
  }
  return { siteId: rows[0].id, orgId: rows[0].organization_id }
}

// ── Mode 1: transcode a directory ─────────────────────────────────────────────

async function transcodeDir() {
  if (!existsSync(DIR)) {
    console.error(`Error: directory not found: ${DIR}`)
    process.exit(1)
  }
  const dirStat = await stat(DIR)
  if (!dirStat.isDirectory()) {
    console.error(`Error: not a directory: ${DIR}`)
    process.exit(1)
  }

  const entries = await readdir(DIR)
  const videoFiles = entries.filter(e => VIDEO_EXTS.has(extname(e).toLowerCase()))
  if (!videoFiles.length) {
    console.error(`Error: no video files found in ${DIR} (supported: ${[...VIDEO_EXTS].join(', ')})`)
    process.exit(1)
  }

  console.log(`\n→ Looking up site for slug '${SLUG}'...`)
  const { siteId, orgId } = lookupSite(SLUG)
  console.log(`  site_id: ${siteId}  org_id: ${orgId}`)

  const tmpDir = join(tmpdir(), `kc-transcode-${SLUG}-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })

  console.log(`\n→ Transcoding ${videoFiles.length} video(s)...`)

  const results = []

  for (const filename of videoFiles) {
    const inputPath = join(DIR, filename)
    const assetId = `vasset-${uid()}`
    const outputPath = join(tmpDir, `${assetId}.mp4`)
    const r2Key = `sites/${siteId}/media/${assetId}.mp4`
    const publicUrl = `https://media.krabiclaw.com/${r2Key}`

    const duration = probeDuration(inputPath)
    const { width, height } = probeResolution(inputPath)
    const inputSize = (await stat(inputPath)).size

    const trimNote = duration && duration > MAX_DURATION
      ? ` (trimming ${Math.round(duration)}s → ${MAX_DURATION}s)`
      : ''
    console.log(`\n  ${filename}${trimNote}`)
    console.log(`    ${width}x${height}, ${(inputSize / 1024 / 1024).toFixed(1)} MB`)

    transcode(inputPath, outputPath, duration)

    const outputSize = (await stat(outputPath)).size
    console.log(`    → ${(outputSize / 1024 / 1024).toFixed(1)} MB (${Math.round((1 - outputSize / inputSize) * 100)}% smaller)`)

    console.log(`  ↑ Uploading to R2...`)
    r2Put(outputPath, r2Key)

    const thumbPath = join(tmpDir, `${assetId}-thumb.jpg`)
    const thumbR2Key = `sites/${siteId}/media/${assetId}-thumb.jpg`
    const thumbPublicUrl = `https://media.krabiclaw.com/${thumbR2Key}`
    console.log(`  ✂  Extracting thumbnail at ${THUMBNAIL_AT}s...`)
    extractThumbnail(outputPath, thumbPath, THUMBNAIL_AT)
    r2Put(thumbPath, thumbR2Key, 'image/jpeg')
    await unlink(thumbPath)

    const escapedFilename = filename.replace(/'/g, "''")
    const finalDuration = Math.min(duration ?? MAX_DURATION, MAX_DURATION)
    d1Execute(
      `INSERT INTO media_assets (id, organization_id, site_id, kind, provider, source, r2_key, public_url, thumbnail_url, mime_type, file_name, file_size, width, height, duration, alt_text, status)
       VALUES ('${assetId}', '${orgId}', '${siteId}', 'video', 'cloudflare_r2', 'uploaded',
               '${r2Key}', '${publicUrl}', '${thumbPublicUrl}', 'video/mp4', '${escapedFilename}',
               ${outputSize}, ${width ?? 'NULL'}, ${height ?? 'NULL'}, ${Math.round(finalDuration)},
               '${SLUG.replace(/-/g, ' ')} video', 'active')
       ON CONFLICT(id) DO NOTHING;`
    )

    results.push({ assetId, publicUrl, thumbPublicUrl, filename, outputSize })
    await unlink(outputPath)
  }

  console.log(`\n✓ Done — ${results.length} video(s) uploaded`)
  console.log('\n  Asset IDs (reference in CMS or seed SQL):')
  for (const r of results) {
    console.log(`    ${r.assetId}  →  ${r.publicUrl}`)
    console.log(`    ${r.assetId}-thumb  →  ${r.thumbPublicUrl}`)
  }

  console.log('\n  Wire up hero_video_asset_id on site_content or business_locations as needed.')
}

// ── Mode 2: re-transcode an existing R2 asset ─────────────────────────────────

async function transcodeAsset() {
  // Validate asset-id safe for SQL
  if (!SLUG_SAFE.test(ASSET_ID.replace(/-/g, '').replace(/\./g, ''))) {
    console.error('Error: --asset-id contains invalid characters')
    process.exit(1)
  }

  console.log(`\n→ Looking up asset '${ASSET_ID}'...`)
  const rows = d1Query(
    `SELECT id, r2_key, public_url, file_name, file_size FROM media_assets WHERE id = '${ASSET_ID}' LIMIT 1`
  )
  if (!rows?.length) {
    console.error(`Error: asset '${ASSET_ID}' not found in ${REMOTE ? 'remote' : 'local'} D1`)
    process.exit(1)
  }
  const asset = rows[0]
  if (!asset.r2_key) {
    console.error(`Error: asset '${ASSET_ID}' has no r2_key — only cloudflare_r2 assets can be re-transcoded this way`)
    process.exit(1)
  }

  const tmpDir = join(tmpdir(), `kc-transcode-${SLUG}-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
  const downloadPath = join(tmpDir, 'source.mp4')
  const outputPath = join(tmpDir, 'output.mp4')

  console.log(`  r2_key: ${asset.r2_key}`)
  console.log(`  file_name: ${asset.file_name ?? 'unknown'}`)
  if (asset.file_size) {
    console.log(`  current size: ${(asset.file_size / 1024 / 1024).toFixed(1)} MB`)
  }

  console.log(`\n→ Downloading from R2...`)
  r2Get(asset.r2_key, downloadPath)

  const duration = probeDuration(downloadPath)
  const { width, height } = probeResolution(downloadPath)
  const inputSize = (await stat(downloadPath)).size

  const trimNote = duration && duration > MAX_DURATION
    ? ` (trimming ${Math.round(duration)}s → ${MAX_DURATION}s)`
    : duration ? ` (${Math.round(duration)}s)` : ''
  console.log(`\n→ Transcoding${trimNote}...`)
  console.log(`  ${width ?? '?'}x${height ?? '?'}, ${(inputSize / 1024 / 1024).toFixed(1)} MB`)

  transcode(downloadPath, outputPath, duration)

  const outputSize = (await stat(outputPath)).size
  console.log(`  → ${(outputSize / 1024 / 1024).toFixed(1)} MB (${Math.round((1 - outputSize / inputSize) * 100)}% smaller)`)

  console.log(`\n→ Re-uploading to R2 (same key)...`)
  r2Put(outputPath, asset.r2_key)

  const thumbR2Key = asset.r2_key.replace(/\.mp4$/, '-thumb.jpg')
  const thumbPublicUrl = `https://media.krabiclaw.com/${thumbR2Key}`
  const thumbPath = join(tmpDir, 'thumb.jpg')
  console.log(`\n→ Extracting thumbnail at ${THUMBNAIL_AT}s...`)
  extractThumbnail(outputPath, thumbPath, THUMBNAIL_AT)
  r2Put(thumbPath, thumbR2Key, 'image/jpeg')
  await unlink(thumbPath)

  console.log(`\n→ Updating file_size + thumbnail_url in D1...`)
  d1Execute(`UPDATE media_assets SET file_size = ${outputSize}, thumbnail_url = '${thumbPublicUrl}' WHERE id = '${ASSET_ID}'`)

  await unlink(downloadPath)
  await unlink(outputPath)

  console.log(`\n✓ Done — ${asset.id} re-transcoded and re-uploaded`)
  console.log(`  URL unchanged: ${asset.public_url}`)
  console.log(`  ${asset.file_size ? `${(asset.file_size / 1024 / 1024).toFixed(1)} MB → ` : ''}${(outputSize / 1024 / 1024).toFixed(1)} MB`)
}

// ── Mode 3: thumbnail-only for a single asset ─────────────────────────────────

async function thumbnailOnlyAsset() {
  console.log(`\n→ Looking up asset '${ASSET_ID}'...`)
  const rows = d1Query(
    `SELECT id, site_id, provider, r2_key, public_url FROM media_assets WHERE id = '${ASSET_ID}' LIMIT 1`
  )
  if (!rows?.length) {
    console.error(`Error: asset '${ASSET_ID}' not found`)
    process.exit(1)
  }
  const asset = rows[0]

  const tmpDir = join(tmpdir(), `kc-thumb-${SLUG}-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })
  const thumbPath = join(tmpDir, 'thumb.jpg')

  let sourcePath
  let cleanup = false

  if (asset.provider === 'cloudflare_r2') {
    if (!asset.r2_key) {
      console.error(`Error: asset has no r2_key`)
      process.exit(1)
    }
    sourcePath = join(tmpDir, 'source.mp4')
    console.log(`→ Downloading from R2...`)
    r2Get(asset.r2_key, sourcePath)
    cleanup = true
  } else {
    // external_url — resolve relative to public/ directory
    if (asset.public_url.startsWith('http://') || asset.public_url.startsWith('https://') || asset.public_url.includes('://')) {
      console.error(`Error: absolute URL not supported for thumbnail-only mode: ${asset.public_url}`)
      process.exit(1)
    }
    const rel = asset.public_url.replace(/^\//, '')
    sourcePath = join(process.cwd(), 'public', rel)
    if (!existsSync(sourcePath)) {
      console.error(`Error: local file not found: ${sourcePath}`)
      process.exit(1)
    }
    console.log(`→ Using local file: ${sourcePath}`)
  }

  console.log(`→ Extracting thumbnail at ${THUMBNAIL_AT}s...`)
  extractThumbnail(sourcePath, thumbPath, THUMBNAIL_AT)

  let thumbPublicUrl
  if (asset.provider === 'cloudflare_r2') {
    const thumbR2Key = asset.r2_key.replace(/\.mp4$/, '-thumb.jpg')
    thumbPublicUrl = `https://media.krabiclaw.com/${thumbR2Key}`
    r2Put(thumbPath, thumbR2Key, 'image/jpeg')
  } else {
    // Store alongside the source in public/
    const rel = asset.public_url.replace(/^\//, '').replace(/\.mp4$/, '-thumb.jpg')
    const destPath = join(process.cwd(), 'public', rel)
    const { copyFile } = await import('node:fs/promises')
    await copyFile(thumbPath, destPath)
    thumbPublicUrl = `/${rel}`
    console.log(`→ Saved thumbnail to: ${destPath}`)
  }

  d1Execute(`UPDATE media_assets SET thumbnail_url = '${thumbPublicUrl}' WHERE id = '${ASSET_ID}'`)
  if (cleanup) await unlink(sourcePath)
  await unlink(thumbPath)

  console.log(`\n✓ Done — thumbnail_url set on ${ASSET_ID}`)
  console.log(`  ${thumbPublicUrl}`)
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

console.log(`\n┌─ KrabiClaw Media Transcode ────────────────────────────────────`)
console.log(`│  slug:          ${SLUG}`)
console.log(`│  mode:          ${DIR ? `dir (${DIR})` : THUMBNAIL_ONLY ? `thumbnail-only (${ASSET_ID})` : `asset-id (${ASSET_ID})`}`)
console.log(`│  target:        ${REMOTE ? 'remote' : 'local'}`)
console.log(`│  max-duration:  ${MAX_DURATION}s`)
console.log(`│  crf:           ${CRF}`)
console.log(`│  thumbnail-at:  ${THUMBNAIL_AT}s`)
console.log(`└───────────────────────────────────────────────────────────────\n`)

if (DIR && THUMBNAIL_ONLY) {
  console.error(`Error: --dir and --thumbnail-only are mutually exclusive`)
  process.exit(1)
}
if (DIR) {
  await transcodeDir()
} else if (THUMBNAIL_ONLY) {
  await thumbnailOnlyAsset()
} else {
  await transcodeAsset()
}
