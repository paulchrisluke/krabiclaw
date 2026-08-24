import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { findProductModelViolations } from '../../scripts/check-product-model-guard.mjs'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('publication editors expose only the final lifecycle controls', () => {
  const posts = read('pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/posts.vue')
  assert.match(posts, /\{ value: 'published', label: 'Live' \}/)
  assert.match(posts, /\{ value: 'scheduled', label: 'Scheduled' \}/)
  assert.doesNotMatch(posts, /value: '(?:draft|archived)'/)

  const services = read('pages/dashboard/[orgSlug]/sites/[siteSlug]/professional-services.vue')
  assert.match(services, /onMounted\(load\)/)
  assert.doesNotMatch(services, /label="Status"|offering\.status/)

  const docEditor = read('pages/admin/docs/[docId].vue')
  assert.equal(docEditor.match(/onMounted\(loadDoc\)/g)?.length, 1)
  assert.match(docEditor, /Save live changes/)
  assert.doesNotMatch(docEditor, />\s*Unpublish\s*</)

  const blogEditor = read('lib/components/workspace/blog/BlogPostEditor.vue')
  assert.match(blogEditor, /v-if="!post \|\| post\.status === 'scheduled'" label="Publish timing"/)

  const newDoc = read('pages/admin/docs/new.vue')
  assert.match(newDoc, />\s*Publish\s*</)
  assert.doesNotMatch(newDoc, /Save draft/)
})

test('publication guard covers MCP directory segments', () => {
  for (const path of [
    'server/utils/mcp-tools/content.ts',
    'server/utils/mcp-executor/content.ts',
    'server/utils/mcp-catalog-snapshots/tenant.json',
    'server/utils/chowbot-tools/content.ts',
    'server/utils/mcp-workflows.ts',
  ]) {
    assert.notEqual(findProductModelViolations(path, "const row = { status: 'draft' }").length, 0, path)
  }
})
