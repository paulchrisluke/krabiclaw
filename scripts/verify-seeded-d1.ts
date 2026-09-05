#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { E2E_AUTH_FIXTURES, LOCAL_DEVELOPER_AUTH_FIXTURE } from '../config/development-auth-fixtures.ts'

const { values } = parseArgs({
  options: {
    preview: { type: 'boolean', default: false },
    'local-dev': { type: 'boolean', default: false },
  },
  strict: true,
})

if (values.preview && values['local-dev']) {
  throw new Error('--local-dev is available only for local D1 fixture verification.')
}

const siteIds = ['site-demo', 'site-pottery-house', 'site-kikuzuki', 'site-ncls-blawby'] as const
const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`
const sql = `
SELECT
  (SELECT COUNT(*) FROM sites WHERE id IN (${siteIds.map(sqlString).join(', ')})) AS seeded_sites,
  (SELECT COUNT(*) FROM user WHERE id LIKE 'user-e2e-%') AS fixture_users,
  (SELECT COUNT(*) FROM account WHERE userId LIKE 'user-e2e-%' AND providerId = 'credential') AS fixture_credentials,
  (SELECT COUNT(*) FROM user WHERE id = ${sqlString(LOCAL_DEVELOPER_AUTH_FIXTURE.id)}) AS local_developer_users,
  (SELECT COUNT(*) FROM account WHERE userId = ${sqlString(LOCAL_DEVELOPER_AUTH_FIXTURE.id)} AND providerId = 'credential') AS local_developer_credentials,
  (SELECT COUNT(*) FROM member WHERE userId = ${sqlString(LOCAL_DEVELOPER_AUTH_FIXTURE.id)}) AS local_developer_memberships,
  (SELECT COUNT(*) FROM d1_migrations) AS applied_migrations,
  (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_errors;
`

const args = [resolve('node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB']
if (values.preview) args.push('--env', 'preview', '--remote')
else args.push('--local')
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
  ['seeded sites', Number(row.seeded_sites), siteIds.length],
  ['fixture users', Number(row.fixture_users), E2E_AUTH_FIXTURES.length],
  ['fixture credentials', Number(row.fixture_credentials), E2E_AUTH_FIXTURES.length],
  ['local developer users', Number(row.local_developer_users), values['local-dev'] ? 1 : 0],
  ['local developer credentials', Number(row.local_developer_credentials), values['local-dev'] ? 1 : 0],
  ['local developer memberships', Number(row.local_developer_memberships), values['local-dev'] ? (LOCAL_DEVELOPER_AUTH_FIXTURE.memberships?.length ?? 0) : 0],
  ['foreign key errors', Number(row.foreign_key_errors), 0],
]

const failures = invariants.filter(([, actual, expected]) => actual !== expected)
if (Number(row.applied_migrations) < 1) failures.push(['applied migrations', Number(row.applied_migrations), 1])
if (failures.length > 0) {
  throw new Error(`D1 fixture verification failed: ${failures.map(([name, actual, expected]) => `${name}=${actual}, expected ${expected}`).join('; ')}`)
}

const localDeveloperSummary = values['local-dev'] ? ', the local developer credential' : ''
console.log(`Verified ${values.preview ? 'preview' : 'local'} D1: ${siteIds.length} curated sites, ${E2E_AUTH_FIXTURES.length} E2E credentials${localDeveloperSummary}, ${row.applied_migrations} migrations, and no foreign key errors.`)
