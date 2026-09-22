#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { hashPassword } from 'better-auth/crypto'
import {
  E2E_AUTH_FIXTURES,
  LOCAL_DEVELOPER_AUTH_FIXTURE,
  LOCAL_DEVELOPER_LOGIN_URL,
} from '../config/development-auth-fixtures.ts'
import { validatePassword } from '../utils/password-validation.ts'

function generatePassword(): string {
  return requirePolicyCompliant(`Dev-${randomUUID()}-9A!`, 'generated development password')
}

function requirePolicyCompliant(password: string, source: string): string {
  const error = validatePassword(password)
  if (error) throw new Error(`The ${source} is rejected by this app's own password policy: ${error}`)
  return password
}

const { values: options } = parseArgs({
  options: {
    preview: { type: 'boolean', default: false },
    'local-dev': { type: 'boolean', default: false },
    'persist-to': { type: 'string' },
    'user-id': { type: 'string' },
  },
  strict: true,
})
const isPreview = options.preview
const isLocalDev = options['local-dev']
const persistTo = options['persist-to'] ? resolve(options['persist-to']) : null
if (options['user-id'] !== undefined && !isLocalDev) throw new Error('--user-id requires --local-dev.')
if (isPreview && isLocalDev) throw new Error('Choose only one of --preview or --local-dev.')
if (persistTo && isPreview) {
  throw new Error('--persist-to is available only for local D1 fixture provisioning.')
}

// Local runs are driven by hand, so the developer's own .env is the environment
// they mean. CI sets these in the real environment and ships no .env file, where
// this is a no-op.
if (isLocalDev) {
  try {
    process.loadEnvFile()
  } catch {
    // No .env: every value below stays whatever the shell exported.
  }
}

const e2ePassword = process.env.E2E_TEST_PASSWORD
  ? requirePolicyCompliant(process.env.E2E_TEST_PASSWORD, 'E2E_TEST_PASSWORD')
  : (isLocalDev ? generatePassword() : '')
if (!e2ePassword) {
  throw new Error('E2E_TEST_PASSWORD is required when provisioning Better Auth E2E credentials.')
}
// LOCAL_DEVELOPER_PASSWORD is the single source for this account's password:
// /api/dev/login signs in with the same value, so the two only agree when it is
// set. Unset, this stays a throwaway that must be copied from the output below.
const localDeveloperPassword = isLocalDev
  ? (process.env.LOCAL_DEVELOPER_PASSWORD
      ? requirePolicyCompliant(process.env.LOCAL_DEVELOPER_PASSWORD, 'LOCAL_DEVELOPER_PASSWORD')
      : generatePassword())
  : ''

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`
const availableFixtures = isLocalDev
  ? [...E2E_AUTH_FIXTURES, LOCAL_DEVELOPER_AUTH_FIXTURE]
  : E2E_AUTH_FIXTURES
const credentialFixtures = options['user-id'] !== undefined
  ? availableFixtures.filter(fixture => fixture.id === options['user-id'])
  : availableFixtures
if (!credentialFixtures.length) throw new Error(`Unknown development fixture user: ${options['user-id']}`)
const e2ePasswordHash = await hashPassword(e2ePassword)
const localDeveloperPasswordHash = isLocalDev ? await hashPassword(localDeveloperPassword) : ''

const fixtureSql = credentialFixtures.map((fixture) => {
  const passwordHash = fixture.id === LOCAL_DEVELOPER_AUTH_FIXTURE.id
    ? localDeveloperPasswordHash
    : e2ePasswordHash
  const platformRole = fixture.platformRole ?? 'user'
  const memberships = (fixture.memberships ?? []).map((membership) => `
INSERT INTO member (id, organizationId, userId, role, createdAt)
VALUES (${sqlString(`member-${fixture.id}-${membership.organizationId}`)}, ${sqlString(membership.organizationId)}, ${sqlString(fixture.id)}, ${sqlString(membership.role)}, unixepoch())
ON CONFLICT(id) DO UPDATE SET role = excluded.role;
`).join('')
  // Every location team of the named organization. A site team would be one row
  // and is what this used to write; `sites` is gone, so site-wide reach is
  // membership in each of that organization's locations.
  const teamMemberships = (fixture.organizationIds ?? []).map((organizationId) => `
INSERT OR IGNORE INTO team (id, name, organizationId, createdAt)
SELECT 'location:' || id, COALESCE(title, id), organization_id, unixepoch()
FROM business_locations WHERE organization_id = ${sqlString(organizationId)};
UPDATE business_locations SET team_id = COALESCE(team_id, 'location:' || id) WHERE organization_id = ${sqlString(organizationId)};
INSERT INTO teamMember (id, teamId, userId, membershipKey, createdAt)
SELECT ${sqlString(`team-member-${fixture.id}-`)} || bl.id, bl.team_id, ${sqlString(fixture.id)}, bl.team_id || ':' || ${sqlString(fixture.id)}, unixepoch()
FROM business_locations bl WHERE bl.organization_id = ${sqlString(organizationId)} AND bl.team_id IS NOT NULL
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

UPDATE user
SET phoneNumber = ${fixture.phoneNumber ? sqlString(fixture.phoneNumber) : 'NULL'},
    phoneNumberVerified = ${fixture.phoneNumber ? '1' : '0'}
WHERE id = ${sqlString(fixture.id)};

DELETE FROM session WHERE userId = ${sqlString(fixture.id)};
DELETE FROM teamMember WHERE userId = ${sqlString(fixture.id)};
DELETE FROM member WHERE userId = ${sqlString(fixture.id)};
DELETE FROM invitation WHERE lower(email) = lower(${sqlString(fixture.email)});
DELETE FROM account WHERE userId = ${sqlString(fixture.id)} AND providerId = 'credential';
INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
VALUES (${sqlString(`account-${fixture.id}-credential`)}, ${sqlString(fixture.id)}, 'credential', ${sqlString(fixture.id)}, ${sqlString(passwordHash)}, unixepoch(), unixepoch());
${memberships}${teamMemberships}`
}).join('\n')

const localDeveloperCleanupSql = isLocalDev
  ? ''
  : `DELETE FROM user WHERE id = ${sqlString(LOCAL_DEVELOPER_AUTH_FIXTURE.id)};\n`
const sql = `PRAGMA foreign_keys = ON;\n${localDeveloperCleanupSql}${fixtureSql}`
const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-e2e-auth-'))
const sqlPath = join(directory, 'e2e-auth.sql')

try {
  writeFileSync(sqlPath, sql, { encoding: 'utf8', mode: 0o600 })
  const args = [resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB']
  if (isPreview) args.push('--env', 'preview', '--remote')
  else {
    args.push('--local')
    if (persistTo) args.push('--persist-to', persistTo)
  }
  args.push('--file', sqlPath)
  execFileSync(process.execPath, args, { cwd: process.cwd(), stdio: 'inherit' })
  console.log(`Provisioned ${credentialFixtures.length} verified Better Auth development credentials (${isPreview ? 'preview' : 'local'}).`)
  if (credentialFixtures.some(fixture => fixture.id === LOCAL_DEVELOPER_AUTH_FIXTURE.id)) {
    console.log('\nLocal developer sign-in')
    if (process.env.LOCAL_DEVELOPER_PASSWORD) {
      console.log('URL: http://localhost:3000/api/dev/login  (signs in and redirects, no typing)')
    }
    console.log(`URL: ${LOCAL_DEVELOPER_LOGIN_URL}`)
    console.log(`Email: ${LOCAL_DEVELOPER_AUTH_FIXTURE.email}`)
    console.log(`Password: ${localDeveloperPassword}`)
    console.log('Use dashboard links after sign-in. When constructing one manually, its site segment is the site subdomain.')
  }
} finally {
  rmSync(directory, { recursive: true, force: true })
}
