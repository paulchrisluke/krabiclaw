import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeGoogleOpeningHours } from '../../shared/reservation-hours.ts'

test('Google hours preserve unknown hours and every supplied opening period', () => {
  assert.equal(normalizeGoogleOpeningHours(undefined), null)
  assert.equal(normalizeGoogleOpeningHours(null), null)
  assert.deepEqual(normalizeGoogleOpeningHours([]), { periods: [] })
  const periods = [
    { open: { day: 1, hour: 9, minute: 15 }, close: { day: 1, hour: 12, minute: 30 } },
    { open: { day: 1, hour: 17, minute: 0 }, close: { day: 2, hour: 1, minute: 45 } },
  ]
  assert.deepEqual(normalizeGoogleOpeningHours(periods), { periods })
})
