import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHANGE_TYPES,
  ChangelogFetchError,
  DEFAULT_CHANGELOG_LIMIT,
  getRecentChanges,
  parseChangelogLimitQuery,
  validateChangelogLimit,
} from '../../server/utils/changelog.ts'
import { getPlatformMcpTool } from '../../server/utils/platform-mcp-tools.ts'

function pullRequest(input: {
  number: number
  title: string
  mergedAt: string | null
  updatedAt?: string
  body?: string | null
  author?: string
}) {
  return {
    number: input.number,
    title: input.title,
    body: input.body ?? null,
    user: { login: input.author ?? 'krabi-maintainer' },
    merged_at: input.mergedAt,
    updated_at: input.updatedAt ?? input.mergedAt ?? '2026-07-12T10:00:00Z',
    html_url: `https://github.com/paulchrisluke/krabiclaw/pull/${input.number}`,
  }
}

function githubResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('getRecentChanges paginates, sorts, limits, and categorizes merged pull requests', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => pullRequest({
    number: index + 1,
    title: index === 0 ? 'fix(auth): reject expired sessions' : `Closed PR ${index + 1}`,
    mergedAt: index === 0 ? '2026-07-13T10:00:00Z' : null,
  }))
  const secondPage = [
    pullRequest({ number: 101, title: 'feat: add recent changes', mergedAt: '2026-07-15T10:00:00Z', body: 'Release data' }),
    pullRequest({ number: 102, title: 'Update dependencies', mergedAt: '2026-07-14T10:00:00Z' }),
  ]
  const requestedUrls: string[] = []

  const result = await getRecentChanges({
    githubToken: 'test-token',
    limit: 2,
    fetchImpl: (async (input, init) => {
      requestedUrls.push(String(input))
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token')
      return requestedUrls.length === 1 ? githubResponse(firstPage) : githubResponse(secondPage)
    }) as typeof fetch,
  })

  assert.equal(requestedUrls.length, 2)
  assert.match(requestedUrls[1]!, /page=2$/)
  assert.equal(result.total, 2)
  assert.equal(result.limit, 2)
  assert.equal(result.lastUpdated, '2026-07-15T10:00:00Z')
  assert.deepEqual(result.commits.feat.map(change => change.number), [101])
  assert.equal(result.commits.feat[0]?.description, 'add recent changes')
  assert.deepEqual(result.commits.other.map(change => change.number), [102])
  assert.equal(result.commits.fix.length, 0)
})

test('getRecentChanges preserves conventional-commit metadata for breaking changes', async () => {
  const result = await getRecentChanges({
    githubToken: 'test-token',
    fetchImpl: (async () => githubResponse([
      pullRequest({ number: 12, title: 'fix(auth)!: reject expired sessions', mergedAt: '2026-07-15T10:00:00Z' }),
      pullRequest({ number: 13, title: 'feat!: replace the release API', mergedAt: '2026-07-14T10:00:00Z' }),
    ])) as typeof fetch,
  })

  assert.equal(result.limit, DEFAULT_CHANGELOG_LIMIT)
  assert.equal(result.commits.fix[0]?.scope, 'auth')
  assert.equal(result.commits.fix[0]?.description, 'reject expired sessions')
  assert.equal(result.commits.fix[0]?.type, 'fix')
  assert.equal(result.commits.feat[0]?.scope, null)
  assert.equal(result.commits.feat[0]?.description, 'replace the release API')
  assert.equal(result.commits.feat[0]?.type, 'feat')
})

test('getRecentChanges keeps paging when the first full page satisfies limit but cannot prove the merge cutoff', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => pullRequest({
    number: index + 1,
    title: `chore: old merge ${index + 1}`,
    mergedAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-07-20T10:00:00Z',
  }))
  const secondPage = [
    pullRequest({ number: 101, title: 'feat: actually newest merge', mergedAt: '2026-07-18T10:00:00Z', updatedAt: '2026-07-19T10:00:00Z' }),
    pullRequest({ number: 102, title: 'fix: second newest merge', mergedAt: '2026-07-17T10:00:00Z', updatedAt: '2026-07-19T09:00:00Z' }),
  ]
  let requestCount = 0

  const result = await getRecentChanges({
    githubToken: 'test-token',
    limit: 2,
    fetchImpl: (async () => {
      requestCount += 1
      return githubResponse(requestCount === 1 ? firstPage : secondPage)
    }) as typeof fetch,
  })

  assert.equal(requestCount, 2)
  assert.deepEqual(
    [...result.commits.feat, ...result.commits.fix].map(change => change.number),
    [101, 102],
  )
  assert.equal(result.lastUpdated, '2026-07-18T10:00:00Z')
})

test('getRecentChanges stops after a full page once the updated-at boundary proves later merges are older', async () => {
  const page = Array.from({ length: 100 }, (_, index) => pullRequest({
    number: index + 1,
    title: `fix: merge ${index + 1}`,
    mergedAt: index === 0
      ? '2026-07-20T10:00:00Z'
      : index === 1 ? '2026-07-19T10:00:00Z' : '2026-06-01T10:00:00Z',
    updatedAt: index === 0
      ? '2026-07-20T10:00:00Z'
      : index === 1 ? '2026-07-19T10:00:00Z' : '2026-06-01T10:00:00Z',
  }))
  let requestCount = 0

  const result = await getRecentChanges({
    githubToken: 'test-token',
    limit: 2,
    fetchImpl: (async () => {
      requestCount += 1
      return githubResponse(page)
    }) as typeof fetch,
  })

  assert.equal(requestCount, 1)
  assert.deepEqual(result.commits.fix.map(change => change.number), [1, 2])
})

test('changelog limit validation rejects unbounded or non-integer requests', () => {
  assert.equal(validateChangelogLimit(undefined), DEFAULT_CHANGELOG_LIMIT)
  assert.equal(validateChangelogLimit(1), 1)
  assert.equal(validateChangelogLimit(100), 100)
  for (const value of [0, 101, 1.5, '10', null, Number.NaN]) {
    assert.throws(() => validateChangelogLimit(value), /integer between 1 and 100/)
  }
})

test('changelog query limit parser defaults only when omitted and rejects malformed values', () => {
  assert.equal(parseChangelogLimitQuery(undefined), DEFAULT_CHANGELOG_LIMIT)
  assert.equal(parseChangelogLimitQuery('1'), 1)
  assert.equal(parseChangelogLimitQuery('100'), 100)
  for (const value of ['', ' ', '0', '101', '1.5', '+1', '10abc', ['10'], null, 10]) {
    assert.throws(() => parseChangelogLimitQuery(value), /integer between 1 and 100/)
  }
})

test('changelog route returns 400 for malformed limits and preserves the omitted default', async (t) => {
  const globals = globalThis as unknown as Record<string, unknown>
  const originals = {
    defineEventHandler: globals.defineEventHandler,
    cloudflareEnv: globals.cloudflareEnv,
    getQuery: globals.getQuery,
    fetch: globalThis.fetch,
  }
  t.after(() => {
    globals.defineEventHandler = originals.defineEventHandler
    globals.cloudflareEnv = originals.cloudflareEnv
    globals.getQuery = originals.getQuery
    globalThis.fetch = originals.fetch
  })

  let fetchCount = 0
  globals.defineEventHandler = (handler: unknown) => handler
  globals.cloudflareEnv = () => ({ GITHUB_TOKEN: 'test-token' })
  globals.getQuery = (event: { context: { query: Record<string, unknown> } }) => event.context.query
  globalThis.fetch = (async () => {
    fetchCount += 1
    return githubResponse([])
  }) as typeof fetch

  const { default: handler } = await import('../../server/api/changelog.get.ts') as {
    default: (_event: { context: { query: Record<string, unknown> } }) => Promise<Response>
  }

  for (const limit of ['', '0', '101', '1.5', '10abc']) {
    const response = await handler({ context: { query: { limit } } })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'limit must be an integer between 1 and 100.' })
  }
  assert.equal(fetchCount, 0)

  const response = await handler({ context: { query: {} } })
  assert.equal(response.status, 200)
  assert.equal((await response.json() as { limit: number }).limit, DEFAULT_CHANGELOG_LIMIT)
  assert.equal(fetchCount, 1)
})

test('getRecentChanges reports GitHub failures without response-body leakage', async () => {
  await assert.rejects(
    getRecentChanges({
      githubToken: 'test-token',
      fetchImpl: (async () => new Response('sensitive upstream detail', { status: 403 })) as typeof fetch,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ChangelogFetchError)
      assert.equal(error.message, 'GitHub API error: 403')
      assert.equal(error.statusCode, 500)
      return true
    },
  )
})

test('platform MCP exposes recent changes as a bounded, read-only open-world tool', () => {
  const tool = getPlatformMcpTool('get_recent_changes')
  assert.ok(tool)
  assert.deepEqual(tool.annotations, {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  })
  assert.equal(tool.inputSchema.additionalProperties, false)
  const limit = (tool.inputSchema.properties as Record<string, Record<string, unknown>>).limit
  assert.deepEqual(
    { type: limit?.type, minimum: limit?.minimum, maximum: limit?.maximum, default: limit?.default },
    { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  )

  const outputProperties = tool.outputSchema.properties as Record<string, Record<string, unknown>>
  const commitBuckets = (outputProperties.commits?.properties ?? {}) as Record<string, Record<string, unknown>>
  for (const category of CHANGE_TYPES) {
    const items = commitBuckets[category]?.items as Record<string, unknown>
    const properties = items.properties as Record<string, Record<string, unknown>>
    assert.deepEqual(properties.type?.enum, [category])
  }
})
