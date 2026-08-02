import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

function read(path: string) {
  return readFileSync(path, 'utf8')
}

function splitBranches(source: string) {
  const marker = 'if (import.meta.server)'
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, 'expected an import.meta.server branch')
  const clientRequest = source.indexOf('return await publicApiRequest', start)
  assert.notEqual(clientRequest, -1, 'expected the canonical client request after the server branch')
  return {
    server: source.slice(start, clientRequest),
    client: source.slice(clientRequest),
  }
}

test('Blawby SSR composables read public data directly instead of self-fetching API routes', () => {
  for (const file of [
    'composables/useBlawbyRoute.ts',
    'composables/useBlawbyShell.ts',
    'composables/useBlawbySite.ts',
  ]) {
    const branches = splitBranches(read(file))
    assert.match(branches.server, /cloudflareEnv\(requestEvent\)\.db/, `${file} should use Cloudflare db binding directly`)
    assert.match(branches.server, /getActiveBlawbySite\(db, siteId\)/, `${file} should call the shared Blawby site contract`)
    assert.doesNotMatch(branches.server, /\/api\/public\/sites\//, `${file} must not self-fetch Blawby public APIs during SSR`)
    assert.match(branches.client, /publicApiRequest/, `${file} should use the canonical client request wrapper`)
    assert.match(branches.client, /\/api\/public\/sites\//, `${file} should use the public Blawby API on the client`)
  }
})

test('Blawby public API routes use the same enabled-site source of truth as SSR', () => {
  for (const file of [
    'server/api/public/sites/[siteId]/blawby.get.ts',
    'server/api/public/sites/[siteId]/blawby/shell.get.ts',
    'server/api/public/sites/[siteId]/blawby/route.get.ts',
  ]) {
    assert.match(read(file), /getActiveBlawbySite\(db, siteId\)/, `${file} should call getActiveBlawbySite`)
  }
})
