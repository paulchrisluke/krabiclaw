import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cmsCapabilityRegistry,
  resolveCmsCapabilities,
  validateCmsCapabilityRegistry,
} from '../../config/cms-registry.ts'

test('CMS capability registry is internally valid', () => {
  assert.doesNotThrow(() => validateCmsCapabilityRegistry())
})

test('CMS registry resolves the complete supported vertical/template matrix', () => {
  assert.equal(resolveCmsCapabilities('restaurant', 'saya').vertical, 'restaurant')
  assert.equal(resolveCmsCapabilities('experience', 'saya').vertical, 'experience')
  assert.equal(resolveCmsCapabilities('professional_service', 'blawby').vertical, 'professional_service')
})

test('CMS registry fails fast for unsupported vertical/template combinations', () => {
  assert.throws(
    () => resolveCmsCapabilities('restaurant', 'blawby'),
    /Unsupported CMS capability combination: restaurant\/blawby/,
  )
})

test('each supported CMS exposes the five universal sections', () => {
  for (const capability of cmsCapabilityRegistry) {
    const sections = new Set(['pages', ...capability.managers.map(manager => manager.section)])
    assert.deepEqual([...sections].sort(), ['collections', 'locations', 'media', 'pages', 'site'])
  }
})

test('vertical-specific managers never leak into another product', () => {
  const restaurant = resolveCmsCapabilities('restaurant', 'saya')
  const experience = resolveCmsCapabilities('experience', 'saya')
  const professional = resolveCmsCapabilities('professional_service', 'blawby')

  assert.ok(restaurant.managers.some(manager => manager.id === 'menu'))
  assert.ok(!experience.managers.some(manager => manager.id === 'menu'))
  assert.ok(!professional.managers.some(manager => manager.id === 'menu' || manager.id === 'experiences' || manager.id === 'reservations'))
  assert.ok(professional.managers.some(manager => manager.id === 'offerings'))
  assert.ok(professional.pages.every(page => page.editor === 'professional_services'))
  assert.ok(restaurant.pages.every(page => page.editor === 'site_content'))
  assert.equal(professional.locationVocabulary, 'office/service area')
})
