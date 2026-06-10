import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  compiledDemoSeed,
  demoFixture,
  renderCompiledDemoCoreSeedBlock,
  renderDemoExperienceSeedBlock,
} from '../../seed-definitions/demo.ts'
import { serializeCompiledSeedBundle } from '../../seed-definitions/serialize.ts'

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

test('compiled demo seed carries normalized route manifests for locations and experiences', () => {
  assert.deepEqual(compiledDemoSeed.routeManifest.locations, [
    '/locations/brooklyn',
    '/locations/west-village',
  ])
  assert.deepEqual(compiledDemoSeed.routeManifest.experiences, [
    '/experiences/pizza-making-class',
    '/experiences/natural-wine-and-pizza-night',
    '/experiences/family-pizza-night',
  ])
})

test('compiled demo seed normalizes org/site ids onto compiled rows', () => {
  assert.ok(compiledDemoSeed.mediaAssets.every((asset) => asset.organizationId === demoFixture.organizationId))
  assert.ok(compiledDemoSeed.mediaAssets.every((asset) => asset.siteId === demoFixture.siteId))
  assert.ok(compiledDemoSeed.siteContent.every((entry) => entry.organizationId === demoFixture.organizationId))
  assert.ok(compiledDemoSeed.experiences.every((experience) => experience.siteId === demoFixture.siteId))
})

test('compiled demo seed can be serialized into a deterministic artifact bundle', () => {
  const serialized = serializeCompiledSeedBundle(compiledDemoSeed)

  assert.equal(serialized.identity.fixtureId, 'demo')
  assert.deepEqual(serialized.routeManifest, compiledDemoSeed.routeManifest)
  assert.deepEqual(serialized.publicRoutes[0], {
    path: '/experiences',
    titlePattern: 'Experiences \\| Ember & Slice',
    titleFlags: '',
    text: 'Pizza Making Class',
  })
})

test('checked-in demo bundle artifact matches the compiled demo seed', () => {
  const artifactPath = resolve(process.cwd(), 'seed-definitions/generated/demo.bundle.json')
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))

  assert.deepEqual(artifact, serializeCompiledSeedBundle(compiledDemoSeed))
})

test('demo experience seed block includes editable experiences page content', () => {
  const sql = renderDemoExperienceSeedBlock()

  assert.match(sql, /INSERT INTO experiences/)
  assert.match(sql, /INSERT INTO site_content/)
  assert.match(sql, /hero\.title/)
  assert.match(sql, /Pizza Making Class/)
})

test('demo core seed block includes generated site, locale, domain, and location rows', () => {
  const sql = renderCompiledDemoCoreSeedBlock()

  assert.match(sql, /INSERT INTO sites/)
  assert.match(sql, /INSERT INTO site_config/)
  assert.match(sql, /INSERT INTO site_locales/)
  assert.match(sql, /INSERT INTO site_domains/)
  assert.match(sql, /INSERT INTO business_locations/)
  assert.match(sql, /source_locale/)
  assert.match(sql, /Ember & Slice Brooklyn/)
})
