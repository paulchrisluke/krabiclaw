// Temporary diagnostic script: reports the current AI Search item count and how long
// listing them takes, via GET /api/internal/search/status. Used to test whether
// listAllItems() (which runs before any upload in rebuildPlatformKnowledgeIndex) is
// itself the bottleneck behind repeated production reindex failures.
const args = process.argv.slice(2)

function argValue(flag: string) {
  const index = args.indexOf(flag)
  if (index === -1) return null
  return args[index + 1] ?? null
}

const baseUrl = (argValue('--base-url') ?? process.env.KRABICLAW_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const secret = argValue('--secret') ?? process.env.PLATFORM_SEARCH_REINDEX_SECRET ?? ''

if (!secret) {
  console.error('Missing PLATFORM_SEARCH_REINDEX_SECRET or --secret')
  process.exit(1)
}

try {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60 * 1000)
  const response = await fetch(`${baseUrl}/api/internal/search/status`, {
    headers: {
      'x-krabiclaw-search-secret': secret,
    },
    signal: controller.signal,
  })
  clearTimeout(timeout)

  const payload = await response.json().catch(() => null)
  console.log(`AI Search status (${response.status})`, JSON.stringify(payload, null, 2))
} catch (error) {
  const message = error instanceof Error && error.name === 'AbortError'
    ? 'Request timed out'
    : error instanceof Error
      ? error.message
      : 'Unknown request error'
  console.error('AI Search status check failed (network)', { error: message })
}
