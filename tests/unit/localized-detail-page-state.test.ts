import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const blogSource = readFileSync(new URL('../../pages/blog/[slug].vue', import.meta.url), 'utf8')
const postSource = readFileSync(new URL('../../pages/posts/[slug].vue', import.meta.url), 'utf8')

test('localized blog detail owns locale state and preserves its source section', () => {
  assert.match(blogSource, /const parsedRoute = splitLocalePrefix\(route\.path\)/)
  assert.match(blogSource, /useState<string>\('public-locale',[\s\S]*?\.value = locale/)
  assert.match(blogSource, /parsedRoute\.sourcePath\.startsWith\('\/article\/'\)/)
  assert.match(blogSource, /breadcrumbs:[\s\S]*?url: blogBasePath/)
})

test('localized post detail caches each locale independently', () => {
  assert.match(postSource, /`public-post-\$\{siteId\}-\$\{locale\.value\}-\$\{slug\.value\}`/)
})
