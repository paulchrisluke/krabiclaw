import { createReadStream, createWriteStream, existsSync, readFileSync, renameSync, unlinkSync, chmodSync } from 'node:fs'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import Database from 'better-sqlite3'

const [, , command, ...args] = process.argv
const repoRoot = resolve(import.meta.dirname, '..')
const schemaSource = readFileSync(resolve(repoRoot, 'server/db/schema.ts'), 'utf8')
const applicationTables = [...schemaSource.matchAll(/sqliteTable\("([^"]+)"/g)].map(match => match[1]).sort()
const applicationTableSet = new Set(applicationTables)
const baselineSql = readFileSync(resolve(repoRoot, 'migrations/0000_epoch_2_baseline.sql'), 'utf8')
const rateLimitTrigger = baselineSql.match(/CREATE TRIGGER `trg_prune_rate_limits`[\s\S]*?\nEND;/)?.[0]
if (!rateLimitTrigger) throw new Error('Epoch-2 baseline is missing trg_prune_rate_limits')

function usage() {
  throw new Error([
    'Usage:',
    '  node scripts/epoch2-data.mjs prepare <d1-data-only-export.sql> <epoch2-data.sql>',
    '  node scripts/epoch2-data.mjs verify <epoch1.sqlite> <epoch2.sqlite>',
  ].join('\n'))
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}

function dependencyOrder() {
  const database = new Database(':memory:')
  try {
    database.exec(baselineSql)
    const dependencies = new Map(applicationTables.map(table => [
      table,
      new Set(database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all()
        .map(row => row.table)
        .filter(parent => parent !== table)),
    ]))
    const remaining = new Set(applicationTables)
    const ordered = []
    while (remaining.size) {
      const ready = [...remaining]
        .filter(table => [...dependencies.get(table)].every(parent => !remaining.has(parent)))
        .sort()
      if (!ready.length) {
        throw new Error(`Cannot produce a foreign-key-safe import order; cycle includes: ${[...remaining].sort().join(', ')}`)
      }
      for (const table of ready) {
        remaining.delete(table)
        ordered.push(table)
      }
    }
    return ordered
  } finally {
    database.close()
  }
}

async function prepare(inputArg, outputArg) {
  if (!inputArg || !outputArg) usage()
  const input = resolve(inputArg)
  const output = resolve(outputArg)
  const temporaryOutput = `${output}.tmp`
  if (existsSync(output) || existsSync(temporaryOutput)) {
    throw new Error(`Refusing to overwrite existing output: ${output}`)
  }

  const reader = createInterface({ input: createReadStream(input), crlfDelay: Infinity })
  const writer = createWriteStream(temporaryOutput, { mode: 0o600 })
  let copied = 0
  let skippedLedger = 0
  let skippedDerived = 0
  const rowsByTable = new Map(applicationTables.map(table => [table, []]))

  try {
    for await (const line of reader) {
      if (!line.trim()) continue
      if (line === 'PRAGMA defer_foreign_keys=TRUE;') {
        continue
      }

      const insert = line.match(/^INSERT INTO "([^"]+)" /)
      if (!insert) throw new Error(`Unexpected non-data statement in D1 export: ${line.slice(0, 80)}`)
      const table = insert[1]
      if (table === 'd1_migrations') {
        skippedLedger += 1
        continue
      }
      if (table === 'sqlite_sequence') {
        skippedDerived += 1
        continue
      }
      if (!applicationTableSet.has(table)) throw new Error(`Export contains unknown application table: ${table}`)

      rowsByTable.get(table).push(line)
      copied += 1
    }
    writer.write('PRAGMA defer_foreign_keys=TRUE;\n')
    writer.write('DROP TRIGGER IF EXISTS `trg_prune_rate_limits`;\n')
    for (const table of dependencyOrder()) {
      for (const line of rowsByTable.get(table)) writer.write(`${line}\n`)
    }
    writer.write(`${rateLimitTrigger}\n`)
    writer.end()
    await once(writer, 'finish')
    renameSync(temporaryOutput, output)
    chmodSync(output, 0o600)
  } catch (error) {
    writer.destroy()
    if (existsSync(temporaryOutput)) unlinkSync(temporaryOutput)
    throw error
  }

  console.log(JSON.stringify({ output, copiedRows: copied, skippedLedgerRows: skippedLedger, skippedDerivedRows: skippedDerived }))
}

function primaryKeyColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all()
    .filter(column => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map(column => column.name)
}

function primaryKeySet(database, table, columns) {
  const selection = columns.map(quoteIdentifier).join(', ')
  return new Set(database.prepare(`SELECT ${selection} FROM ${quoteIdentifier(table)}`).all().map(row => JSON.stringify(row)))
}

function verify(epoch1Arg, epoch2Arg) {
  if (!epoch1Arg || !epoch2Arg) usage()
  const epoch1 = new Database(resolve(epoch1Arg), { readonly: true, fileMustExist: true })
  const epoch2 = new Database(resolve(epoch2Arg), { readonly: true, fileMustExist: true })
  const failures = []

  try {
    for (const table of applicationTables) {
      const oldCount = epoch1.prepare(`SELECT count(*) AS count FROM ${quoteIdentifier(table)}`).get().count
      const newCount = epoch2.prepare(`SELECT count(*) AS count FROM ${quoteIdentifier(table)}`).get().count
      if (oldCount !== newCount) failures.push(`${table}: row count ${oldCount} -> ${newCount}`)

      const oldPrimaryKey = primaryKeyColumns(epoch1, table)
      const newPrimaryKey = primaryKeyColumns(epoch2, table)
      if (JSON.stringify(oldPrimaryKey) !== JSON.stringify(newPrimaryKey)) {
        failures.push(`${table}: primary key changed (${oldPrimaryKey.join(',')} -> ${newPrimaryKey.join(',')})`)
        continue
      }
      if (!oldPrimaryKey.length) {
        failures.push(`${table}: no primary key found`)
        continue
      }

      const oldIds = primaryKeySet(epoch1, table, oldPrimaryKey)
      const newIds = primaryKeySet(epoch2, table, newPrimaryKey)
      if (oldIds.size !== oldCount || newIds.size !== newCount) failures.push(`${table}: primary key is not distinct`)
      if (oldIds.size !== newIds.size || [...oldIds].some(id => !newIds.has(id))) failures.push(`${table}: primary key set differs`)
    }

    const oldForeignKeyFailures = epoch1.prepare('PRAGMA foreign_key_check').all().length
    const newForeignKeyFailures = epoch2.prepare('PRAGMA foreign_key_check').all().length
    if (oldForeignKeyFailures) failures.push(`epoch 1 has ${oldForeignKeyFailures} foreign-key violations`)
    if (newForeignKeyFailures) failures.push(`epoch 2 has ${newForeignKeyFailures} foreign-key violations`)

    if (failures.length) throw new Error(`Epoch-2 verification failed:\n${failures.join('\n')}`)
    console.log(JSON.stringify({ tables: applicationTables.length, foreignKeyFailures: 0, result: 'ok' }))
  } finally {
    epoch1.close()
    epoch2.close()
  }
}

if (command === 'prepare') await prepare(args[0], args[1])
else if (command === 'verify') verify(args[0], args[1])
else usage()
