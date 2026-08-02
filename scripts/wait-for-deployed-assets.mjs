import { readdirSync } from 'node:fs'

const rawBaseUrl = process.env.PLAYWRIGHT_PREVIEW_URL

if (!rawBaseUrl) {
  console.log('PLAYWRIGHT_PREVIEW_URL is not set; skipping deployed asset propagation check.')
  process.exit(0)
}

let baseUrl
try {
  baseUrl = new URL(rawBaseUrl)
} catch {
  console.error(`PLAYWRIGHT_PREVIEW_URL is not a valid URL: ${rawBaseUrl}`)
  process.exit(1)
}

const localHosts = new Set(['localhost', '127.0.0.1', '::1'])

if (localHosts.has(baseUrl.hostname)) {
  console.log(`Skipping deployed asset propagation check for ${baseUrl.hostname}.`)
  process.exit(0)
}

const REQUEST_TIMEOUT_MS = 15_000
const RETRY_DELAY_MS = 2_000
const MAX_ATTEMPTS = 20
const NUXT_BUILD_ID_PATTERN = /buildId:\"([0-9a-f-]{36})\"/
const ENTRY_CSS_PATTERN = /\/_nuxt\/entry\.[A-Za-z0-9_-]+\.css/
const NUXT_ASSET_PATTERN = /(?:src|href)="(\/_nuxt\/[^"?]+(?:\?[^"]*)?)"/g
const expectedEntryCss = readdirSync('.output/public/_nuxt')
  .find(filename => /^entry\.[A-Za-z0-9_-]+\.css$/.test(filename))

if (!expectedEntryCss) {
  throw new Error('The local production build does not contain an entry CSS asset.')
}

const expectedAssetPath = `/_nuxt/${expectedEntryCss}`

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url, headers = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      headers: {
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        ...headers,
      },
      redirect: 'follow',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function verifyHtmlAndAssets(url, expectedEntryPath, headers = {}) {
  const response = await fetchWithTimeout(url, headers)
  if (!response.ok) throw new Error(`${url.pathname || '/'} returned HTTP ${response.status}`)

  const html = await response.text()
  const buildId = html.match(NUXT_BUILD_ID_PATTERN)?.[1]
  if (!buildId) throw new Error(`${url.pathname || '/'} did not expose a Nuxt build id`)

  const buildMetaUrl = new URL(`/_nuxt/builds/meta/${buildId}.json`, baseUrl)
  const buildMetaResponse = await fetchWithTimeout(buildMetaUrl, headers)
  if (!buildMetaResponse.ok) {
    throw new Error(`${url.pathname || '/'} references missing Nuxt build metadata ${buildId}`)
  }
  try {
    JSON.parse(await buildMetaResponse.text())
  } catch {
    throw new Error(`${url.pathname || '/'} references malformed Nuxt build metadata ${buildId}`)
  }

  const entryPath = html.match(ENTRY_CSS_PATTERN)?.[0]
  if (entryPath !== expectedEntryPath) {
    throw new Error(`${url.pathname || '/'} references ${entryPath ?? 'no entry CSS'}; waiting for ${expectedEntryPath}`)
  }

  const assetPaths = [...html.matchAll(NUXT_ASSET_PATTERN)].map(match => match[1])
  if (!assetPaths.length) throw new Error(`${url.pathname || '/'} did not reference Nuxt assets`)

  await Promise.all([...new Set(assetPaths)].map(async (assetPath) => {
    const assetUrl = new URL(assetPath, baseUrl)
    assetUrl.searchParams.set('asset-propagation-check', `${Date.now()}`)
    const assetResponse = await fetchWithTimeout(assetUrl, headers)
    if (!assetResponse.ok) {
      throw new Error(`${assetPath} returned HTTP ${assetResponse.status}`)
    }
  }))
}

let consecutiveReadyChecks = 0
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    const homepageUrl = new URL(baseUrl)
    homepageUrl.searchParams.set('asset-propagation-check', `${Date.now()}-${attempt}`)

    await verifyHtmlAndAssets(homepageUrl, expectedAssetPath)

    const tenantUrl = new URL(baseUrl)
    tenantUrl.searchParams.set('asset-propagation-check', `${Date.now()}-${attempt}`)
    await verifyHtmlAndAssets(tenantUrl, expectedAssetPath, {
      'x-preview-tenant': 'demo',
      'cache-control': 'no-store',
    })

    const dashboardUrl = new URL('/dashboard', baseUrl)
    dashboardUrl.searchParams.set('asset-propagation-check', `${Date.now()}-${attempt}`)
    await verifyHtmlAndAssets(dashboardUrl, expectedAssetPath)

    consecutiveReadyChecks += 1
    if (consecutiveReadyChecks >= 2) {
      console.log(`Deployed platform and tenant assets are stable: ${expectedAssetPath} (attempt ${attempt}).`)
      process.exit(0)
    }
    console.log(`Deployed assets passed readiness check ${consecutiveReadyChecks}/2.`)
  } catch (error) {
    consecutiveReadyChecks = 0
    const message = error instanceof Error ? error.message : String(error)
    console.log(`Deployed assets are not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${message}`)

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS)
    }
  }
}

throw new Error(`Deployed assets for ${baseUrl.origin} did not become ready after ${MAX_ATTEMPTS} attempts.`)
