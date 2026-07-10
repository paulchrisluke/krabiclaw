import test from 'node:test'
import assert from 'node:assert/strict'

import { publicTemplateRegistry, resolvePublicTemplate } from '../../utils/template-registry.ts'

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
