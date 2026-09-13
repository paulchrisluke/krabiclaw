import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { BetterAuthOptions } from 'better-auth'
import { oauthProvider } from '@better-auth/oauth-provider'
import { createDb } from '../../server/db/index.ts'
import * as schema from '../../server/db/schema.ts'
import { healStaleCimdClient, type AppAuthContext } from '../../server/utils/auth.ts'

const CHATGPT_CLIENT_ID = 'https://chatgpt.com/oauth/client.json'
const UNRELATED_CLIENT_ID = 'https://not-a-known-vendor.example.com/oauth/client.json'

test('healStaleCimdClient removes a known CIMD vendor row that predates clientDiscoveryId', async () => {
  const miniflare = new Miniflare({ workers: [{ config: {
    name: 'oauth-client-self-heal-test', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: {
      'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' },
    } },
    env: { DB: { type: 'd1' } },
  } }] })
  try {
    const d1 = await miniflare.getD1Database('DB')
    for (const file of readdirSync('migrations').filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      for (const sql of readFileSync(`migrations/${file}`, 'utf8').split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) {
        await d1.prepare(sql).run()
      }
    }

    // Same adapter factory server/utils/auth.ts wires into betterAuth() —
    // used directly here so the test goes through Better Auth's documented
    // model API (findOne/create/delete) instead of raw SQL against a
    // Better-Auth-owned table, per the boundary guarded by
    // scripts/check-better-auth-boundaries.mjs (issue #386).
    const db = createDb(d1 as unknown as D1Database)
    // oauthClient is a plugin-owned model — getAuthTables (which
    // drizzleAdapter consults to resolve model names) only knows about it
    // when oauthProvider is present in `options.plugins`, same as production.
    const adapter = drizzleAdapter(db, { provider: 'sqlite', schema })({ plugins: [oauthProvider({})] } as BetterAuthOptions)

    const insertClient = (clientId: string, clientDiscoveryId: string | null) => adapter.create({
      model: 'oauthClient',
      data: {
        clientId,
        name: 'Test client',
        redirectUris: '[]',
        clientDiscoveryId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    const rowFor = (clientId: string) => adapter.findOne<{ clientId: string; clientDiscoveryId: string | null }>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: clientId }],
    })
    // healStaleCimdClient only reads context.adapter, so a bare context
    // stand-in is enough — no need to stand up all of createAuth()'s plugins.
    const context = { adapter } as unknown as AppAuthContext

    // A legacy row for a known CIMD vendor, missing clientDiscoveryId — the
    // exact shape that caused incident #953.
    await insertClient(CHATGPT_CLIENT_ID, null)
    await healStaleCimdClient(context, CHATGPT_CLIENT_ID)
    assert.equal(await rowFor(CHATGPT_CLIENT_ID), null, 'stale legacy row for a known vendor must be deleted')

    // A healthy, already CIMD-owned row for the same vendor must be left alone.
    await insertClient(CHATGPT_CLIENT_ID, 'cimd')
    await healStaleCimdClient(context, CHATGPT_CLIENT_ID)
    const healthyRow = await rowFor(CHATGPT_CLIENT_ID)
    assert.equal(healthyRow?.clientDiscoveryId, 'cimd', 'a healthy CIMD-owned row must not be touched')

    // A managed row for a client_id that is NOT one of our known CIMD vendors
    // must never be touched, even if it also lacks clientDiscoveryId — this
    // function only ever acts on the hardcoded vendor allowlist.
    await insertClient(UNRELATED_CLIENT_ID, null)
    await healStaleCimdClient(context, UNRELATED_CLIENT_ID)
    const unrelatedRow = await rowFor(UNRELATED_CLIENT_ID)
    assert.equal(unrelatedRow?.clientDiscoveryId, null, 'a non-vendor client_id must never be deleted')
  } finally {
    await miniflare.dispose()
  }
})
