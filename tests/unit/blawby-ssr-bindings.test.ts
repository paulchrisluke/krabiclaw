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
  const file = 'composables/useBlawbyDocument.ts'
  const branches = splitBranches(read(file))
  assert.match(branches.server, /cloudflareEnv\(requestEvent\)\.db/, `${file} should use Cloudflare db binding directly`)
  assert.match(branches.server, /getPublicBlawbyDocumentData\(db, siteId/, `${file} should call the combined Blawby document service`)
  assert.doesNotMatch(branches.server, /\/api\/public\/sites\//, `${file} must not self-fetch Blawby public APIs during SSR`)
  assert.match(branches.client, /publicApiRequest/, `${file} should use the canonical client request wrapper`)
  assert.match(branches.client, /\/api\/public\/sites\/.*\/blawby\/document/, `${file} should use the combined public Blawby API`)
})

test('Blawby document API route uses the same combined source of truth as SSR', () => {
  const source = read('server/api/public/sites/[siteId]/blawby/document.get.ts')
  assert.match(source, /getPublicBlawbyDocumentData\(db, siteId/)
  assert.match(source, /hasPublicBlawbyRouteContent\(document\.route\)/)
  assert.doesNotMatch(source, /getPublicBlawbyShellData|getPublicBlawbyRouteData/)
})
