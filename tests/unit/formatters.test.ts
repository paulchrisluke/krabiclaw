import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

import { formatDate } from '../../utils/formatters.ts'

// Kept as a file: URL string (not converted via fileURLToPath) — a plain OS
// path is not a valid import specifier on every platform (Windows drive
// paths, or any path containing URL-significant characters), while a file:
// URL always is.
const formattersUrl = new URL('../../utils/formatters.ts', import.meta.url).href

// formatDate's timezone handling only diverges from the runner's own local
// timezone when that timezone isn't UTC, so both regression cases below run
// in a subprocess pinned to America/Los_Angeles (UTC-7 in July) rather than
// trusting whatever TZ the CI/dev machine happens to have.
function runInTimezone(expression: string, timeZone: string): string {
  const script = `
    const { formatDate } = await import(${JSON.stringify(formattersUrl)});
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

test('formatDate: ISO datetime strings are also formatted in UTC, not the runtime local timezone', () => {
  // formatDate is used on SSR'd public pages (e.g. reviews/[reviewId].vue,
  // reservations/confirmed.vue) — the server always runs in UTC (Cloudflare
  // Workers) while the client hydrates in the visitor's own timezone. Any
  // divergence in the rendered calendar date between those two renders is a
  // Vue hydration mismatch, not just a formatting preference, so both
  // date-only and full-ISO inputs must format in UTC unconditionally.
  const result = runInTimezone("formatDate('2026-07-25T00:00:00Z')", 'America/Los_Angeles')
  assert.equal(result, 'Jul 25, 2026')
})

test('formatDate: null/empty returns em-dash', () => {
  assert.equal(formatDate(null), '—')
  assert.equal(formatDate(undefined), '—')
  assert.equal(formatDate(''), '—')
})

test('formatDate: invalid date string returns em-dash', () => {
  assert.equal(formatDate('not-a-date'), '—')
})
