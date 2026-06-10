import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compiledPotteryHouseSeed,
  potteryHouseFixture,
  renderCompiledPotteryHouseCoreSeedBlock,
  renderCompiledPotteryHouseMediaBlock,
  renderCompiledPotteryHouseExperiencesBlock,
  renderCompiledPotteryHouseReviewsBlock,
  renderCompiledPotteryHouseQaBlock,
  renderCompiledPotteryHousePostsBlock,
  renderCompiledPotteryHouseContentBlock,
} from '../../seed-definitions/pottery-house.ts'

test('pottery house fixture experience slugs are unique', () => {
  const slugs = potteryHouseFixture.experiences.map((e) => e.slug)
  assert.equal(new Set(slugs).size, slugs.length)
})

test('pottery house fixture public experience routes match seeded experiences', () => {
  const expectedPaths = potteryHouseFixture.experiences.map((e) => `/experiences/${e.slug}`)
  const actualPaths = potteryHouseFixture.publicRoutes
    .map((r) => r.path)
    .filter((p) => p !== '/experiences')

  assert.deepEqual(actualPaths.sort(), expectedPaths.sort())
})

test('compiled pottery house seed carries normalized route manifests', () => {
  assert.deepEqual(compiledPotteryHouseSeed.routeManifest.locations, [
    '/locations/krabi',
    '/locations/klong-muang-beach',
  ])
  assert.deepEqual(compiledPotteryHouseSeed.routeManifest.experiences, [
    '/experiences/pottery-wheel-class',
    '/experiences/cocktails-and-clay',
    '/experiences/beachfront-pottery',
    '/experiences/monthly-membership',
  ])
})

test('compiled pottery house seed normalizes org/site ids onto compiled rows', () => {
  assert.ok(compiledPotteryHouseSeed.mediaAssets.every((a) => a.organizationId === 'org-pottery-house'))
  assert.ok(compiledPotteryHouseSeed.mediaAssets.every((a) => a.siteId === 'site-pottery-house'))
  assert.ok(compiledPotteryHouseSeed.experiences.every((e) => e.siteId === 'site-pottery-house'))
  assert.ok(compiledPotteryHouseSeed.reviews.every((r) => r.organizationId === 'org-pottery-house'))
})

test('pottery house core block includes site, locale, domain, and location rows with contact_phone', () => {
  const sql = renderCompiledPotteryHouseCoreSeedBlock()

  assert.match(sql, /INSERT INTO sites/)
  assert.match(sql, /contact_phone/)
  assert.match(sql, /\+66626505890/)
  assert.match(sql, /INSERT INTO site_config/)
  assert.match(sql, /INSERT INTO site_locales/)
  assert.match(sql, /INSERT INTO site_domains/)
  assert.match(sql, /INSERT INTO business_locations/)
  assert.match(sql, /Pottery House Krabi/)
  assert.match(sql, /klong-muang-beach/)
})

test('pottery house media block includes R2 assets and hero refs', () => {
  const sql = renderCompiledPotteryHouseMediaBlock()

  assert.match(sql, /INSERT OR REPLACE INTO media_assets/)
  assert.match(sql, /cloudflare_r2/)
  assert.match(sql, /r2_key/)
  assert.match(sql, /620a54b7-33ef-48b9-b5d3-0b3a5a22be13/)
  assert.match(sql, /UPDATE business_locations SET hero_image_asset_id/)
  assert.match(sql, /media-ph-homepage-custom/)
  assert.match(sql, /media-ph-beach-hero/)
})

test('pottery house experiences block includes all four experiences including membership with null capacity', () => {
  const sql = renderCompiledPotteryHouseExperiencesBlock()

  assert.match(sql, /INSERT OR REPLACE INTO experiences/)
  assert.match(sql, /pottery-wheel-class/)
  assert.match(sql, /cocktails-and-clay/)
  assert.match(sql, /beachfront-pottery/)
  assert.match(sql, /monthly-membership/)
  assert.match(sql, /loc-pottery-beachfront/)
})

test('pottery house reviews block includes reviews for both locations', () => {
  const sql = renderCompiledPotteryHouseReviewsBlock()

  assert.match(sql, /INSERT INTO reviews/)
  assert.match(sql, /loc-pottery-house'/)
  assert.match(sql, /loc-pottery-beachfront'/)
  assert.match(sql, /Sophie L\./)
})

test('pottery house qa block includes Q&A for both locations', () => {
  const sql = renderCompiledPotteryHouseQaBlock()

  assert.match(sql, /INSERT INTO location_qa/)
  assert.match(sql, /loc-pottery-house'/)
  assert.match(sql, /loc-pottery-beachfront'/)
  assert.match(sql, /Cocktails & Clay/)
})

test('pottery house posts block includes posts and channel jobs', () => {
  const sql = renderCompiledPotteryHousePostsBlock()

  assert.match(sql, /INSERT INTO posts/)
  assert.match(sql, /INSERT INTO post_channel_jobs/)
  assert.match(sql, /Doors open, wheels spinning\./)
  assert.match(sql, /IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO/)
})

test('pottery house content block includes home hero and about page content', () => {
  const sql = renderCompiledPotteryHouseContentBlock()

  assert.match(sql, /INSERT INTO site_content/)
  assert.match(sql, /Clay, calm, and a place to return to\./)
  assert.match(sql, /hero_image_asset_id/)
  assert.match(sql, /story\.title/)
  assert.match(sql, /journey\.body/)
})

test('pottery house compiled media assets carry R2 provider and r2Key on uploads', () => {
  const r2Assets = compiledPotteryHouseSeed.mediaAssets.filter((a) => a.provider === 'cloudflare_r2')
  assert.ok(r2Assets.length > 0)
  assert.ok(r2Assets.every((a) => a.r2Key !== null))
  assert.ok(r2Assets.every((a) => a.source === 'uploaded'))

  const externalAssets = compiledPotteryHouseSeed.mediaAssets.filter((a) => a.provider === 'external_url')
  assert.ok(externalAssets.length > 0)
  assert.ok(externalAssets.every((a) => a.r2Key === null))
})
