import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function serverBranch(source: string) {
  const marker = 'if (import.meta.server)'
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, 'expected an import.meta.server branch')
  const clientFetch = source.indexOf('$fetch', start)
  assert.notEqual(clientFetch, -1, 'expected client-side fetch after the server branch')
  return source.slice(start, clientFetch)
}

test('Blawby SSR composables read public data directly instead of self-fetching API routes', () => {
  for (const file of [
    'composables/useBlawbyRoute.ts',
    'composables/useBlawbyShell.ts',
    'composables/useBlawbySite.ts',
  ]) {
    const branch = serverBranch(read(file))
    assert.match(branch, /cloudflareEnv\(requestEvent\)\.db/, `${file} should use Cloudflare db binding directly`)
    assert.match(branch, /getActiveBlawbySite/, `${file} should share the public Blawby site contract`)
    assert.doesNotMatch(branch, /\/api\/public\/sites\/\$\{siteId\}\/blawby/, `${file} must not self-fetch Blawby public APIs during SSR`)
  }
})

test('Blawby public API routes use the same enabled-site source of truth as SSR', () => {
  for (const file of [
    'server/api/public/sites/[siteId]/blawby.get.ts',
    'server/api/public/sites/[siteId]/blawby/shell.get.ts',
    'server/api/public/sites/[siteId]/blawby/route.get.ts',
  ]) {
    assert.match(read(file), /getActiveBlawbySite/, `${file} should use getActiveBlawbySite`)
  }
})
