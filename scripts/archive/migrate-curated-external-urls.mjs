#!/usr/bin/env node
/**
 * Migrate curated non-media_assets external URLs to Cloudflare Images.
 *
 * Covers:
 * - site_content.media fields that still store absolute third-party image URLs
 * - review avatar URLs
 *
 * Dry-run by default.
 */

import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { spawnSync } from 'node:child_process'

function requireText(path) {
  const result = spawnSync('cat', [path], { encoding: 'utf8', cwd: process.cwd() })
  if (result.status !== 0) throw new Error(`Failed to read ${path}`)
  return result.stdout
}

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

loadEnvFile(join(process.cwd(), '.env'))
loadEnvFile(join(process.cwd(), '.dev.vars'))

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    local: { type: 'boolean', default: false },
    staging: { type: 'boolean', default: false },
    remote: { type: 'boolean', default: false },
    report: { type: 'string' },
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

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || ''
const IMAGES_TOKEN = process.env.CLOUDFLARE_IMAGES_API_TOKEN || ''
const IMAGES_BASE = process.env.CLOUDFLARE_IMAGES_VARIANT_BASE || ''

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

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
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
  return 'application/octet-stream'
}

function fileNameFromUrl(url, fallbackPrefix) {
  const clean = String(url).split('?')[0].split('#')[0]
  const base = clean.split('/').filter(Boolean).pop() || fallbackPrefix
  return base.includes('.') ? base : `${base}.jpg`
}

async function fetchSource(url, fallbackPrefix) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'krabiclaw-curated-url-migrator/1.0' },
  })
  if (!response.ok) {
    throw new Error(`fetch failed with HTTP ${response.status} for ${url}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const fileName = fileNameFromUrl(url, fallbackPrefix)
  return {
    bytes: Buffer.from(arrayBuffer),
    mimeType: normalizeMimeType(response.headers.get('content-type'), fileName),
    fileName,
  }
}

async function uploadImage(url, fallbackPrefix) {
  if (!ACCOUNT_ID || !IMAGES_TOKEN || !IMAGES_BASE) {
    throw new Error('Cloudflare Images credentials are not configured in env')
  }
  const source = await fetchSource(url, fallbackPrefix)
  const form = new FormData()
  form.append('file', new Blob([source.bytes], { type: source.mimeType }), source.fileName)

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
    imageId,
    publicUrl: `${IMAGES_BASE}/${imageId}/public`,
    thumbnailUrl: `${IMAGES_BASE}/${imageId}/thumbnail`,
  }
}

function storyImageRows() {
  return d1Json(`
    SELECT id, site_id, field, content
    FROM site_content
    WHERE site_id IN ('site-demo', 'site-pottery-house')
      AND field = 'story.image'
      AND content LIKE 'http%'
      AND content NOT LIKE '%imagedelivery.net%';
  `)
}

function reviewRows() {
  return d1Json(`
    SELECT id, site_id, reviewer_photo_url
    FROM reviews
    WHERE site_id IN ('site-demo', 'site-pottery-house')
      AND reviewer_photo_url LIKE 'http%'
      AND reviewer_photo_url NOT LIKE '%imagedelivery.net%';
  `)
}

async function main() {
  console.log('')
  console.log('Curated external URL migration')
  console.log(`target: ${TARGET}`)
  console.log(`mode:   ${APPLY ? 'apply' : 'dry-run'}`)
  console.log('')

  const storyRows = storyImageRows().map((row) => ({
    kind: 'site_content',
    id: row.id,
    siteId: row.site_id,
    url: row.content,
    fallbackPrefix: `${row.id}-story-image`,
  }))
  const reviewRowsList = reviewRows().map((row) => ({
    kind: 'review',
    id: row.id,
    siteId: row.site_id,
    url: row.reviewer_photo_url,
    fallbackPrefix: `${row.id}-reviewer`,
  }))

  const allRows = [...storyRows, ...reviewRowsList]
  const uniqueUrls = [...new Set(allRows.map((row) => row.url))]
  const uploads = new Map()

  const report = {
    generatedAt: new Date().toISOString(),
    target: TARGET,
    apply: APPLY,
    uploads: [],
    updates: [],
  }

  for (const url of uniqueUrls) {
    const firstRow = allRows.find((row) => row.url === url)
    if (!firstRow) continue
    if (!APPLY) {
      uploads.set(url, { publicUrl: '(dry-run)', thumbnailUrl: '(dry-run)' })
      report.uploads.push({ sourceUrl: url, publicUrl: null, thumbnailUrl: null })
      console.log(`[plan] upload ${url}`)
      continue
    }
    const uploaded = await uploadImage(url, firstRow.fallbackPrefix)
    uploads.set(url, uploaded)
    report.uploads.push({ sourceUrl: url, publicUrl: uploaded.publicUrl, thumbnailUrl: uploaded.thumbnailUrl })
    console.log(`[uploaded] ${url}`)
    console.log(`  -> ${uploaded.publicUrl}`)
  }

  for (const row of allRows) {
    const uploaded = uploads.get(row.url)
    if (!uploaded) continue
    report.updates.push({
      kind: row.kind,
      id: row.id,
      siteId: row.siteId,
      sourceUrl: row.url,
      publicUrl: uploaded.publicUrl,
    })
    if (!APPLY) {
      console.log(`[plan] ${row.kind} ${row.id}`)
      console.log(`  ${row.url}`)
      continue
    }
    if (row.kind === 'site_content') {
      d1Exec(`UPDATE site_content SET content = ${sqlQuote(uploaded.publicUrl)} WHERE id = ${sqlQuote(row.id)} AND site_id = ${sqlQuote(row.siteId)};`)
    } else {
      d1Exec(`UPDATE reviews SET reviewer_photo_url = ${sqlQuote(uploaded.publicUrl)} WHERE id = ${sqlQuote(row.id)} AND site_id = ${sqlQuote(row.siteId)};`)
    }
    console.log(`[updated] ${row.kind} ${row.id}`)
    console.log(`  -> ${uploaded.publicUrl}`)
  }

  if (REPORT_PATH) {
    await writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + '\n')
    console.log('')
    console.log(`Report written to ${REPORT_PATH}`)
  }
}

await main()
