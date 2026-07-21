import { describe, it, expect } from 'vitest'
import { formatDate } from '../../utils/formatters'

describe('formatDate', () => {
  it('formats YYYY-MM-DD input preserving calendar date across timezones', () => {
    // A pure YYYY-MM-DD input is parsed as UTC midnight by the Date constructor.
    // When formatted with a timeZone of UTC, it will not shift to the previous day
    // regardless of the local timezone of the environment.
    expect(formatDate('2026-07-25')).toBe('Jul 25, 2026')
  })
})
