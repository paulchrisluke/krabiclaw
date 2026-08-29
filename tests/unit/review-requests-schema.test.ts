import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const baselineSql = readFileSync('migrations/0000_epoch_2_baseline.sql', 'utf8')
const billingSource = readFileSync('server/utils/billing-entitlements.ts', 'utf8')

test('epoch-2 baseline creates the canonical review request schema', () => {
  assert.match(baselineSql, /CREATE TABLE `review_requests`/)
  assert.match(baselineSql, /`token_hash` text NOT NULL/)
  assert.match(baselineSql, /CREATE UNIQUE INDEX `idx_review_requests_active_booking_unique`/)
})

test('epoch-2 baseline includes the complete review request domain', () => {
  assert.match(baselineSql, /`google_review_url` text/)
  assert.match(baselineSql, /`completed_at` text/)
  assert.match(baselineSql, /`review_request_sent_at` text/)
  assert.match(baselineSql, /`review_submitted_at` text/)
  assert.match(baselineSql, /`review_request_id` text/)
  assert.match(baselineSql, /`helpful_count` integer DEFAULT 0/)
})

test('review request entitlement follows paid plan policy', () => {
  assert.match(billingSource, /review_requests: false/)
  assert.match(billingSource, /case 'growth':\s*return \{[^}]*review_requests: true/s)
  assert.doesNotMatch(billingSource, /case 'managed':/)
  assert.doesNotMatch(billingSource, /case 'seo_accelerator':/)
})
