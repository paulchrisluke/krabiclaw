import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSql = readFileSync('migrations/0033_faulty_mariko_yashida.sql', 'utf8')
const billingSource = readFileSync('server/utils/billing.ts', 'utf8')

test('review request migration creates canonical request and media tables', () => {
  assert.match(migrationSql, /CREATE TABLE `review_requests`/)
  assert.match(migrationSql, /`token_hash` text NOT NULL/)
  assert.match(migrationSql, /CREATE UNIQUE INDEX `idx_review_requests_active_booking_unique`/)
  assert.match(migrationSql, /CREATE TABLE `review_media`/)
  assert.match(migrationSql, /CONSTRAINT "review_media_status_check"/)
})

test('review request migration extends bookings, reviews, and locations', () => {
  assert.match(migrationSql, /ALTER TABLE `business_locations` ADD `google_review_url` text/)
  assert.match(migrationSql, /`completed_at` text/)
  assert.match(migrationSql, /`review_request_sent_at` text/)
  assert.match(migrationSql, /`review_submitted_at` text/)
  assert.match(migrationSql, /`review_request_id` text/)
  assert.match(migrationSql, /`helpful_count` integer DEFAULT 0/)
})

test('review request entitlement follows paid plan policy', () => {
  assert.match(billingSource, /review_requests: false/)
  assert.match(billingSource, /case 'growth':\s*return \{[^}]*review_requests: true/s)
  assert.match(billingSource, /case 'managed':\s*return \{[^}]*review_requests: true/s)
  assert.match(billingSource, /case 'seo_accelerator':\s*return \{[^}]*review_requests: true/s)
})
