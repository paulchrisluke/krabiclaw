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

const response = await fetch(`${baseUrl}/api/internal/search/reindex`, {
  method: 'POST',
  headers: {
    'x-krabiclaw-search-secret': secret,
  },
})

const payload = await response.json().catch(() => null)

if (!response.ok) {
  console.error(`AI Search sync failed (${response.status})`, payload)
  process.exit(1)
}

console.log(JSON.stringify(payload, null, 2))
