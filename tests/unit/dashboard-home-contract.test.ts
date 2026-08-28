import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const pagePath = fileURLToPath(new URL('../../pages/dashboard/[orgSlug]/sites/[siteSlug]/index.vue', import.meta.url))
const homeRoutePath = fileURLToPath(new URL('../../server/api/dashboard/home.get.ts', import.meta.url))

test('dashboard home uses one request and does not restore the deleted resource fan-out', () => {
  const page = readFileSync(pagePath, 'utf8')

  assert.match(page, /'\/api\/dashboard\/home'/)
  assert.doesNotMatch(page, /'\/api\/dashboard\/settings', \{ validate/)
  assert.doesNotMatch(page, /\/pages`, \{ validate/)
  assert.doesNotMatch(page, /\/media\?kind=image&limit=6&offset=0/)
  assert.doesNotMatch(page, /\/links-page`, \{ validate/)
  assert.doesNotMatch(page, /supportingPending/)
  assert.doesNotMatch(page, /supportingError/)
})

test('dashboard home returns canonical page documents without manufacturing status', () => {
  const utilityPath = fileURLToPath(new URL('../../server/utils/dashboard-home.ts', import.meta.url))
  const utility = readFileSync(utilityPath, 'utf8')

  assert.match(utility, /listTenantPages/)
  assert.doesNotMatch(utility, /status:.*draft|status:.*live/i)
})

test('dashboard home enforces site-wide access once at its API boundary', () => {
  const route = readFileSync(homeRoutePath, 'utf8')

  assert.match(route, /getDashboardContext\(event, \{ requireSite: true \}\)/)
  assert.match(route, /await assertSiteWideAccess\(db, \{/)
  assert.match(route, /getDashboardHomeData\(/)
})

test('site overview does not invent publication badges or read the legacy site plan', () => {
  const page = readFileSync(pagePath, 'utf8')

  assert.doesNotMatch(page, />Draft</)
  assert.doesNotMatch(page, />Live</)
  assert.doesNotMatch(page, />Off</)
  assert.doesNotMatch(page, /isPageLimitReached/)
  assert.doesNotMatch(page, /dashboard\.site\.value\?\.plan/)
})

test('site overview routes collection managers and page documents to their actual editors', () => {
  const page = readFileSync(pagePath, 'utf8')

  assert.match(page, /if \(path === '\/menu' \|\| path === '\/products'\) return `\$\{primaryLocationPath\.value\}\/products`/)
  assert.match(page, /if \(path === '\/order'\) return `\$\{siteDashboardPath\.value\}\/orders`/)
  assert.match(page, /to: `\$\{siteDashboardPath\.value\}\/pages\/\$\{page\.id\}`/)
  assert.doesNotMatch(page, /query: \{ page: path \}/)
  assert.match(page, /const documents = pages\.value/)
  assert.match(page, /return \[\.\.\.documents, \.\.\.managers\]/)
})
