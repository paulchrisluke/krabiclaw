import assert from 'node:assert/strict'
import test from 'node:test'
import {
  composeSocialMetadata,
  resolveSocialOgImage,
  resolveRobots,
  truncateForSeo,
  hashOgImagePayload,
  computeOgImageCacheKey,
  buildOgImageUrl,
  parseOgImageQuery,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  type SocialPageMetadataInput,
} from '~/utils/social-metadata.ts'

function basePayload(overrides: Partial<SocialPageMetadataInput> = {}): SocialPageMetadataInput {
  return {
    template: 'blawby',
    title: 'Estate Planning Services',
    description: 'Wills, trusts, and estate planning for North Carolina families.',
    canonicalUrl: 'https://ncls.krabiclaw.com/services/estate-planning',
    brand: { siteName: 'North Carolina Legal Services' },
    ...overrides,
  }
}

test('truncateForSeo returns undefined for empty/nullish input', () => {
  assert.equal(truncateForSeo(null, 100), undefined)
  assert.equal(truncateForSeo(undefined, 100), undefined)
  assert.equal(truncateForSeo('   ', 100), undefined)
})

test('truncateForSeo leaves short text untouched', () => {
  assert.equal(truncateForSeo('Short description.', 160), 'Short description.')
})

test('truncateForSeo breaks on a word boundary and adds an ellipsis', () => {
  const long = 'word '.repeat(50).trim()
  const result = truncateForSeo(long, 40)!
  assert.ok(result.length <= 40)
  assert.ok(result.endsWith('…'))
  assert.equal(result.includes(' …'), false, 'should not leave a trailing space before the ellipsis')
})

test('resolveRobots: explicit robots string always wins', () => {
  assert.equal(resolveRobots({ robots: 'noindex', indexable: true }), 'noindex')
})

test('resolveRobots: indexable false maps to noindex,nofollow', () => {
  assert.equal(resolveRobots({ robots: null, indexable: false }), 'noindex, nofollow')
})

test('resolveRobots: defaults to null (indexable) when nothing is set', () => {
  assert.equal(resolveRobots({}), null)
})

test('composeSocialMetadata emits the complete OG + Twitter tag set', () => {
  const payload = basePayload()
  const image = { url: 'https://ncls.krabiclaw.com/og-image-render.png?k=abc', width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, type: 'image/png' as const, alt: 'card' }
  const tags = composeSocialMetadata(payload, image)

  assert.equal(tags.title, payload.title)
  assert.equal(tags.ogTitle, payload.title)
  assert.equal(tags.ogType, 'website')
  assert.equal(tags.ogUrl, payload.canonicalUrl)
  assert.equal(tags.ogSiteName, payload.brand.siteName)
  assert.equal(tags.ogImage, image.url)
  assert.equal(tags.ogImageWidth, OG_IMAGE_WIDTH)
  assert.equal(tags.ogImageHeight, OG_IMAGE_HEIGHT)
  assert.equal(tags.ogImageType, 'image/png')
  assert.equal(tags.twitterCard, 'summary_large_image')
  assert.equal(tags.twitterTitle, payload.title)
  assert.equal(tags.twitterImage, image.url)
  assert.equal(tags.robots, null)
})

test('composeSocialMetadata omits width/height for an explicit override without known dimensions', () => {
  const payload = basePayload()
  const image = { url: 'https://example.com/hand-picked.jpg' }
  const tags = composeSocialMetadata(payload, image)

  assert.equal(tags.ogImageWidth, undefined)
  assert.equal(tags.ogImageHeight, undefined)
  assert.equal(tags.ogImageType, 'image/png', 'still defaults a MIME type for the tag even if dimensions are unknown')
})

test('resolveSocialOgImage: explicit override always wins over hero image/generated card', () => {
  const payload = basePayload({
    ogImageOverride: { url: 'https://example.com/override.jpg', width: 1200, height: 630, type: 'image/jpeg' },
    heroImage: { url: 'https://example.com/hero.jpg' },
  })
  const image = resolveSocialOgImage(payload, 'https://ncls.krabiclaw.com')
  assert.equal(image.url, 'https://example.com/override.jpg')
})

test('resolveSocialOgImage: falls back to a generated 1200x630 card when there is no override', () => {
  const payload = basePayload({ heroImage: { url: 'https://example.com/hero.jpg' } })
  const image = resolveSocialOgImage(payload, 'https://ncls.krabiclaw.com')

  assert.equal(image.width, OG_IMAGE_WIDTH)
  assert.equal(image.height, OG_IMAGE_HEIGHT)
  assert.equal(image.type, 'image/png')
  assert.ok(image.url.startsWith('https://ncls.krabiclaw.com/og-image-render.png?'))
  assert.ok(image.url.includes('template=blawby'))
  assert.ok(image.url.includes('backgroundImageUrl='))
})

test('hashOgImagePayload is deterministic for equal input', () => {
  assert.equal(hashOgImagePayload('a=1&b=2'), hashOgImagePayload('a=1&b=2'))
})

test('hashOgImagePayload differs for different input', () => {
  assert.notEqual(hashOgImagePayload('a=1'), hashOgImagePayload('a=2'))
})

test('computeOgImageCacheKey is stable regardless of object key insertion order upstream', () => {
  const payloadA = { template: 'saya' as const, title: 'Title', siteName: 'Site', backgroundImageUrl: 'https://x/y.jpg' }
  const payloadB = { backgroundImageUrl: 'https://x/y.jpg', siteName: 'Site', template: 'saya' as const, title: 'Title' }
  assert.equal(computeOgImageCacheKey(payloadA), computeOgImageCacheKey(payloadB))
})

test('computeOgImageCacheKey changes when render-relevant content changes', () => {
  const a = computeOgImageCacheKey({ template: 'saya', title: 'Title A', siteName: 'Site' })
  const b = computeOgImageCacheKey({ template: 'saya', title: 'Title B', siteName: 'Site' })
  assert.notEqual(a, b)
})

test('buildOgImageUrl + parseOgImageQuery + computeOgImageCacheKey round-trip agree on the cache key', () => {
  const payload = {
    template: 'blawby' as const,
    title: 'Wills & Trusts',
    description: 'Plan your estate with confidence.',
    siteName: 'North Carolina Legal Services',
    label: 'Service',
    logoUrl: 'https://ncls.krabiclaw.com/logo.png',
  }
  const url = buildOgImageUrl('https://ncls.krabiclaw.com', payload)
  const parsedUrl = new URL(url)
  const query = Object.fromEntries(parsedUrl.searchParams.entries())

  const parsedPayload = parseOgImageQuery(query)
  assert.equal(parsedPayload.title, payload.title)
  assert.equal(parsedPayload.template, payload.template)
  assert.equal(parsedPayload.siteName, payload.siteName)

  // The `k` query param embedded in the URL must match recomputing the hash straight from
  // the parsed-back payload — this is exactly what the server route does to validate/derive
  // its KV cache key, so client and server must never disagree.
  assert.equal(parsedUrl.searchParams.get('k'), computeOgImageCacheKey(parsedPayload))
})

test('parseOgImageQuery defaults unknown/missing template to platform', () => {
  const parsed = parseOgImageQuery({ template: 'not-a-real-template', title: 'Hi' })
  assert.equal(parsed.template, 'platform')
})
