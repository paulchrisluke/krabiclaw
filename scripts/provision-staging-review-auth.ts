#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { buildStagingReviewAuthSql, buildStagingReviewAuthVerificationSql, STAGING_REVIEW_AUTH } from '../config/staging-review-auth.ts'

if (!process.argv.includes('--staging') || process.argv.includes('--preview') || process.argv.includes('--local')) {
  throw new Error('This provisioner only accepts the explicit --staging target.')
}

const password = process.env.STAGING_REVIEW_PASSWORD
if (!password) throw new Error('STAGING_REVIEW_PASSWORD is required for staging-review provisioning.')

const rotatePassword = process.argv.includes('--rotate-password')
const passwordHash = await hashPassword(password)
const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-staging-review-auth-'))
const sqlPath = join(directory, 'staging-review-auth.sql')

try {
  writeFileSync(sqlPath, buildStagingReviewAuthSql(passwordHash, rotatePassword), { encoding: 'utf8', mode: 0o600 })
  execFileSync('yarn', [
    'wrangler', 'd1', 'execute', 'DB', '--env', 'staging', '--remote', '--file', sqlPath,
  ], { cwd: process.cwd(), stdio: 'inherit' })
  const verification = execFileSync('yarn', [
    'wrangler', 'd1', 'execute', 'DB', '--env', 'staging', '--remote', '--json',
    '--command', buildStagingReviewAuthVerificationSql(),
  ], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  const rows = (JSON.parse(verification) as Array<{ results?: Array<Record<string, string | null>> }>)[0]?.results ?? []
  const bySite = new Map(rows.map(row => [row.site_id, row]))
  for (const siteId of STAGING_REVIEW_AUTH.siteIds) {
    const row = bySite.get(siteId)
    if (!row || !row.team_id || row.team_row_id !== row.team_id || row.team_member_user_id !== STAGING_REVIEW_AUTH.id) {
      throw new Error(`Staging-review provisioning verification failed for ${siteId}.`)
    }
  }
  console.log(`Provisioned durable staging-review identity ${STAGING_REVIEW_AUTH.email} with ${rotatePassword ? 'an explicit credential rotation' : 'credential preservation'}.`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
