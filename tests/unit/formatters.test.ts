import test from 'node:test'
import assert from 'node:assert/strict'

import { formatDate } from '../../utils/formatters.ts'

test('formatDate: YYYY-MM-DD input preserves calendar date regardless of local timezone', () => {
  // A pure YYYY-MM-DD input is parsed as UTC midnight by the Date constructor.
  // The formatter must pass timeZone: 'UTC' so the output reflects the
  // calendar date that was written (e.g. Jul 25) rather than rolling back to
  // the previous day in timezones west of UTC (e.g. America/Los_Angeles).
  assert.equal(formatDate('2026-07-25'), 'Jul 25, 2026')
})

test('formatDate: ISO datetime strings are formatted in local time (existing behaviour)', () => {
  // Full ISO strings already include offset information; the formatter must
  // NOT force UTC for them, preserving pre-existing behaviour.
  const result = formatDate('2026-07-25T00:00:00Z')
  // Just assert it's not '—' (valid date) — local-time rendering varies per env.
  assert.notEqual(result, '—')
})

test('formatDate: null/empty returns em-dash', () => {
  assert.equal(formatDate(null), '—')
  assert.equal(formatDate(undefined), '—')
  assert.equal(formatDate(''), '—')
})

test('formatDate: invalid date string returns em-dash', () => {
  assert.equal(formatDate('not-a-date'), '—')
})
