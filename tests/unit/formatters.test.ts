import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { formatDate } from '../../utils/formatters.ts'

const formattersPath = fileURLToPath(new URL('../../utils/formatters.ts', import.meta.url))

// formatDate's timezone handling only diverges from the runner's own local
// timezone when that timezone isn't UTC, so both regression cases below run
// in a subprocess pinned to America/Los_Angeles (UTC-7 in July) rather than
// trusting whatever TZ the CI/dev machine happens to have.
function runInTimezone(expression: string, timeZone: string): string {
  const script = `
    const { formatDate } = await import(${JSON.stringify(formattersPath)});
    process.stdout.write(String(${expression}));
  `
  return execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', script], {
    env: { ...process.env, TZ: timeZone },
    encoding: 'utf8',
  })
}

test('formatDate: YYYY-MM-DD input preserves calendar date regardless of local timezone', () => {
  // A pure YYYY-MM-DD input is parsed as UTC midnight by the Date constructor.
  // The formatter must pass timeZone: 'UTC' so the output reflects the
  // calendar date that was written (Jul 25) rather than rolling back to the
  // previous day in a timezone west of UTC.
  const result = runInTimezone("formatDate('2026-07-25')", 'America/Los_Angeles')
  assert.equal(result, 'Jul 25, 2026')
})

test('formatDate: ISO datetime strings are formatted in local time (existing behaviour)', () => {
  // Full ISO strings already include offset information; the formatter must
  // NOT force UTC for them. In America/Los_Angeles (UTC-7 in July), midnight
  // UTC on 2026-07-25 is 5pm local on 2026-07-24 — the calendar date rolling
  // back a day is exactly what proves this input isn't forced to UTC.
  const result = runInTimezone("formatDate('2026-07-25T00:00:00Z')", 'America/Los_Angeles')
  assert.equal(result, 'Jul 24, 2026')
})

test('formatDate: null/empty returns em-dash', () => {
  assert.equal(formatDate(null), '—')
  assert.equal(formatDate(undefined), '—')
  assert.equal(formatDate(''), '—')
})

test('formatDate: invalid date string returns em-dash', () => {
  assert.equal(formatDate('not-a-date'), '—')
})
