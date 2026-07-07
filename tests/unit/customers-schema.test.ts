import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSql = readFileSync('migrations/0032_goofy_aqueduct.sql', 'utf8')
const postSlugIndexMigrationSql = readFileSync('migrations/0036_tough_glorian.sql', 'utf8')

test('customers migration creates site-scoped customer identity table', () => {
  assert.match(migrationSql, /CREATE TABLE `customers`/)
  assert.match(migrationSql, /`organization_id` text NOT NULL/)
  assert.match(migrationSql, /`site_id` text NOT NULL/)
  assert.match(migrationSql, /`user_id` text/)
  assert.match(migrationSql, /`stripe_customer_id` text/)
  assert.match(migrationSql, /`review_request_opted_out_at` text/)
  assert.match(migrationSql, /CONSTRAINT "customers_source_check"/)
  assert.match(migrationSql, /CONSTRAINT "customers_status_check"/)
})

test('customers migration links booking tables to customers', () => {
  assert.match(migrationSql, /ALTER TABLE `experience_bookings` ADD `customer_id` text REFERENCES customers\(id\)/)
  assert.match(migrationSql, /ALTER TABLE `reservation_submissions` ADD `customer_id` text REFERENCES customers\(id\)/)
})

test('customers migration adds Better Auth anonymous support', () => {
  assert.match(migrationSql, /ALTER TABLE `user` ADD `isAnonymous` integer DEFAULT 0 NOT NULL/)
})

test('post slug index migration deduplicates existing slugs before recreating unique index', () => {
  assert.match(postSlugIndexMigrationSql, /WITH duplicate_post_slugs AS/)
  assert.match(postSlugIndexMigrationSql, /ROW_NUMBER\(\) OVER \(PARTITION BY site_id, slug/)
  assert.match(postSlugIndexMigrationSql, /UPDATE posts/)
  assert.match(postSlugIndexMigrationSql, /CREATE UNIQUE INDEX `posts_site_slug_idx`/)
})
