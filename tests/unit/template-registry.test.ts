import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findPublishedTemplateMarketing,
  listPublishedTemplateMarketing,
  publicTemplateMarketing,
  publicTemplateRegistry,
  resolvePublicTemplate,
} from '../../utils/template-registry.ts'

test('resolvePublicTemplate treats professional_service as Blawby', () => {
  const template = resolvePublicTemplate({ vertical: 'professional_service' })

  assert.equal(template.slug, 'blawby')
  assert.equal(template.layout, 'blawby')
})

test('Blawby sitemap exact paths stay aligned with the registered policy routes', () => {
  assert.deepEqual(publicTemplateRegistry.blawby.sitemap.exactPaths, [
    '/',
    '/about',
    '/services',
    '/pricing',
    '/donate',
    '/schedule',
    '/contact',
    '/blog',
    '/policies/privacy',
    '/policies/terms',
    '/third-party-notices',
  ])
})

test('every routing/rendering registry slug has paired marketing metadata under the same slug', () => {
  for (const slug of Object.keys(publicTemplateRegistry) as (keyof typeof publicTemplateRegistry)[]) {
    const marketing = publicTemplateMarketing[slug]
    assert.ok(marketing, `missing publicTemplateMarketing entry for ${slug}`)
    assert.equal(marketing.slug, slug)
  }
})

test('listPublishedTemplateMarketing returns only published templates in sort order', () => {
  const templates = listPublishedTemplateMarketing()

  assert.deepEqual(templates.map(t => t.slug), ['saya', 'blawby'])
  for (const template of templates) assert.equal(template.published, true)
})

test('findPublishedTemplateMarketing resolves known slugs and 404s (returns null) for unknown/unpublished ones', () => {
  assert.equal(findPublishedTemplateMarketing('saya')?.displayName, 'Saya')
  assert.equal(findPublishedTemplateMarketing('blawby')?.displayName, 'Blawby')
  assert.equal(findPublishedTemplateMarketing('BLAWBY')?.displayName, 'Blawby')
  assert.equal(findPublishedTemplateMarketing('not-a-real-template'), null)
  assert.equal(findPublishedTemplateMarketing(null), null)
  assert.equal(findPublishedTemplateMarketing(undefined), null)
})

test('Blawby marketing metadata uses the NCLS-approved literal demo URL; Saya resolves its demo at runtime', () => {
  assert.equal(publicTemplateMarketing.blawby.demoUrl, 'https://ncls.krabiclaw.com')
  assert.equal(publicTemplateMarketing.saya.demoUrl, null)
})
