import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { healStaleCimdClient } from '../../server/utils/auth.ts'
import type { DbClient } from '../../server/db/index.ts'

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
    const db = await miniflare.getD1Database('DB')
    for (const file of readdirSync('migrations').filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
      for (const sql of readFileSync(`migrations/${file}`, 'utf8').split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) {
        await db.prepare(sql).run()
      }
    }

    const insertClient = (clientId: string, clientDiscoveryId: string | null) => db.prepare(
      `INSERT INTO oauthClient (id, clientId, name, redirectUris, clientDiscoveryId, createdAt, updatedAt)
       VALUES (?, ?, 'Test client', '[]', ?, ${Date.now()}, ${Date.now()})`,
    ).bind(`id-${clientId}`, clientId, clientDiscoveryId).run()
    const rowFor = (clientId: string) => db.prepare('SELECT clientId, clientDiscoveryId FROM oauthClient WHERE clientId = ?').bind(clientId).first()

    // A legacy row for a known CIMD vendor, missing clientDiscoveryId — the
    // exact shape that caused incident #953.
    await insertClient(CHATGPT_CLIENT_ID, null)
    await healStaleCimdClient(db as unknown as DbClient, CHATGPT_CLIENT_ID)
    assert.equal(await rowFor(CHATGPT_CLIENT_ID), null, 'stale legacy row for a known vendor must be deleted')

    // A healthy, already CIMD-owned row for the same vendor must be left alone.
    await insertClient(CHATGPT_CLIENT_ID, 'cimd')
    await healStaleCimdClient(db as unknown as DbClient, CHATGPT_CLIENT_ID)
    assert.deepEqual(await rowFor(CHATGPT_CLIENT_ID), { clientId: CHATGPT_CLIENT_ID, clientDiscoveryId: 'cimd' }, 'a healthy CIMD-owned row must not be touched')

    // A managed row for a client_id that is NOT one of our known CIMD vendors
    // must never be touched, even if it also lacks clientDiscoveryId — this
    // function only ever acts on the hardcoded vendor allowlist.
    await insertClient(UNRELATED_CLIENT_ID, null)
    await healStaleCimdClient(db as unknown as DbClient, UNRELATED_CLIENT_ID)
    assert.deepEqual(await rowFor(UNRELATED_CLIENT_ID), { clientId: UNRELATED_CLIENT_ID, clientDiscoveryId: null }, 'a non-vendor client_id must never be deleted')
  } finally {
    await miniflare.dispose()
  }
})
