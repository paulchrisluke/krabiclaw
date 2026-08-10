import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseRemoteMigrationRows, verifyMigrationPrefix, verifyMigrationState } from '../../scripts/verify-migration-state.mjs'

test('migration state verifier proves ordered filename set and local SQL hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'krabiclaw-migrations-'))
  try {
    await mkdir(join(root, 'migrations'))
    await writeFile(join(root, 'migrations', '0001_initial.sql'), 'create table one;\n')
    await writeFile(join(root, 'migrations', '0002_additive.sql'), 'alter table one add column two text;\n')

    const evidence = await verifyMigrationState({
      migrationsDir: join(root, 'migrations'),
      remoteJson: {
        result: [{
          results: [
            { id: 0, name: '0001_initial.sql', applied_at: '2026-08-08T00:00:00Z' },
            { id: 1, name: '0002_additive.sql', applied_at: '2026-08-08T00:01:00Z' },
          ],
        }],
      },
    })

    assert.equal(evidence.status, 'verified')
    assert.equal(evidence.exactSet, true)
    assert.equal(evidence.exactOrder, true)
    assert.deepEqual(evidence.local.files.map(file => file.name), ['0001_initial.sql', '0002_additive.sql'])
    assert.match(evidence.local.files[0].sha256, /^[0-9a-f]{64}$/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('migration state verifier accepts Wrangler d1 execute root-array JSON', async () => {
  const root = await mkdtemp(join(tmpdir(), 'krabiclaw-migrations-wrangler-json-'))
  try {
    await mkdir(join(root, 'migrations'))
    await writeFile(join(root, 'migrations', '0001_initial.sql'), 'one')

    const evidence = await verifyMigrationState({
      migrationsDir: join(root, 'migrations'),
      remoteJson: [
        {
          results: [{ id: 0, name: '0001_initial.sql' }],
          success: true,
        },
      ],
    })
    assert.equal(evidence.exactSet, true)
    assert.deepEqual(evidence.remote.rows.map(row => row.name), ['0001_initial.sql'])

    const emptyPrefix = await verifyMigrationPrefix({
      migrationsDir: join(root, 'migrations'),
      remoteJson: [{ results: [] }],
    })
    assert.deepEqual(emptyPrefix.remote.rows, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('migration state verifier rejects remote order and duplicate names', () => {
  assert.throws(() => parseRemoteMigrationRows({
    result: [{ results: [
      { id: 2, name: '0002_additive.sql' },
      { id: 1, name: '0002_additive.sql' },
    ] }],
  }), /duplicate filenames/)
  assert.throws(() => parseRemoteMigrationRows({
    result: [{ results: [
      { id: 1, name: '0001_initial.sql' },
      { id: 1, name: '0002_additive.sql' },
    ] }],
  }), /duplicate ids/)
})

test('migration state verifier proves a pre-apply remote history is an ordered local prefix', async () => {
  const root = await mkdtemp(join(tmpdir(), 'krabiclaw-migrations-prefix-'))
  try {
    await mkdir(join(root, 'migrations'))
    await writeFile(join(root, 'migrations', '0001_initial.sql'), 'one')
    await writeFile(join(root, 'migrations', '0002_additive.sql'), 'two')
    await writeFile(join(root, 'migrations', '0003_pending.sql'), 'three')
    const evidence = await verifyMigrationPrefix({
      migrationsDir: join(root, 'migrations'),
      remoteJson: { result: [{ results: [
        { id: 1, name: '0001_initial.sql' },
        { id: 2, name: '0002_additive.sql' },
      ] }] },
    })
    assert.equal(evidence.kind, 'pre-apply-prefix')
    assert.deepEqual(evidence.pending.files.map(file => file.name), ['0003_pending.sql'])

    const emptyHistory = await verifyMigrationPrefix({
      migrationsDir: join(root, 'migrations'),
      remoteJson: { result: [{ results: [] }] },
    })
    assert.equal(emptyHistory.remote.rows.length, 0)
    assert.deepEqual(emptyHistory.pending.files.map(file => file.name), ['0001_initial.sql', '0002_additive.sql', '0003_pending.sql'])

    await assert.rejects(
      () => verifyMigrationPrefix({
        migrationsDir: join(root, 'migrations'),
        remoteJson: { result: [{ results: [
          { id: 1, name: '0001_initial.sql' },
          { id: 2, name: '0002_additive.sql' },
          { id: 3, name: '0004_extra.sql' },
          { id: 4, name: '0005_extra.sql' },
        ] }] },
      }),
      /only 3 SQL files/,
    )

    await assert.rejects(
      () => verifyMigrationPrefix({
        migrationsDir: join(root, 'migrations'),
        remoteJson: { result: [{ results: [
          { id: 1, name: '0001_initial.sql' },
          { id: 3, name: '0002_additive.sql' },
        ] }] },
      }),
      /non-contiguous/,
    )
    await assert.rejects(
      () => verifyMigrationPrefix({
        migrationsDir: join(root, 'migrations'),
        remoteJson: { result: [{ results: [
          { id: 1, name: '0001_initial.sql' },
          { id: 2, name: '0003_pending.sql' },
        ] }] },
      }),
      /ordered local prefix/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('migration state verifier confines a historical exception before an explicit lineage marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'krabiclaw-migrations-lineage-'))
  try {
    await mkdir(join(root, 'migrations'))
    await writeFile(join(root, 'migrations', '0048_current.sql'), 'current history')
    await writeFile(join(root, 'migrations', '0108_reconcile.sql'), 'lineage marker')
    await writeFile(join(root, 'migrations', '0109_current.sql'), 'current lineage')
    await writeFile(join(root, 'migrations', '0110_current.sql'), 'current tip')

    const remoteJson = { result: [{ results: [
      { id: 48, name: '0048_legacy.sql' },
      { id: 57, name: '0108_reconcile.sql' },
      { id: 58, name: '0109_current.sql' },
      { id: 59, name: '0110_current.sql' },
    ] }] }
    const evidence = await verifyMigrationPrefix({
      migrationsDir: join(root, 'migrations'),
      remoteJson,
      lineageMarker: '0108_reconcile.sql',
    })

    assert.equal(evidence.kind, 'pre-apply-lineage-prefix')
    assert.equal(evidence.lineage.marker, '0108_reconcile.sql')
    assert.deepEqual(evidence.pending.files, [])

    await assert.rejects(
      () => verifyMigrationPrefix({
        migrationsDir: join(root, 'migrations'),
        remoteJson: { result: [{ results: [
          { id: 48, name: '0048_legacy.sql' },
          { id: 57, name: '0108_reconcile.sql' },
          { id: 58, name: '0109_current.sql' },
          { id: 59, name: '0110_foreign.sql' },
        ] }] },
        lineageMarker: '0108_reconcile.sql',
      }),
      /lineage is not an ordered local prefix/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
