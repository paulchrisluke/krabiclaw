#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { E2E_AUTH_FIXTURES } from '../config/e2e-auth-fixtures.ts'

const isPreview = process.argv.includes('--preview')
const isStaging = process.argv.includes('--staging')
const environmentIndex = process.argv.indexOf('--env')
const explicitEnvironment = environmentIndex === -1 ? null : process.argv[environmentIndex + 1] ?? null
const e2eEnvironmentNames = new Set<string>(
  JSON.parse(readFileSync(join(process.cwd(), 'config/e2e-lanes.json'), 'utf8')).map((lane: { name: string }) => lane.name),
)
if (isPreview && isStaging || isPreview && explicitEnvironment || isStaging && explicitEnvironment) {
  throw new Error('Choose only one of --preview, --staging, or --env <e2e-lane>.')
}
if (explicitEnvironment && !e2eEnvironmentNames.has(explicitEnvironment)) {
  throw new Error(`--env must name a configured E2E lane: ${[...e2eEnvironmentNames].join(', ')}`)
}

const password = process.env.E2E_TEST_PASSWORD
if (!password) {
  throw new Error('E2E_TEST_PASSWORD is required when provisioning Better Auth E2E credentials.')
}

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`
const passwordHash = await hashPassword(password)

const fixtureSql = E2E_AUTH_FIXTURES.map((fixture) => {
  const platformRole = fixture.platformRole ?? 'user'
  const memberships = (fixture.memberships ?? []).map((membership) => `
INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES (${sqlString(`member-${fixture.id}-${membership.organizationId}`)}, ${sqlString(membership.organizationId)}, ${sqlString(fixture.id)}, ${sqlString(membership.role)}, unixepoch())
ON CONFLICT(id) DO UPDATE SET role = excluded.role;
`).join('')
  const teamMemberships = (fixture.siteIds ?? []).map((siteId) => `
INSERT OR IGNORE INTO team (id, name, organizationId, createdAt)
SELECT 'site:' || id, COALESCE(brand_name, id), organization_id, unixepoch()
FROM sites WHERE id = ${sqlString(siteId)};
UPDATE sites SET team_id = COALESCE(team_id, 'site:' || id) WHERE id = ${sqlString(siteId)};
INSERT INTO teamMember (id, teamId, userId, membershipKey, createdAt)
SELECT ${sqlString(`team-member-${fixture.id}-${siteId}`)}, team_id, ${sqlString(fixture.id)}, team_id || ':' || ${sqlString(fixture.id)}, unixepoch()
FROM sites WHERE id = ${sqlString(siteId)} AND team_id IS NOT NULL
ON CONFLICT(id) DO UPDATE SET teamId = excluded.teamId, userId = excluded.userId, membershipKey = excluded.membershipKey;
`).join('')

  return `
INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES (${sqlString(fixture.id)}, ${sqlString(fixture.name)}, ${sqlString(fixture.email)}, 1, ${sqlString(platformRole)}, unixepoch(), unixepoch())
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  email = excluded.email,
  emailVerified = 1,
  role = excluded.role,
  updatedAt = unixepoch();

DELETE FROM session WHERE userId = ${sqlString(fixture.id)};
DELETE FROM teamMember WHERE userId = ${sqlString(fixture.id)};
DELETE FROM member WHERE userId = ${sqlString(fixture.id)};
DELETE FROM invitation WHERE lower(email) = lower(${sqlString(fixture.email)});
DELETE FROM account WHERE userId = ${sqlString(fixture.id)} AND providerId = 'credential';
INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
VALUES (${sqlString(`account-${fixture.id}-credential`)}, ${sqlString(fixture.id)}, 'credential', ${sqlString(fixture.id)}, ${sqlString(passwordHash)}, unixepoch(), unixepoch());
${memberships}${teamMemberships}`
}).join('\n')

const sql = `PRAGMA foreign_keys = ON;\n${fixtureSql}`
const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-e2e-auth-'))
const sqlPath = join(directory, 'e2e-auth.sql')

try {
  writeFileSync(sqlPath, sql, { encoding: 'utf8', mode: 0o600 })
  const args = ['wrangler', 'd1', 'execute', 'DB']
  if (isPreview) args.push('--env', 'preview', '--remote')
  else if (isStaging) args.push('--env', 'staging', '--remote')
  else if (explicitEnvironment) args.push('--env', explicitEnvironment, '--remote')
  else args.push('--local')
  args.push('--file', sqlPath)
  execFileSync('yarn', args, { cwd: process.cwd(), stdio: 'inherit' })
  console.log(`Provisioned ${E2E_AUTH_FIXTURES.length} verified Better Auth E2E credentials (${isStaging ? 'staging' : isPreview ? 'preview' : explicitEnvironment ?? 'local'}).`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
