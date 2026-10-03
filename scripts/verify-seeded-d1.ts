#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { verifyPassword } from 'better-auth/crypto'
import { E2E_AUTH_FIXTURES } from '../config/development-auth-fixtures.ts'

const { values } = parseArgs({
  options: {
    'local-dev': { type: 'boolean', default: false },
  },
  strict: true,
})

const organizationIds = ['org-demo', 'org-user-pottery-house', 'org-bVY8SxxUuG6Ctk2CQnfCk8T2cPsj4jJX', 'org-ncls-blawby'] as const
if (values['local-dev']) {
  try { process.loadEnvFile() } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
  }
  if (!process.env.CANARY_LOGIN_EMAIL || !process.env.CANARY_LOGIN_PASSWORD) throw new Error('CANARY_LOGIN_EMAIL and CANARY_LOGIN_PASSWORD are required for local sign-in verification.')
}
const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`
const reviewEmail = sqlString(process.env.CANARY_LOGIN_EMAIL ?? '')
const sql = `
SELECT
  (SELECT COUNT(*) FROM organization WHERE id IN (${organizationIds.map(sqlString).join(', ')})) AS seeded_organizations,
  (SELECT COUNT(*) FROM user WHERE id LIKE 'user-e2e-%') AS fixture_users,
  (SELECT COUNT(*) FROM account WHERE userId LIKE 'user-e2e-%' AND providerId = 'credential') AS fixture_credentials,
  (SELECT COUNT(*) FROM user WHERE lower(email) = lower(${reviewEmail}) AND emailVerified = 1) AS review_users,
  (SELECT a.password FROM account a JOIN user u ON u.id = a.userId WHERE lower(u.email) = lower(${reviewEmail}) AND a.providerId = 'credential') AS review_password,
  (SELECT COUNT(*) FROM d1_migrations) AS applied_migrations,
  (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_errors;
`

const args = [resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB']
args.push('--local')
args.push('--command', sql, '--json')

const output = execFileSync(process.execPath, args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const executions = JSON.parse(output) as Array<{ success?: boolean; results?: Array<Record<string, unknown>> }>
const row = executions.find(execution => execution.success)?.results?.[0]
if (!row) throw new Error('D1 fixture verification returned no result row.')

const invariants: Array<[string, number, number]> = [
  ['seeded organizations', Number(row.seeded_organizations), organizationIds.length],
  ['fixture users', Number(row.fixture_users), E2E_AUTH_FIXTURES.length],
  ['fixture credentials', Number(row.fixture_credentials), E2E_AUTH_FIXTURES.length],
  ['foreign key errors', Number(row.foreign_key_errors), 0],
]
if (values['local-dev']) {
  invariants.push(['verified review account', Number(row.review_users), 1])
  if (typeof row.review_password !== 'string' || !await verifyPassword({ hash: row.review_password, password: process.env.CANARY_LOGIN_PASSWORD! })) throw new Error('The copied review account cannot sign in with CANARY_LOGIN_PASSWORD. Verify its production login before refreshing local data.')
}

const failures = invariants.filter(([, actual, expected]) => actual !== expected)
if (Number(row.applied_migrations) < 1) failures.push(['applied migrations', Number(row.applied_migrations), 1])
if (failures.length > 0) {
  throw new Error(`D1 fixture verification failed: ${failures.map(([name, actual, expected]) => `${name}=${actual}, expected ${expected}`).join('; ')}`)
}

const localDeveloperSummary = values['local-dev'] ? ', the configured review credential' : ''
console.log(`Verified local D1: ${organizationIds.length} curated businesses, ${E2E_AUTH_FIXTURES.length} E2E credentials${localDeveloperSummary}, ${row.applied_migrations} migrations, and no foreign key errors.`)
