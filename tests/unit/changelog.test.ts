import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ChangelogFetchError,
  DEFAULT_CHANGELOG_LIMIT,
  getRecentChanges,
  validateChangelogLimit,
} from '../../server/utils/changelog.ts'
import { getPlatformMcpTool } from '../../server/utils/platform-mcp-tools.ts'

function pullRequest(input: {
  number: number
  title: string
  mergedAt: string | null
  body?: string | null
  author?: string
}) {
  return {
    number: input.number,
    title: input.title,
    body: input.body ?? null,
    user: { login: input.author ?? 'krabi-maintainer' },
    merged_at: input.mergedAt,
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

test('getRecentChanges preserves conventional-commit scope metadata', async () => {
  const result = await getRecentChanges({
    githubToken: 'test-token',
    fetchImpl: (async () => githubResponse([
      pullRequest({ number: 12, title: 'fix(auth): reject expired sessions', mergedAt: '2026-07-15T10:00:00Z' }),
    ])) as typeof fetch,
  })

  assert.equal(result.limit, DEFAULT_CHANGELOG_LIMIT)
  assert.equal(result.commits.fix[0]?.scope, 'auth')
  assert.equal(result.commits.fix[0]?.description, 'reject expired sessions')
})

test('changelog limit validation rejects unbounded or non-integer requests', () => {
  assert.equal(validateChangelogLimit(undefined), DEFAULT_CHANGELOG_LIMIT)
  assert.equal(validateChangelogLimit(1), 1)
  assert.equal(validateChangelogLimit(100), 100)
  for (const value of [0, 101, 1.5, '10', null, Number.NaN]) {
    assert.throws(() => validateChangelogLimit(value), /integer between 1 and 100/)
  }
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
})
