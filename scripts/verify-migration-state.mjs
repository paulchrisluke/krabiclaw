#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SQL_FILE_PATTERN = /^\d{4}_.+\.sql$/

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function localMigrationFiles(migrationsDir) {
  const names = (await readdir(migrationsDir)).filter(name => SQL_FILE_PATTERN.test(name)).sort()
  return Promise.all(names.map(async (name, index) => ({
    order: index,
    name,
    sha256: sha256(await readFile(resolve(migrationsDir, name))),
  })))
}

function candidateRemoteRows(value) {
  const isRowArray = candidate => Array.isArray(candidate)
    && candidate.every(row => row && typeof row === 'object' && !Array.isArray(row))

  // `wrangler d1 execute --json` returns an array of command-result objects
  // (`[{ results: [...] }]`) for both local and remote execution.  Keep the
  // wrapper handling explicit so a result object is never mistaken for a
  // migration row, while still accepting the API-shaped variants emitted by
  // different Wrangler versions.
  if (Array.isArray(value)) {
    const resultArrays = value
      .map(entry => entry?.results)
      .filter(candidate => Array.isArray(candidate))
    if (resultArrays.length > 0) {
      const rows = resultArrays.flat()
      if (isRowArray(rows)) return rows
    }
  }

  const candidates = [
    value?.result?.[0]?.results,
    value?.results,
    value?.result,
  ]
  for (const candidate of candidates) {
    if (isRowArray(candidate)) return candidate
  }
  throw new Error('Remote D1 migration JSON did not contain a results array')
}

export function parseRemoteMigrationRows(value) {
  const rows = candidateRemoteRows(value).map((row, index) => {
    const id = Number(row.id)
    if (!Number.isInteger(id) || id < 0) throw new Error(`Remote migration row ${index} has an invalid numeric id`)
    if (typeof row.name !== 'string' || !SQL_FILE_PATTERN.test(row.name)) {
      throw new Error(`Remote migration row ${index} has an invalid SQL filename`)
    }
    return { id, name: row.name, appliedAt: row.applied_at ?? row.appliedAt ?? null }
  })
  const ids = new Set(rows.map(row => row.id))
  const names = new Set(rows.map(row => row.name))
  if (ids.size !== rows.length) throw new Error('Remote D1 migration state contains duplicate ids')
  if (names.size !== rows.length) throw new Error('Remote D1 migration state contains duplicate filenames')
  const sorted = rows.toSorted((a, b) => a.id - b.id)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].id !== sorted[index - 1].id + 1) {
      throw new Error(`Remote D1 migration ids are non-contiguous between ${sorted[index - 1].id} and ${sorted[index].id}`)
    }
  }
  return sorted
}

export async function verifyMigrationPrefix({ migrationsDir, remoteJson }) {
  const local = await localMigrationFiles(migrationsDir)
  const remote = parseRemoteMigrationRows(remoteJson)
  const localNames = local.map(row => row.name)
  const remoteNames = remote.map(row => row.name)
  if (remoteNames.length > localNames.length) {
    throw new Error(`Remote migration history has ${remoteNames.length} rows but checkout has only ${localNames.length} SQL files`)
  }
  const mismatch = remoteNames.findIndex((name, index) => name !== localNames[index])
  if (mismatch >= 0) {
    throw new Error(`Remote migration history is not an ordered local prefix at position ${mismatch}: local ${localNames[mismatch]}, remote ${remoteNames[mismatch]}`)
  }
  return {
    schemaVersion: 1,
    status: 'verified',
    kind: 'pre-apply-prefix',
    exactPrefix: true,
    local: { migrationsDir: resolve(migrationsDir), files: local },
    remote: { rows: remote },
    pending: { files: local.slice(remote.length) },
  }
}

export async function verifyMigrationState({ migrationsDir, remoteJson }) {
  const evidence = await verifyMigrationPrefix({ migrationsDir, remoteJson })
  const localNames = evidence.local.files.map(row => row.name)
  const remoteNames = evidence.remote.rows.map(row => row.name)
  if (localNames.length !== remoteNames.length) {
    throw new Error(`Migration filename count differs: local ${localNames.length}, remote ${remoteNames.length}`)
  }
  return {
    schemaVersion: 1,
    status: 'verified',
    kind: 'post-apply-exact-state',
    exactSet: true,
    exactOrder: true,
    local: evidence.local,
    remote: evidence.remote,
    pending: { files: [] },
  }
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

async function main(argv = process.argv.slice(2)) {
  let migrationsDir = resolve('migrations')
  let remotePath
  let outputPath
  let preApply = false
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--migrations-dir') {
      migrationsDir = resolve(requiredValue(argv, index, option)); index += 1
    } else if (option === '--remote-json') {
      remotePath = resolve(requiredValue(argv, index, option)); index += 1
    } else if (option === '--output') {
      outputPath = resolve(requiredValue(argv, index, option)); index += 1
    } else if (option === '--pre-apply') {
      preApply = true
    } else if (option === '--help' || option === '-h') {
      console.log('Usage: node scripts/verify-migration-state.mjs --remote-json FILE [--migrations-dir DIR] [--pre-apply] [--output FILE]')
      return
    } else {
      throw new Error(`Unknown option: ${option}`)
    }
  }
  if (!remotePath) throw new Error('--remote-json is required')
  const input = { migrationsDir, remoteJson: JSON.parse(await readFile(remotePath, 'utf8')) }
  const evidence = preApply ? await verifyMigrationPrefix(input) : await verifyMigrationState(input)
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
