#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { buildStagingReviewAuthSql, STAGING_REVIEW_AUTH } from '../config/staging-review-auth.ts'

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
  console.log(`Provisioned durable staging-review identity ${STAGING_REVIEW_AUTH.email} with ${rotatePassword ? 'an explicit credential rotation' : 'credential preservation'}.`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
