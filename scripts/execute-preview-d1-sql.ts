#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unstable_splitSqlQuery as splitSqlQuery } from 'wrangler'

const ROOT = resolve(import.meta.dirname, '..')
const WRANGLER_BIN = resolve(ROOT, 'node_modules/.bin/wrangler')
const MAX_BATCH_BYTES = 75_000
const MAX_BATCH_STATEMENTS = 50
const MAX_STATEMENT_BYTES = 100_000

export function batchSql(sql: string) {
  const statements = splitSqlQuery(sql)
  const batches: string[] = []
  let pending: string[] = []
  let pendingBytes = 0

  for (const statement of statements) {
    const normalizedStatement = statement.replace(/;\s*$/, '')
    const statementBytes = Buffer.byteLength(normalizedStatement)
    if (statementBytes > MAX_STATEMENT_BYTES) {
      throw new Error(`SQL statement exceeds D1's 100 KB limit (${statementBytes} bytes)`)
    }

    const separatorBytes = pending.length ? 2 : 0
    if (pending.length && (
      pending.length >= MAX_BATCH_STATEMENTS
      || pendingBytes + separatorBytes + statementBytes > MAX_BATCH_BYTES
    )) {
      batches.push(`${pending.join(';\n')};`)
      pending = []
      pendingBytes = 0
    }

    pending.push(normalizedStatement)
    pendingBytes += (pending.length > 1 ? 2 : 0) + statementBytes
  }

  if (pending.length) batches.push(`${pending.join(';\n')};`)
  return batches
}

function executeFile(path: string) {
  const sql = readFileSync(path, 'utf8')
  const batches = batchSql(sql)
  for (const [index, batch] of batches.entries()) {
    console.log(`Executing ${path} batch ${index + 1}/${batches.length}`)
    execFileSync(WRANGLER_BIN, [
      'd1', 'execute', 'DB',
      '--env', 'preview',
      '--remote',
      '--command', batch,
    ], {
      cwd: ROOT,
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: resolve(tmpdir(), 'krabiclaw-wrangler-logs'),
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    })
  }
}

function main() {
  const paths = process.argv.slice(2)
  if (!paths.length) throw new Error('Provide at least one SQL file')
  for (const path of paths) executeFile(resolve(path))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
