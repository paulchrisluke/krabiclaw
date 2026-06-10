import test from 'node:test'
import assert from 'node:assert/strict'

import { demoFixture, renderDemoExperienceSeedBlock } from '../../seed-definitions/demo.ts'

test('demo fixture experience slugs are unique', () => {
  const slugs = demoFixture.experiences.map((experience) => experience.slug)
  assert.equal(new Set(slugs).size, slugs.length)
})

test('demo fixture public experience routes match seeded experiences', () => {
  const expectedPaths = demoFixture.experiences.map((experience) => `/experiences/${experience.slug}`)
  const actualPaths = demoFixture.publicRoutes
    .map((route) => route.path)
    .filter((path) => path !== '/experiences')

  assert.deepEqual(actualPaths.sort(), expectedPaths.sort())
})

test('demo experience seed block includes editable experiences page content', () => {
  const sql = renderDemoExperienceSeedBlock()

  assert.match(sql, /INSERT INTO experiences/)
  assert.match(sql, /INSERT INTO site_content/)
  assert.match(sql, /hero\.title/)
  assert.match(sql, /Pizza Making Class/)
})
