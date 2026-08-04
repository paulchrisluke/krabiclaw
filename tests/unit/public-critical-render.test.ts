import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { getPublicCriticalHomeRequest, getPublicPageRequest } from '../../composables/usePublicPageRequest.ts'

test('homepage critical resource keeps only canonical content data', () => {
  const full = getPublicPageRequest('/')
  const critical = getPublicCriticalHomeRequest({
    ...full,
    locale: 'en',
    token: null,
  })

  assert.deepEqual(critical, {
    page: 'home',
    location: null,
    experience: null,
    datasets: ['content'],
    blogSlug: null,
    locale: 'en',
    token: null,
  })
})

test('critical public homepage keeps SSR shell and defers only the full route resource', () => {
  const sayaPage = readFileSync('components/saya/SayaHomePage.vue', 'utf8')
  const sayaLayout = readFileSync('layouts/saya.vue', 'utf8')
  const blawbyPage = readFileSync('components/blawby/BlawbyHome.vue', 'utf8')
  const worker = readFileSync('workers/app-entry.ts', 'utf8')

  assert.match(sayaPage, /server: false, lazy: true/)
  assert.match(sayaPage, /pageData/)
  assert.match(sayaLayout, /await shell\.ready/)
  assert.match(blawbyPage, /useBlawbyCriticalHome\(\)/)
  assert.match(blawbyPage, /useBlawbyRoute\('home', null, \{ server: false, lazy: true \}\)/)
  assert.match(worker, /data-public-critical-shell="true"/)
  assert.match(worker, /x-public-hydration', 'after-paint'/)
})
