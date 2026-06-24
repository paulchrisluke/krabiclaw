#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

function usage() {
  console.error('Usage: node scripts/promote-platform-admin.mjs --email user@example.com [--remote|--local|--staging]')
  process.exit(1)
}

const args = process.argv.slice(2)
const emailIndex = args.indexOf('--email')
if (emailIndex === -1 || !args[emailIndex + 1]) usage()

const email = String(args[emailIndex + 1]).trim().toLowerCase()
if (!email) usage()

const targetFlag = args.includes('--staging')
  ? '--env staging --remote'
  : args.includes('--remote')
    ? '--remote'
    : '--local'

const sql = `UPDATE user SET role = 'admin' WHERE lower(email) = '${email.replace(/'/g, "''")}';`
const cmdArgs = ['wrangler', 'd1', 'execute', 'DB', ...targetFlag.split(' '), '--command', sql]

console.log(`Promoting ${email} to platform admin using: yarn ${cmdArgs.join(' ')}`)

const result = spawnSync('yarn', cmdArgs, { stdio: 'inherit' })
process.exit(result.status ?? 1)
