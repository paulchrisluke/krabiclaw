import assert from 'node:assert/strict'
import test from 'node:test'

import { checkDynamicSqlListBindings } from '../../scripts/lib/data-loading-guardrails.mjs'

test('dynamic SQL list guard rejects variable placeholder IN clauses', () => {
  const source = "const rows = await queryAll(db, `SELECT * FROM items WHERE id IN (${ids.map(() => '?').join(', ')})`, ids)"
  assert.equal(checkDynamicSqlListBindings('server/example.ts', source).length, 1)
})

test('dynamic SQL list guard permits one json_each JSON bind', () => {
  const source = "const rows = await queryAll(db, 'SELECT * FROM items WHERE id IN (SELECT value FROM json_each(?))', [d1JsonStringSet(ids)])"
  assert.deepEqual(checkDynamicSqlListBindings('server/example.ts', source), [])
})

test('dynamic SQL list guard does not flag fixed-column insert rows', () => {
  const source = "const placeholders = values.map(() => '?').join(', '); await execute(db, `INSERT INTO items VALUES (${placeholders})`, values)"
  assert.deepEqual(checkDynamicSqlListBindings('server/example.ts', source), [])
})

test('dynamic SQL list guard does not flag a safe IN clause followed by an unrelated .map() elsewhere', () => {
  const source = "await queryAll(db, `SELECT * FROM items WHERE id IN (${idPlaceholder}) AND kind = ?`, [idPlaceholder, kind]); const labels = kinds.map(k => k.label)"
  assert.deepEqual(checkDynamicSqlListBindings('server/example.ts', source), [])
})
