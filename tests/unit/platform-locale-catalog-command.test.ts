import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

function runCatalogCheck(...args: string[]) {
  return spawnSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/check-platform-locale-catalog.ts',
    ...args,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

test('catalog check reports the approved Thai artifact without mutating live state', () => {
  const result = runCatalogCheck('--locale', 'th')

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Thai platform locale catalog is valid: 228 keys/)
  assert.match(result.stdout, /English manifest: b8dcca33f1698ae9244a7e0f9b2588b5f729329200a892829ed8e4ad3d8b89cb/)
  assert.match(result.stdout, /Catalog artifact: 042f2e88786228da4dbe8215aedec5c1089e9f912b5471e67728803fad1c5d86/)
})

test('catalog check fails clearly when the requested artifact is absent', () => {
  const result = runCatalogCheck('--locale', 'fr')

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Locale catalog artifact does not exist: i18n\/catalogs\/fr\.json/)
})
