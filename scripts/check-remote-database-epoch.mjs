#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const environment = process.argv[2]
if (!['staging', 'production'].includes(environment)) {
  throw new Error('Usage: check-remote-database-epoch.mjs <staging|production>')
}

const wrangler = resolve(import.meta.dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const command = `
  SELECT
    (SELECT COUNT(*) FROM sites) AS site_count,
    (SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name IN (
      'guest_thread_commands',
      'guest_thread_member_state',
      'guest_thread_outbox',
      'guest_thread_sequence_counters',
      'notification_deliveries',
      'notification_events'
    )) AS retired_table_count,
    (SELECT COUNT(*) FROM pragma_table_info('guest_thread_entries') WHERE name = 'dedupe_key') AS entry_shape,
    (SELECT COUNT(*) FROM pragma_table_info('notifications') WHERE name = 'source_entry_id') AS notification_shape,
    (SELECT COUNT(*) FROM pragma_table_info('notifications') WHERE name = 'channel') AS retired_notification_shape
`
const args = [wrangler, 'd1', 'execute', 'DB']
if (environment === 'staging') args.push('--env', 'staging')
args.push('--remote', '--json', '--command', command)

const output = execFileSync(process.execPath, args, {
  cwd: resolve(import.meta.dirname, '..'),
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'inherit'],
})
const result = JSON.parse(output)?.[0]
const row = result?.success ? result.results?.[0] : null
if (!row) throw new Error(`Could not inspect the ${environment} database`)
if (row.site_count < 1) throw new Error(`${environment} has no imported site data`)
if (row.retired_table_count !== 0) throw new Error(`${environment} still contains retired messaging tables`)
if (row.entry_shape !== 1 || row.notification_shape !== 1 || row.retired_notification_shape !== 0) {
  throw new Error(`${environment} does not have the canonical Epoch 5 messaging schema`)
}

console.log(`${environment} Epoch 5 database is baselined and contains imported site data.`)
