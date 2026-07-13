#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { BLAWBY_REFERENCE_COMMIT } from './blawby-parity-config.mjs'
import { replaceMediaUrls } from './utils/media-url-replacements.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultSourceRepo = path.join(repoRoot, '.scratch', 'reference', 'react-next-marketing-site-template')
const defaultImportDir = path.join(repoRoot, 'client-imports', 'north-carolina-legal-services')
const tenantAssetRootParts = ['public', 'tenants', 'northcarolinalegalservices']
const mediaBaseUrl = 'https://media.krabiclaw.com'
const bucketName = 'krabiclaw-media'

function parseArgs(argv) {
  const args = { sourceRepo: defaultSourceRepo, importDir: defaultImportDir, upload: false, confirmProductionUpload: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--source-repo') args.sourceRepo = path.resolve(argv[++index])
    else if (arg === '--client-import-dir') args.importDir = path.resolve(argv[++index])
    else if (arg === '--upload') args.upload = true
    else if (arg === '--confirm-production-upload') args.confirmProductionUpload = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (args.upload && !args.confirmProductionUpload) {
    throw new Error('--upload requires --confirm-production-upload because it writes to the production KrabiClaw media bucket.')
  }
  return args
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function walkFiles(root) {
  const result = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...walkFiles(fullPath))
    else if (entry.isFile()) result.push(fullPath)
  }
  return result
}

function buildSourceIndex(assetRoot) {
  const byRelative = new Map()
  const byName = new Map()
  for (const fullPath of walkFiles(assetRoot)) {
    const relative = path.relative(assetRoot, fullPath).split(path.sep).join('/')
    byRelative.set(relative.toLowerCase(), fullPath)
    const name = path.basename(fullPath).toLowerCase()
    const matches = byName.get(name) || []
    matches.push(fullPath)
    byName.set(name, matches)
  }
  return { byRelative, byName }
}

function resolveSourceFile(asset, index, assetRoot) {
  const rawPath = String(asset.source_path || '').replace(/^\/+/, '').replaceAll('\\', '/')
  if (rawPath) {
    const direct = index.byRelative.get(rawPath.toLowerCase())
    if (direct) return direct
  }
  const sourceName = path.basename(String(asset.source_name || rawPath || asset.file_name || '')).toLowerCase()
  const matches = index.byName.get(sourceName) || []
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    const expectedFolder = asset.mime_type === 'application/pdf' ? 'files' : asset.mime_type === 'image/svg+xml' ? 'icons' : 'images'
    const narrowed = matches.filter(filePath => path.relative(assetRoot, filePath).split(path.sep)[0]?.toLowerCase() === expectedFolder)
    if (narrowed.length === 1) return narrowed[0]
    throw new Error(`Ambiguous source asset ${sourceName}: ${matches.map(filePath => path.relative(assetRoot, filePath)).join(', ')}`)
  }
  throw new Error(`Source asset not found: ${asset.source_path || asset.source_name || asset.file_name || asset.asset_id}`)
}

async function inspectAsset(asset, sourceFile, assetRoot) {
  const bytes = fs.readFileSync(sourceFile)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const extension = path.extname(sourceFile).toLowerCase().replace(/[^.a-z0-9]/g, '')
  const r2Key = `sites/site-ncls-blawby/media/imports/${hash.slice(0, 20)}${extension}`
  let width = null
  let height = null
  let hasAlpha = null
  if (String(asset.mime_type || '').startsWith('image/')) {
    try {
      const metadata = await sharp(bytes).metadata()
      width = metadata.width ?? null
      height = metadata.height ?? null
      hasAlpha = metadata.hasAlpha ?? null
    } catch (error) {
      if (asset.mime_type !== 'image/svg+xml') throw error
    }
  }
  return {
    ...asset,
    storage_provider: 'cloudflare_r2',
    r2_key: r2Key,
    public_url: `${mediaBaseUrl}/${r2Key}`,
    file_name: path.basename(sourceFile),
    source_file: path.relative(assetRoot, sourceFile).split(path.sep).join('/'),
    size_bytes: bytes.byteLength,
    sha256: hash,
    width,
    height,
    has_alpha: hasAlpha,
    upload_status: 'ready',
  }
}

async function publicObjectExists(url) {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(10_000) })
    return response.ok
  } catch {
    return false
  }
}

async function uploadObject(asset, sourceFile) {
  const wranglerEntry = path.join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  let failure = ''
  for (const delay of [0, 1000, 3000, 8000]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    const result = spawnSync(process.execPath, [
      wranglerEntry, 'r2', 'object', 'put', `${bucketName}/${asset.r2_key}`,
      '--file', sourceFile,
      '--content-type', asset.mime_type || 'application/octet-stream',
      '--remote',
    ], { cwd: repoRoot, encoding: 'utf8' })
    if (result.status === 0) return
    failure = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`
  }
  throw new Error(`R2 upload failed for ${asset.source_file} after retries: ${failure}`)
}

async function verifyPublicObject(asset) {
  for (const delay of [0, 500, 1500, 3000]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    if (await publicObjectExists(asset.public_url)) return
  }
  throw new Error(`Uploaded object is not publicly fetchable: ${asset.public_url}`)
}

function regenerateSeed(importDir) {
  const result = spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts', 'generate-ncls-blawby-seed.mjs'),
    '--stdout', '--manifest', path.join(importDir, 'client-manifest.json'),
  ], { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Seed preview generation failed')
  fs.writeFileSync(path.join(importDir, 'seed-preview.sql'), result.stdout, 'utf8')
}

const args = parseArgs(process.argv.slice(2))
const revision = execFileSync('git', ['-C', args.sourceRepo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (revision !== BLAWBY_REFERENCE_COMMIT) {
  throw new Error(`Source checkout moved: expected ${BLAWBY_REFERENCE_COMMIT}, found ${revision}`)
}

const manifestPath = path.join(args.importDir, 'client-manifest.json')
const manifest = readJson(manifestPath)
if (manifest.source_commit !== BLAWBY_REFERENCE_COMMIT) {
  throw new Error(`Import manifest is not tied to pinned source commit ${BLAWBY_REFERENCE_COMMIT}`)
}

const assetRoot = path.join(args.sourceRepo, ...tenantAssetRootParts)
const sourceIndex = buildSourceIndex(assetRoot)
const prepared = []
for (const asset of manifest.mediaInventory?.files || []) {
  const sourceFile = resolveSourceFile(asset, sourceIndex, assetRoot)
  prepared.push(await inspectAsset(asset, sourceFile, assetRoot))
}

const preflight = {
  source_commit: revision,
  generated_at: new Date().toISOString(),
  mode: args.upload ? 'upload' : 'dry-run',
  count: prepared.length,
  total_bytes: prepared.reduce((sum, asset) => sum + asset.size_bytes, 0),
  assets: prepared,
}
writeJson(path.join(args.importDir, 'media-preflight.json'), preflight)

if (!args.upload) {
  console.log(`Media preflight passed for ${prepared.length} assets at pinned source ${revision}.`)
  console.log(`Review ${path.join(args.importDir, 'media-preflight.json')} before authorizing upload.`)
  process.exit(0)
}

for (const asset of prepared) {
  const sourceFile = path.join(assetRoot, ...asset.source_file.split('/'))
  if (!(await publicObjectExists(asset.public_url))) await uploadObject(asset, sourceFile)
  await verifyPublicObject(asset)
  asset.upload_status = 'verified'
  asset.upload_verified_at = new Date().toISOString()
}

const replacements = new Map()
for (let index = 0; index < prepared.length; index += 1) {
  const previous = manifest.mediaInventory.files[index]
  if (previous.public_url) replacements.set(previous.public_url, prepared[index].public_url)
}
const updated = replaceMediaUrls(manifest, replacements)
updated.mediaInventory = {
  ...updated.mediaInventory,
  source_commit: revision,
  files: prepared,
}
updated.source_commit = revision
writeJson(manifestPath, updated)
writeJson(path.join(args.importDir, 'blawby-import.json'), updated)
writeJson(path.join(args.importDir, 'media-manifest.json'), updated.mediaInventory)
writeJson(path.join(args.importDir, 'approved.json'), {
  approved: false,
  invalidated: true,
  invalidated_reason: 'Media was uploaded and canonical artifacts changed; fresh human review is required.',
  source_commit: revision,
  slug: 'north-carolina-legal-services',
  vertical: 'service',
  adapter: 'ncls-blawby',
})
regenerateSeed(args.importDir)
console.log(`Uploaded and verified ${prepared.length} assets. Canonical artifacts now require explicit human approval.`)
