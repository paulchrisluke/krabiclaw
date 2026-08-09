import { readdirSync } from 'node:fs'
import { createWorkerVersionOverrideHeaders } from './lib/performance-comparison.mjs'

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

const rawIdentityOrigin = process.env.DEPLOYMENT_IDENTITY_ORIGIN
let identityOrigin
if (rawIdentityOrigin) {
  try {
    const parsedIdentityOrigin = new URL(rawIdentityOrigin)
    if (!/^https?:$/.test(parsedIdentityOrigin.protocol)) throw new Error('unsupported protocol')
    identityOrigin = parsedIdentityOrigin.origin
  } catch {
    console.error(`DEPLOYMENT_IDENTITY_ORIGIN is not a valid HTTP(S) URL: ${rawIdentityOrigin}`)
    process.exit(1)
  }
}

const expectedSourceSha = process.env.GITHUB_SHA?.trim().toLowerCase() || null
const expectedWorkerVersion = process.env.WORKER_VERSION_OVERRIDE?.trim().toLowerCase() || null
if (rawIdentityOrigin && (!expectedSourceSha || !expectedWorkerVersion)) {
  throw new Error('GITHUB_SHA and WORKER_VERSION_OVERRIDE are required when DEPLOYMENT_IDENTITY_ORIGIN is set.')
}
if (expectedSourceSha && !/^[0-9a-f]{40}$/.test(expectedSourceSha)) {
  throw new Error('GITHUB_SHA must be a full 40-character hexadecimal source SHA.')
}

const workerVersionHeaders = createWorkerVersionOverrideHeaders(
  process.env.WORKER_VERSION_OVERRIDE,
  process.env.WORKER_NAME,
)

const REQUEST_TIMEOUT_MS = 15_000
const RETRY_DELAY_MS = 2_000
const MAX_WAIT_MS = 180_000
const NUXT_BUILD_ID_PATTERN = /buildId:\"([0-9a-f-]{36})\"/
const NUXT_ASSET_PATTERN = /(?:src|href)="(\/_nuxt\/[^"?]+(?:\?[^"]*)?)"/g
const expectedSurfaceCss = [
  'platform.css',
  'platform-home.css',
  'saya.css',
  'saya-home.css',
  'blawby.css',
  'blawby-home.css',
]
const localSurfaceCss = new Set(readdirSync('.output/public/_nuxt/surfaces'))
const missingSurfaceCss = expectedSurfaceCss.filter(filename => !localSurfaceCss.has(filename))

if (missingSurfaceCss.length) {
  throw new Error('The local production build is missing stable public surface CSS assets: ' + missingSurfaceCss.join(', '))
}

const expectedSurfacePaths = new Set(expectedSurfaceCss.map(filename => '/_nuxt/surfaces/' + filename))
const identityOrigins = [...new Set([baseUrl.origin, identityOrigin].filter(Boolean))]

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
        ...workerVersionHeaders,
        ...headers,
      },
      redirect: 'follow',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function verifyHtmlAndAssets(url, headers = {}) {
  const response = await fetchWithTimeout(url, headers)
  if (!response.ok) throw new Error(`${url.pathname || '/'} returned HTTP ${response.status}`)

  const html = await response.text()
  const buildId = html.match(NUXT_BUILD_ID_PATTERN)?.[1]
  if (!buildId) {
    throw new Error(`${url.pathname || '/'} did not expose a Nuxt build id`)
  }

  if (buildId) {
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
  }

  const assetPaths = [...html.matchAll(NUXT_ASSET_PATTERN)].map(match => match[1])
  if (!assetPaths.length) throw new Error(`${url.pathname || '/'} did not reference Nuxt assets`)
  const surfacePaths = [...new Set(assetPaths.map(path => path.split('?')[0]).filter(path => expectedSurfacePaths.has(path)))]
  if (!surfacePaths.length) {
    throw new Error(`${url.pathname || '/'} did not reference a stable public surface stylesheet`)
  }

  await Promise.all([...new Set(assetPaths)].map(async (assetPath) => {
    const assetUrl = new URL(assetPath, baseUrl)
    assetUrl.searchParams.set('asset-propagation-check', `${Date.now()}`)
    const assetResponse = await fetchWithTimeout(assetUrl, headers)
    if (!assetResponse.ok) {
      throw new Error(`${assetPath} returned HTTP ${assetResponse.status}`)
    }
  }))
}

async function verifyDeploymentIdentity(origin, attempt) {
  if (!expectedSourceSha || !expectedWorkerVersion) return

  const identityUrl = new URL('/api/deployment', origin)
  identityUrl.searchParams.set('asset-propagation-check', `${Date.now()}-${attempt}`)
  const response = await fetchWithTimeout(identityUrl, {
    'cache-control': 'no-store',
  })
  if (!response.ok) {
    throw new Error(`${origin} /api/deployment returned HTTP ${response.status}`)
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(`${origin} /api/deployment returned malformed JSON`)
  }

  const actualSourceSha = typeof payload?.sourceSha === 'string' ? payload.sourceSha.trim().toLowerCase() : null
  const actualWorkerVersion = typeof payload?.worker?.id === 'string' ? payload.worker.id.trim().toLowerCase() : null
  if (actualSourceSha !== expectedSourceSha || actualWorkerVersion !== expectedWorkerVersion) {
    throw new Error(`${origin} /api/deployment identity mismatch (expected ${expectedSourceSha}/${expectedWorkerVersion}, got ${actualSourceSha ?? '<missing>'}/${actualWorkerVersion ?? '<missing>'})`)
  }
}

let consecutiveReadyChecks = 0
const startedAt = Date.now()
let attempt = 0
let lastError = 'no readiness attempt completed'
while (Date.now() - startedAt < MAX_WAIT_MS) {
  attempt += 1
  try {
    for (const origin of identityOrigins) {
      await verifyDeploymentIdentity(origin, attempt)
    }

    const homepageUrl = new URL(baseUrl)
    homepageUrl.searchParams.set('asset-propagation-check', `${Date.now()}-${attempt}`)

    await verifyHtmlAndAssets(homepageUrl)

    const tenantUrl = new URL(baseUrl)
    tenantUrl.searchParams.set('asset-propagation-check', `${Date.now()}-${attempt}`)
    await verifyHtmlAndAssets(tenantUrl, {
      'x-preview-tenant': 'demo',
      'cache-control': 'no-store',
    })

    const dashboardUrl = new URL('/dashboard', baseUrl)
    dashboardUrl.searchParams.set('asset-propagation-check', `${Date.now()}-${attempt}`)
    await verifyHtmlAndAssets(dashboardUrl)

    consecutiveReadyChecks += 1
    if (consecutiveReadyChecks >= 2) {
      console.log(`Deployed public surface assets are stable (attempt ${attempt}).`)
      process.exit(0)
    }
    console.log(`Deployed assets passed readiness check ${consecutiveReadyChecks}/2.`)
  } catch (error) {
    consecutiveReadyChecks = 0
    const message = error instanceof Error ? error.message : String(error)
    lastError = message
    const elapsedMs = Date.now() - startedAt
    console.log(`Deployed assets are not ready (attempt ${attempt}, ${elapsedMs}ms/${MAX_WAIT_MS}ms elapsed): ${message}`)

    const remainingMs = MAX_WAIT_MS - elapsedMs
    if (remainingMs > 0) {
      await sleep(Math.min(RETRY_DELAY_MS, remainingMs))
    }
  }
}

const elapsedMs = Date.now() - startedAt
throw new Error(`Deployed assets for ${baseUrl.origin} did not become ready after ${elapsedMs}ms (${attempt} attempts). Last error: ${lastError}`)
