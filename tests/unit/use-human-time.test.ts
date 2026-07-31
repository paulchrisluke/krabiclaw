import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatExactDateTime, formatRelativeTime } from '../../composables/useHumanTime.ts'

const REF = new Date('2026-07-25T12:00:00.000Z').getTime()

test('formatRelativeTime buckets: just now, minutes, hours, days, and beyond-30-days falls back to locale date', () => {
  assert.equal(formatRelativeTime(new Date(REF - 10_000).toISOString(), REF), 'just now')
  assert.equal(formatRelativeTime(new Date(REF - 5 * 60_000).toISOString(), REF), '5m ago')
  assert.equal(formatRelativeTime(new Date(REF - 3 * 3_600_000).toISOString(), REF), '3h ago')
  assert.equal(formatRelativeTime(new Date(REF - 10 * 86_400_000).toISOString(), REF), '10d ago')
  assert.notEqual(formatRelativeTime(new Date(REF - 45 * 86_400_000).toISOString(), REF), '45d ago')
})

test('formatRelativeTime boundary values sit in the correct bucket, not off-by-one', () => {
  assert.equal(formatRelativeTime(new Date(REF - 59_000).toISOString(), REF), 'just now')
  assert.equal(formatRelativeTime(new Date(REF - 60_000).toISOString(), REF), '1m ago')
  assert.equal(formatRelativeTime(new Date(REF - 59 * 60_000).toISOString(), REF), '59m ago')
  assert.equal(formatRelativeTime(new Date(REF - 60 * 60_000).toISOString(), REF), '1h ago')
  assert.equal(formatRelativeTime(new Date(REF - 23 * 3_600_000).toISOString(), REF), '23h ago')
  assert.equal(formatRelativeTime(new Date(REF - 24 * 3_600_000).toISOString(), REF), '1d ago')
  assert.equal(formatRelativeTime(new Date(REF - 29 * 86_400_000).toISOString(), REF), '29d ago')
})

test('formatRelativeTime handles invalid or missing timestamps gracefully', () => {
  assert.equal(formatRelativeTime(null), '—')
  assert.equal(formatRelativeTime(undefined), '—')
  assert.equal(formatRelativeTime('not-a-date'), '—')
  assert.equal(formatRelativeTime(''), '—')
})

test('formatExactDateTime renders a stable, locale-formatted date and handles invalid input', () => {
  const result = formatExactDateTime('2026-07-19T00:00:00.000Z')
  assert.match(result, /2026/)
  assert.match(result, /July|Jul/)
  assert.equal(formatExactDateTime('garbage'), '—')
  assert.equal(formatExactDateTime(null), '—')
})

test('formatExactDateTime can include time when requested', () => {
  const result = formatExactDateTime('2026-07-19T17:30:00.000Z', { includeTime: true, dateStyle: 'medium', timeStyle: 'short' })
  assert.match(result, /2026/)
})
