#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const RETIRED_DATABASE_IDS = new Set([
  '73d8e172-b7a0-45b3-b200-ae052de52e57',
  '3b5f3f59-0800-407a-837d-c9c306396c68',
])

const environment = process.argv[2]
if (!['staging', 'production'].includes(environment)) {
  throw new Error('Usage: check-database-epoch-binding.mjs <staging|production>')
}

const root = resolve(import.meta.dirname, '..')
const migrationNames = (await readdir(resolve(root, 'migrations')))
  .filter(name => /^0000_epoch_\d+_baseline\.sql$/u.test(name))
if (migrationNames.length !== 1) {
  throw new Error(`Expected one generated epoch baseline, found ${migrationNames.length}`)
}

const epoch = /^0000_epoch_(\d+)_baseline\.sql$/u.exec(migrationNames[0])?.[1]
if (!epoch) throw new Error('Could not read the database epoch from the generated baseline')

const source = await readFile(resolve(root, 'wrangler.toml'), 'utf8')
const header = environment === 'production' ? '[[d1_databases]]' : '[[env.staging.d1_databases]]'
const start = source.indexOf(header)
if (start === -1) throw new Error(`${environment} D1 binding is missing`)
const nextSection = source.slice(start + header.length).search(/\n\[/u)
const section = nextSection === -1
  ? source.slice(start)
  : source.slice(start, start + header.length + nextSection)
const databaseName = /^database_name\s*=\s*"([^"]+)"/mu.exec(section)?.[1]
const databaseId = /^database_id\s*=\s*"([^"]+)"/mu.exec(section)?.[1]

if (!databaseName?.endsWith(`-epoch${epoch}`)) {
  throw new Error(`${environment} must bind an Epoch ${epoch} database before deployment; found ${databaseName ?? 'no database name'}`)
}
if (!databaseId || RETIRED_DATABASE_IDS.has(databaseId)) {
  throw new Error(`${environment} still uses a retired database resource`)
}

console.log(`${environment} is bound to a distinct Epoch ${epoch} database resource.`)
