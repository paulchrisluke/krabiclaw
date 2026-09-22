import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { Miniflare } from 'miniflare'
import { createDb, queryFirst } from '../../server/db/index.ts'
import { ensureSiteTeam, organizationAdapter, siteTeamId } from '../../server/utils/member-access.ts'

// Better Auth owns `team`, `organization` and `member`. Site provisioning must
// reach them through Better Auth's own organization adapter rather than
// writing the rows itself, because the adapter is the only thing that knows
// what a complete row is — `memberCount`, the epoch-seconds `createdAt`, and
// whatever the plugin adds next. This proves the canonical path does that, and
// that a team id already owned by another organization is refused rather than
// re-pointed at the caller's.

async function migratedEnv() {
  const miniflare = new Miniflare({ workers: [{ config: {
    name: 'team-provisioning-test', type: 'worker', compatibilityDate: '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: {
      'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' },
    } },
    env: { DB: { type: 'd1' } },
  } }] })
  const d1 = await miniflare.getD1Database('DB')
  for (const file of readdirSync('migrations').filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    for (const sql of readFileSync(`migrations/${file}`, 'utf8').split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) {
      await d1.prepare(sql).run()
    }
  }
  const env = {
    DB: d1 as unknown as D1Database,
    BETTER_AUTH_URL: 'https://team-provisioning.test',
    // Generated per run. Better Auth warns below 32 characters, and a literal
    // long enough to silence that warning is a hardcoded secret as far as any
    // scanner is concerned.
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    STRIPE_SECRET_KEY: 'sk_test_team_provisioning',
  } as unknown as CloudflareEnv
  return { miniflare, d1, env, db: createDb(d1 as unknown as D1Database) }
}

async function seedOrganization(d1: D1Database, id: string) {
  await d1.prepare('INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, unixepoch())')
    .bind(id, `Org ${id}`, id).run()
}

async function seedSite(d1: D1Database, siteId: string, organizationId: string) {
  await d1.prepare('INSERT INTO sites (id, organization_id, slug, subdomain, name) VALUES (?, ?, ?, ?, ?)')
    .bind(siteId, organizationId, siteId, siteId, `Site ${siteId}`).run()
}

test('site provisioning writes its Better Auth team through the organization adapter', async () => {
  const { miniflare, d1, env, db } = await migratedEnv()
  try {
    await seedOrganization(d1, 'org-a')
    await seedSite(d1, 'site-a', 'org-a')

    const teamId = await ensureSiteTeam(db, { env, organizationId: 'org-a', siteId: 'site-a', name: 'Site A' })
    assert.equal(teamId, siteTeamId('site-a'))

    // Read back through Better Auth, not through our own SQL: if the row were
    // hand-written and missing what the plugin expects, the adapter would not
    // return it in this shape.
    const adapter = await organizationAdapter(env)
    const team = await adapter.findTeamById({ teamId, organizationId: 'org-a' })
    assert.ok(team, 'Better Auth must be able to read the provisioned team')
    assert.equal(team.organizationId, 'org-a')
    assert.equal(team.name, 'Site A')
    // Not merely "is a Date": a hand-written row storing an ISO string in this
    // epoch-seconds column still reads back as a Date object, just an invalid
    // one. The adapter is what puts a real timestamp there.
    assert.ok(Number.isFinite(team.createdAt?.getTime()), `createdAt must be a real timestamp, got ${team.createdAt}`)

    const linked = await queryFirst<{ team_id: string | null }>(db, 'SELECT team_id FROM sites WHERE id = ?', ['site-a'])
    assert.equal(linked?.team_id, teamId)

    // Deterministic id, so the second call must find the row rather than
    // create a duplicate or a second organization's copy.
    assert.equal(await ensureSiteTeam(db, { env, organizationId: 'org-a', siteId: 'site-a', name: 'Site A' }), teamId)
    const teams = await queryFirst<{ count: number }>(db, 'SELECT count(*) count FROM team WHERE id = ?', [teamId])
    assert.equal(teams?.count, 1)
  } finally {
    await miniflare.dispose()
  }
})

test('a site team id owned by another organization is refused, not re-pointed', async () => {
  const { miniflare, d1, env, db } = await migratedEnv()
  try {
    await seedOrganization(d1, 'org-a')
    await seedOrganization(d1, 'org-b')
    await seedSite(d1, 'site-shared', 'org-a')
    await ensureSiteTeam(db, { env, organizationId: 'org-a', siteId: 'site-shared', name: 'Site A' })

    await assert.rejects(
      ensureSiteTeam(db, { env, organizationId: 'org-b', siteId: 'site-shared', name: 'Site B' }),
      /belongs to another organization/,
    )

    const adapter = await organizationAdapter(env)
    const team = await adapter.findTeamById({ teamId: siteTeamId('site-shared') })
    assert.equal(team?.organizationId, 'org-a')
  } finally {
    await miniflare.dispose()
  }
})
