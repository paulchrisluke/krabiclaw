import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
// The safety checker is intentionally plain JavaScript so migration commands can run without a build step.
import { findUnsafeMigrationStatements } from '../../scripts/check-migration-safety.mjs'

describe('migration safety', () => {
  it('blocks rebuilding a protected parent table', () => {
    assert.deepEqual(findUnsafeMigrationStatements('0072_bad.sql', 'DROP TABLE `media_assets`;'), [
      'DROP TABLE media_assets must be a bounded rebuild with backup, restore, count assertion, foreign_key_check, and post-assert backup cleanup',
    ])
  })

  it('blocks experience and location parent table rebuilds', () => {
    assert.deepEqual(findUnsafeMigrationStatements('0073_bad.sql', 'DROP TABLE `business_locations`; DROP TABLE `experiences`;'), [
      'DROP TABLE business_locations must be a bounded rebuild with backup, restore, count assertion, foreign_key_check, and post-assert backup cleanup',
      'DROP TABLE experiences must be a bounded rebuild with backup, restore, count assertion, foreign_key_check, and post-assert backup cleanup',
    ])
  })

  it('allows a bounded protected parent rebuild with loud validation', () => {
    const sql = `
      CREATE TABLE __um_backup_experiences AS SELECT * FROM experiences;
      CREATE TABLE __new_experiences (id text primary key);
      INSERT INTO __new_experiences SELECT * FROM __um_backup_experiences;
      DROP TABLE experiences;
      ALTER TABLE __new_experiences RENAME TO experiences;
      CREATE TABLE __um_assert_0072 (violation text not null check (violation = ''));
      INSERT INTO __um_assert_0072 (violation)
      SELECT 'experiences_backup_count_mismatch'
      WHERE (SELECT COUNT(*) FROM __um_backup_experiences) != (SELECT COUNT(*) FROM experiences);
      INSERT INTO __um_assert_0072 (violation)
      SELECT 'fk failed'
      WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check);
      DROP TABLE __um_assert_0072;
      DROP TABLE __um_backup_experiences;
    `
    assert.deepEqual(findUnsafeMigrationStatements('0072_bounded.sql', sql), [])
  })

  it('blocks silent row discard restores', () => {
    assert.deepEqual(findUnsafeMigrationStatements('0072_bad.sql', 'INSERT OR IGNORE INTO child SELECT * FROM backup;'), [
      'INSERT OR IGNORE can silently discard rows during a migration',
    ])
  })

  it('does not let markers from another migration make an isolated drop look safe', () => {
    const priorMigrationMarkers = `
      CREATE TABLE __um_backup_business_locations AS SELECT * FROM business_locations;
      CREATE TABLE __new_business_locations (id text primary key);
      INSERT INTO __new_business_locations SELECT * FROM __um_backup_business_locations;
      CREATE TABLE __um_assert_0078 (violation text not null check (violation = ''));
      SELECT 'business_locations_backup_count_mismatch'
      WHERE (SELECT COUNT(*) FROM __um_backup_business_locations) != (SELECT COUNT(*) FROM business_locations);
      SELECT 1 FROM pragma_foreign_key_check;
      DROP TABLE __um_assert_0078;
      DROP TABLE __um_backup_business_locations;
    `
    assert.deepEqual(findUnsafeMigrationStatements('0082_bad.sql', 'DROP TABLE business_locations;', priorMigrationMarkers), [
      'DROP TABLE business_locations must be a bounded rebuild with backup, restore, count assertion, foreign_key_check, and post-assert backup cleanup',
    ])
  })

  it('allows split rebuild migrations only when sibling assertions and cleanup exist', () => {
    const rebuildSql = `
      CREATE TABLE __new_business_locations (id text primary key);
      INSERT INTO __new_business_locations SELECT * FROM __um_backup_business_locations;
      DROP TABLE business_locations;
      ALTER TABLE __new_business_locations RENAME TO business_locations;
    `
    const prepareMarkers = `
      CREATE TABLE __um_backup_business_locations AS SELECT * FROM business_locations;
    `
    const assertionMarkers = `
      CREATE TABLE __um_assert_0080 (violation text not null check (violation = ''));
      INSERT INTO __um_assert_0080 (violation)
      SELECT 'business_locations_backup_count_mismatch'
      WHERE (SELECT COUNT(*) FROM __um_backup_business_locations) != (SELECT COUNT(*) FROM business_locations);
      INSERT INTO __um_assert_0080 (violation)
      SELECT 'fk failed'
      WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check);
      DROP TABLE __um_assert_0080;
      DROP TABLE __um_backup_business_locations;
    `
    assert.deepEqual(findUnsafeMigrationStatements('0079_split.sql', rebuildSql, `${prepareMarkers}\n${rebuildSql}\n${assertionMarkers}`), [])
  })

  it('blocks split rebuild migrations without a sibling count assertion', () => {
    const rebuildSql = `
      CREATE TABLE __new_business_locations (id text primary key);
      INSERT INTO __new_business_locations SELECT * FROM __um_backup_business_locations;
      DROP TABLE business_locations;
      ALTER TABLE __new_business_locations RENAME TO business_locations;
    `
    const siblingMarkers = `
      CREATE TABLE __um_backup_business_locations AS SELECT * FROM business_locations;
      CREATE TABLE __um_assert_0080 (violation text not null check (violation = ''));
      INSERT INTO __um_assert_0080 (violation)
      SELECT 'fk failed'
      WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check);
      DROP TABLE __um_assert_0080;
      DROP TABLE __um_backup_business_locations;
    `
    assert.deepEqual(findUnsafeMigrationStatements('0079_split.sql', rebuildSql, `${siblingMarkers}\n${rebuildSql}`), [
      'DROP TABLE business_locations must be a bounded rebuild with backup, restore, count assertion, foreign_key_check, and post-assert backup cleanup',
    ])
  })

  it('does not let a later rebuild borrow assertions from an earlier identical drop', () => {
    const validatedRebuild = `
      CREATE TABLE __um_backup_business_locations AS SELECT * FROM business_locations;
      CREATE TABLE __new_business_locations (id text primary key);
      INSERT INTO __new_business_locations SELECT * FROM __um_backup_business_locations;
      DROP TABLE business_locations;
      ALTER TABLE __new_business_locations RENAME TO business_locations;
      CREATE TABLE __um_assert_0078 (violation text not null check (violation = ''));
      INSERT INTO __um_assert_0078 (violation)
      SELECT 'business_locations_backup_count_mismatch'
      WHERE (SELECT COUNT(*) FROM __um_backup_business_locations) != (SELECT COUNT(*) FROM business_locations);
      INSERT INTO __um_assert_0078 (violation)
      SELECT 'fk failed'
      WHERE EXISTS (SELECT 1 FROM pragma_foreign_key_check);
      DROP TABLE __um_assert_0078;
      DROP TABLE __um_backup_business_locations;
    `
    const unvalidatedRebuild = `
      CREATE TABLE __um_backup_business_locations AS SELECT * FROM business_locations;
      CREATE TABLE __new_business_locations (id text primary key);
      INSERT INTO __new_business_locations SELECT * FROM __um_backup_business_locations;
      DROP TABLE business_locations;
      ALTER TABLE __new_business_locations RENAME TO business_locations;
      DROP TABLE __um_backup_business_locations;
    `

    assert.deepEqual(
      findUnsafeMigrationStatements(
        '0110_unvalidated.sql',
        unvalidatedRebuild,
        `${validatedRebuild}\n${unvalidatedRebuild}`,
      ),
      [
        'DROP TABLE business_locations must be a bounded rebuild with backup, restore, count assertion, foreign_key_check, and post-assert backup cleanup',
      ],
    )
  })

  it('allows non-destructive trigger migrations', () => {
    assert.deepEqual(findUnsafeMigrationStatements('0072_safe.sql', 'CREATE TRIGGER media_guard BEFORE INSERT ON media_assets BEGIN SELECT 1; END;'), [])
  })

  it('does not retroactively fail immutable migration history', () => {
    assert.deepEqual(findUnsafeMigrationStatements('0049_old.sql', 'DROP TABLE `media_assets`;'), [])
    assert.deepEqual(findUnsafeMigrationStatements('0047_free_molecule_man.sql', 'DROP TABLE `media_assets`;'), [])
  })
})
