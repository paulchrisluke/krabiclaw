import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type BoundStatement = { sql: string; values: unknown[] }

const batches: BoundStatement[][] = []
let spent = false
let existingDomain = 'old-name.krabiclaw.com'

async function queryFirst<T>(_db: unknown, query: string): Promise<T | null> {
  if (query.includes('FROM site_domains') && query.includes("type = 'subdomain'")) {
    return {
      id: 'domain-site-subdomain',
      domain: existingDomain,
      role: 'canonical',
      created_at: '2026-01-01T00:00:00.000Z',
    } as T
  }
  if (query.includes('FROM spent_subdomains')) {
    return (spent ? { domain: 'new-name.krabiclaw.com' } : null) as T | null
  }
  if (query.includes('SELECT * FROM site_domains')) {
    return {
      id: 'domain-site-subdomain-new-name',
      domain: 'new-name.krabiclaw.com',
      type: 'subdomain',
      role: 'canonical',
      status: 'active',
    } as T
  }
  return null
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async () => ({ success: true }),
    queryAll: async () => [],
    queryFirst,
  },
})

mock.module('../../server/utils/billing.ts', {
  namedExports: { hasSiteEntitlement: async () => false },
})

mock.module('../../server/utils/site-events.ts', {
  namedExports: { fireSiteEventSafe: async () => undefined },
})

const { createSystemSubdomain } = await import('../../server/utils/domains.ts')

const db = {
  prepare(sql: string) {
    return {
      bind(...values: unknown[]) {
        return { sql, values }
      },
    }
  },
  async batch(statements: BoundStatement[]) {
    batches.push(statements)
    return []
  },
} as unknown as D1Database

const env = {
  NUXT_PUBLIC_FREE_SITE_DOMAIN: 'krabiclaw.com',
  NUXT_PUBLIC_PLATFORM_DOMAIN: 'krabiclaw.com',
}

test.beforeEach(() => {
  batches.length = 0
  spent = false
  existingDomain = 'old-name.krabiclaw.com'
})

test('rename spends the old host and disables its active row in one D1 batch', async () => {
  await createSystemSubdomain(env, db, 'site', 'org', 'new-name')

  assert.equal(batches.length, 1)
  assert.equal(batches[0]?.length, 4)
  assert.match(batches[0]![0]!.sql, /INSERT INTO spent_subdomains/)
  assert.deepEqual(batches[0]![0]!.values.slice(0, 3), [
    'old-name.krabiclaw.com',
    'site',
    'new-name.krabiclaw.com',
  ])
  assert.match(batches[0]![1]!.sql, /UPDATE site_domains[\s\S]*status = 'disabled'/)
  assert.match(batches[0]![2]!.sql, /INSERT INTO site_domains/)
  assert.match(batches[0]![3]!.sql, /UPDATE sites SET public_url/)
})

test('rename includes the settings update in the subdomain handoff batch', async () => {
  await createSystemSubdomain(env, db, 'site', 'org', 'new-name', {
    siteUpdate: {
      sql: 'UPDATE sites SET brand_name = ?, subdomain = ? WHERE id = ?',
      values: ['New Name', 'new-name', 'site'],
    },
  })

  assert.equal(batches.length, 1)
  assert.equal(batches[0]?.length, 5)
  assert.match(batches[0]![4]!.sql, /UPDATE sites SET brand_name/)
  assert.deepEqual(batches[0]![4]!.values, ['New Name', 'new-name', 'site'])
})

test('a permanently spent host cannot be assigned again', async () => {
  spent = true

  await assert.rejects(
    () => createSystemSubdomain(env, db, 'site', 'org', 'new-name'),
    /has already been used and cannot be reassigned/,
  )
  assert.equal(batches.length, 0)
})
