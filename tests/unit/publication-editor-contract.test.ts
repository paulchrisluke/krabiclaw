import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

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
  assert.match(docEditor, /onMounted\(loadDoc\)/)
  assert.match(docEditor, /Save live changes/)
  assert.doesNotMatch(docEditor, />\s*Unpublish\s*</)

  const newDoc = read('pages/admin/docs/new.vue')
  assert.match(newDoc, />\s*Publish\s*</)
  assert.doesNotMatch(newDoc, /Save draft/)
})
