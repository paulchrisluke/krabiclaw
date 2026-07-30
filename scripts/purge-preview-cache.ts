const token = process.env.CLOUDFLARE_API_TOKEN
const zoneName = process.env.CF_ZONE_NAME || 'krabiclaw.com'
const previewOrigin = process.env.PREVIEW_CACHE_ORIGIN || 'https://preview.krabiclaw.com'

if (!token) {
  throw new Error('CLOUDFLARE_API_TOKEN is required to purge preview cache.')
}

type CloudflareEnvelope<T> = {
  success: boolean
  errors?: Array<{ message?: string }>
  result?: T
}

const FETCH_TIMEOUT_MS = 15_000

function errorMessage(envelope: CloudflareEnvelope<unknown>, fallback: string) {
  const messages = envelope.errors?.map(error => error.message).filter(Boolean)
  return messages?.length ? messages.join('; ') : fallback
}

async function fetchCloudflare<T>(input: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    const envelope = await response.json() as CloudflareEnvelope<T>
    return { response, envelope }
  } finally {
    clearTimeout(timeout)
  }
}

async function resolveZoneId() {
  if (process.env.CF_ZONE_ID) return process.env.CF_ZONE_ID

  const { response, envelope } = await fetchCloudflare<Array<{ id: string }>>(`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok || !envelope.success) {
    throw new Error(errorMessage(envelope, `Cloudflare zone lookup failed (${response.status})`))
  }

  const zoneId = envelope.result?.[0]?.id
  if (!zoneId) throw new Error(`Cloudflare zone ${zoneName} was not found.`)
  return zoneId
}

function previewUrl(pathname: string) {
  return new URL(pathname, previewOrigin).toString()
}

const files = [
  previewUrl('/'),
  previewUrl('/locations/brooklyn'),
  previewUrl('/blog'),
  previewUrl('/experiences'),
  previewUrl('/experiences/pottery-wheel-class'),
  previewUrl('/about'),
  previewUrl('/contact'),
  previewUrl('/services'),
  previewUrl('/services/family'),
  previewUrl('/pricing'),
  previewUrl('/article/getting-a-divorce-in-north-carolina'),
  previewUrl('/article/preparing-for-your-consultation-with-north-carolina-legal-services'),
]

const zoneId = await resolveZoneId()
const { response, envelope } = await fetchCloudflare<{ id: string }>(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ files }),
})

if (!response.ok || !envelope.success) {
  throw new Error(errorMessage(envelope, `Cloudflare cache purge failed (${response.status})`))
}

console.log(`Purged ${files.length} preview HTML cache entries for ${new URL(previewOrigin).hostname}.`)
