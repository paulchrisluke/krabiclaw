#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword } from 'better-auth/crypto'

const email = (process.env.LOCAL_MCP_TEST_EMAIL || '').trim().toLowerCase()
const password = process.env.LOCAL_MCP_TEST_PASSWORD || ''
const userId = process.env.MCP_CHATGPT_USER_ID || 'user-mcp-managed'

if (!email || !password) {
  throw new Error('LOCAL_MCP_TEST_EMAIL and LOCAL_MCP_TEST_PASSWORD are required for the manual ChatGPT gate.')
}
if (password.length < 8) {
  throw new Error('LOCAL_MCP_TEST_PASSWORD must be at least 8 characters.')
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

const passwordHash = await hashPassword(password)
const directory = mkdtempSync(join(tmpdir(), 'krabiclaw-mcp-user-'))
const sqlPath = join(directory, 'provision.sql')

// This is deliberately local-only fixture provisioning. The demo seed recreates
// user-mcp-managed on every run; adding its real credential account lets a human
// complete OAuth in a normal browser without weakening the production login flow.
const sql = `DELETE FROM user
WHERE email = ${sqlString(email)} AND id <> ${sqlString(userId)};

UPDATE user
SET email = ${sqlString(email)},
    name = 'Local MCP Tester',
    emailVerified = 1,
    updatedAt = unixepoch()
WHERE id = ${sqlString(userId)};

DELETE FROM account
WHERE userId = ${sqlString(userId)} AND providerId = 'credential';

INSERT INTO account
  (id, accountId, providerId, userId, password, createdAt, updatedAt)
VALUES
  ('account-mcp-chatgpt-credential', ${sqlString(userId)}, 'credential', ${sqlString(userId)}, ${sqlString(passwordHash)}, unixepoch(), unixepoch());
`

try {
  writeFileSync(sqlPath, sql, { mode: 0o600 })
  const result = spawnSync('yarn', ['wrangler', 'd1', 'execute', 'DB', '--local', '--file', sqlPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'wrangler d1 execute failed').trim()
    throw new Error(`Could not provision the local MCP test user: ${detail}`)
  }
  console.log(`# Provisioned real local credentials for ${userId} (email and password not printed)`)
} finally {
  rmSync(directory, { recursive: true, force: true })
}
