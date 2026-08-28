import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isValidTimeZone,
  localDateBounds,
  parseAnalyticsRange,
} from '../../server/utils/analytics-calendar.ts'

test('reporting timezone accepts IANA zones and explicitly supports UTC fallback validation', () => {
  assert.equal(isValidTimeZone('Asia/Bangkok'), true)
  assert.equal(isValidTimeZone('UTC'), true)
  assert.equal(isValidTimeZone('Not/A-Timezone'), false)
})

test('default report range contains exactly 30 inclusive local dates', () => {
  const range = parseAnalyticsRange({ timeZone: 'Asia/Bangkok', now: new Date('2026-08-27T20:00:00Z') })
  assert.equal(range.endDate, '2026-08-28')
  assert.equal(range.startDate, '2026-07-30')
  assert.equal(range.dates.length, 30)
  assert.equal(range.previousStartDate, '2026-06-30')
  assert.equal(range.previousEndDate, '2026-07-29')
})

test('report range accepts 365 dates and rejects 366', () => {
  assert.equal(parseAnalyticsRange({
    startDate: '2025-01-01', endDate: '2025-12-31', timeZone: 'UTC', now: new Date(),
  }).dates.length, 365)
  assert.throws(() => parseAnalyticsRange({
    startDate: '2024-01-01', endDate: '2024-12-31', timeZone: 'UTC', now: new Date(),
  }), /365-day maximum/)
})

test('DST boundaries produce 23-hour and 25-hour local days', () => {
  assert.deepEqual(localDateBounds('2026-03-08', 'America/Chicago'), {
    start: '2026-03-08T06:00:00.000Z',
    end: '2026-03-09T05:00:00.000Z',
  })
  assert.deepEqual(localDateBounds('2026-11-01', 'America/Chicago'), {
    start: '2026-11-01T05:00:00.000Z',
    end: '2026-11-02T06:00:00.000Z',
  })
})
