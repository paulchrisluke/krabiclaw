import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeD1SeedSql, splitSqlStatements } from '../../scripts/utils/d1-seed-file.mjs'

test('normalizes oversized multi-row inserts without splitting quoted punctuation', () => {
  const sql = `INSERT INTO examples (id, content) VALUES
(1, 'semi; colon, comma'),
(2, 'it''s still one value ${'x'.repeat(70)}'),
(3, '${'y'.repeat(70)}');`

  const normalized = normalizeD1SeedSql(sql, 145)
  const statements = splitSqlStatements(normalized.sql)

  assert.ok(normalized.splitCount > 0)
  assert.equal(statements.length, normalized.splitCount + 1)
  assert.ok(statements.every(statement => Buffer.byteLength(statement, 'utf8') <= 145))
  assert.match(normalized.sql, /'semi; colon, comma'/)
  assert.match(normalized.sql, /'it''s still one value/)
  assert.equal((normalized.sql.match(/INSERT INTO examples/g) ?? []).length, statements.length)
})

test('rejects an oversized statement that cannot be safely chunked', () => {
  const sql = `UPDATE examples SET content = '${'x'.repeat(200)}';`

  assert.throws(() => normalizeD1SeedSql(sql, 100), /unsupported statement/)
})
