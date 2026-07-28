import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// The safety checker is intentionally plain JavaScript so migration commands can run without a build step.
import { findUnsafeMigrationStatements } from '../../scripts/check-migration-safety.mjs'

describe('migration safety', () => {
  it('blocks rebuilding a protected parent table', () => {
    assert.deepEqual(findUnsafeMigrationStatements('0072_bad.sql', 'DROP TABLE `media_assets`;'), [
      'DROP TABLE media_assets can clear or cascade-delete referencing production data',
    ])
  })

  it('blocks experience and location parent table rebuilds', () => {
    assert.deepEqual(findUnsafeMigrationStatements('0073_bad.sql', 'DROP TABLE `business_locations`; DROP TABLE `experiences`;'), [
      'DROP TABLE business_locations can clear or cascade-delete referencing production data',
      'DROP TABLE experiences can clear or cascade-delete referencing production data',
    ])
  })

  it('allows non-destructive trigger migrations', () => {
    assert.deepEqual(findUnsafeMigrationStatements('0072_safe.sql', 'CREATE TRIGGER media_guard BEFORE INSERT ON media_assets BEGIN SELECT 1; END;'), [])
  })

  it('does not retroactively fail immutable migration history', () => {
    assert.deepEqual(findUnsafeMigrationStatements('0049_old.sql', 'DROP TABLE `media_assets`;'), [])
    assert.deepEqual(findUnsafeMigrationStatements('0047_free_molecule_man.sql', 'DROP TABLE `media_assets`;'), [])
  })
})
