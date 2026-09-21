import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)

function argValue(flag: string) {
  const index = args.indexOf(flag)
  if (index === -1) return null
  return args[index + 1] ?? null
}

// Stored content edits already trigger indexing through the application. A code
// deployment only needs a rebuild when it changes the indexed corpus or renderer.
const changedSince = argValue('--changed-since')
if (args.includes('--changed-since') && !changedSince) throw new Error('--changed-since requires a commit')
if (changedSince) {
  const head = argValue('--changed-until') ?? 'HEAD'
  const changedFiles = execFileSync('git', /^0+$/.test(changedSince)
    ? ['ls-tree', '-r', '--name-only', head]
    : ['diff', '--name-only', changedSince, head], { encoding: 'utf8' }).trim().split('\n')
  const indexInputs = new Set([
    'config/platform-knowledge.ts',
    'server/utils/public-search.ts',
    'server/utils/platform-llm.ts',
    'server/utils/content/documents.ts',
    'server/utils/platform-site.ts',
  ])
  const changedInputs = changedFiles.filter(file => indexInputs.has(file))
  if (changedInputs.length === 0) {
    console.log('AI Search refresh skipped: indexed content definitions and rendering are unchanged.')
    process.exit(0)
  }
  console.log(`AI Search refresh required by: ${changedInputs.join(', ')}`)
}
if (args.includes('--dry-run')) {
  console.log('AI Search refresh planned; dry run made no remote requests.')
  process.exit(0)
}

const baseUrl = (argValue('--base-url') ?? process.env.KRABICLAW_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const secret = argValue('--secret') ?? process.env.PLATFORM_SEARCH_REINDEX_SECRET ?? ''

if (!secret) {
  console.error('Missing PLATFORM_SEARCH_REINDEX_SECRET or --secret')
  process.exit(1)
}

// Each pass is its own request so none meets the Workers request ceiling: the
// platform's corpus first, then every live business's slice, one at a time.
async function reindex(site?: string) {
  const url = new URL('/api/internal/search/reindex', baseUrl)
  if (site) url.searchParams.set('site', site)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-krabiclaw-search-secret': secret,
    },
    signal: AbortSignal.timeout(11 * 60 * 1000),
  })
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    console.error(`AI Search sync failed (${response.status})${site ? ` for site ${site}` : ''}`, payload)
    process.exit(1)
  }
  console.log(JSON.stringify({ site: site ?? 'platform', ...payload }, null, 2))
  return payload
}

// A pass sends a bounded batch of uploads per request and says what is left;
// it is repeated until nothing is.
async function reindexUntilDone(site?: string) {
  let payload = await reindex(site)
  while (Number(payload?.pending ?? 0) > 0) payload = await reindex(site)
  return payload
}

try {
  const platform = await reindexUntilDone()
  const sites = Array.isArray(platform?.sites) ? platform.sites.filter((site): site is string => typeof site === 'string') : []
  for (const site of sites) await reindexUntilDone(site)
} catch (error) {
  const message = error instanceof Error && error.name === 'AbortError'
    ? 'Request timed out'
    : error instanceof Error
      ? error.message
      : 'Unknown request error'
  console.error('AI Search sync failed (network)', { error: message })
  process.exit(1)
}
