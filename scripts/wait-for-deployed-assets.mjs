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
const ENTRY_CSS_PATTERN = /\/_nuxt\/entry\.[A-Za-z0-9_-]+\.css/

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      headers: {
        'cache-control': 'no-cache',
        pragma: 'no-cache',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    const homepageUrl = new URL(baseUrl)
    homepageUrl.searchParams.set('asset-propagation-check', `${Date.now()}-${attempt}`)

    const homepageResponse = await fetchWithTimeout(homepageUrl)
    if (!homepageResponse.ok) {
      throw new Error(`homepage returned HTTP ${homepageResponse.status}`)
    }

    const html = await homepageResponse.text()
    const assetPath = html.match(ENTRY_CSS_PATTERN)?.[0]
    if (!assetPath) {
      throw new Error('homepage did not reference an entry CSS asset')
    }

    const assetUrl = new URL(assetPath, baseUrl)
    assetUrl.searchParams.set('asset-propagation-check', `${Date.now()}-${attempt}`)

    const assetResponse = await fetchWithTimeout(assetUrl)
    const contentType = assetResponse.headers.get('content-type') || '<missing>'

    if (assetResponse.ok && contentType.toLowerCase().includes('text/css')) {
      console.log(`Deployed asset is ready: ${assetPath} (attempt ${attempt}).`)
      process.exit(0)
    }

    throw new Error(`asset returned HTTP ${assetResponse.status} with content-type ${contentType}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`Deployed assets are not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${message}`)

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS)
    }
  }
}

throw new Error(`Deployed assets for ${baseUrl.origin} did not become ready after ${MAX_ATTEMPTS} attempts.`)
