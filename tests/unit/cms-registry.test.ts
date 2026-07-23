import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allGuardableManagerKeys,
  cmsCapabilityRegistry,
  resolveCmsCapabilities,
  toggleableModulesForScope,
  validateCmsCapabilityDefinition,
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

test('vertical-specific business modules never leak into another product (defaults)', () => {
  const restaurant = resolveCmsCapabilities('restaurant', 'saya')
  const experience = resolveCmsCapabilities('experience', 'saya')
  const professional = resolveCmsCapabilities('professional_service', 'blawby')

  assert.ok(restaurant.managers.some(manager => manager.id === 'menu'))
  assert.ok(!experience.managers.some(manager => manager.id === 'menu'))
  assert.ok(!professional.managers.some(manager => manager.id === 'menu' || manager.id === 'experiences' || manager.id === 'reservations'))
  assert.ok(professional.managers.some(manager => manager.id === 'services'))
  assert.ok(professional.pages.every(page => page.editor === 'professional_services'))
  assert.ok(restaurant.pages.every(page => page.editor === 'site_content'))
  assert.equal(professional.locationVocabulary, 'office/service area')
})

test('content managers are present for every vertical regardless of business module defaults', () => {
  for (const vertical of ['restaurant', 'experience', 'professional_service'] as const) {
    const template = vertical === 'professional_service' ? 'blawby' : 'saya'
    const resolved = resolveCmsCapabilities(vertical, template)
    for (const feature of ['blog', 'qa', 'testimonials', 'posts', 'photos', 'media']) {
      assert.ok(resolved.managers.some(manager => manager.id === feature), `${vertical} is missing content manager: ${feature}`)
    }
  }
})

test('content managers are never removable via an explicit disabled delta', () => {
  const resolved = resolveCmsCapabilities('restaurant', 'saya', { site: { disabled: ['qa', 'blog', 'testimonials', 'posts', 'photos', 'media'] } })
  for (const feature of ['blog', 'qa', 'testimonials', 'posts', 'photos', 'media']) {
    assert.ok(resolved.managers.some(manager => manager.id === feature), `${feature} should survive an explicit disable`)
  }
})

test('toggleableModulesForScope only lists real business modules, never content managers', () => {
  const sayaSite = toggleableModulesForScope('saya', 'site')
  const sayaLocation = toggleableModulesForScope('saya', 'location')
  const blawbySite = toggleableModulesForScope('blawby', 'site')
  const blawbyLocation = toggleableModulesForScope('blawby', 'location')

  for (const contentFeature of ['blog', 'qa', 'testimonials', 'reviews', 'posts', 'photos', 'media', 'contact', 'locations', 'settings']) {
    assert.ok(!sayaSite.includes(contentFeature as never))
    assert.ok(!sayaLocation.includes(contentFeature as never))
  }
  assert.deepEqual([...sayaSite].sort(), ['experiences', 'menu', 'ordering', 'reservations'])
  assert.deepEqual([...sayaLocation].sort(), ['experiences', 'menu', 'ordering', 'reservations'])
  assert.deepEqual(blawbySite, ['services'])
  // 'services' is only configurableAt: ['site'] — a location can never toggle it.
  assert.deepEqual(blawbyLocation, [])
})

test('site.qa and location.qa are distinct, independently keyed managers', () => {
  const restaurant = resolveCmsCapabilities('restaurant', 'saya')
  const siteQa = restaurant.managers.find(manager => manager.key === 'site.qa')
  const locationQa = restaurant.managers.find(manager => manager.key === 'location.qa')
  assert.ok(siteQa && locationQa)
  assert.notEqual(siteQa.route, locationQa.route)
  assert.equal(siteQa.scope, 'site')
  assert.equal(locationQa.scope, 'location')
})

test('media library is site-scoped and photos are location-scoped', () => {
  const restaurant = resolveCmsCapabilities('restaurant', 'saya')
  assert.ok(restaurant.managers.some(manager => manager.key === 'site.media' && manager.route === 'media' && manager.scope === 'site'))
  assert.ok(restaurant.managers.some(manager => manager.key === 'location.photos' && manager.route === ':location/photos' && manager.scope === 'location'))
  assert.ok(!restaurant.managers.some(manager => manager.key === 'location.media'))
})

test('owner-entered testimonials are distinct from future location reviews', () => {
  const restaurant = resolveCmsCapabilities('restaurant', 'saya')
  const testimonials = restaurant.managers.find(manager => manager.key === 'site.testimonials')
  assert.ok(testimonials)
  assert.equal(testimonials.id, 'testimonials')
  assert.equal(testimonials.label, 'Testimonials')
  assert.equal(testimonials.route, 'testimonials')
  assert.ok(!restaurant.managers.some(manager => manager.key === 'location.reviews'))
})

test('a hybrid site delta unlocks a manager the vertical does not default to', () => {
  const hybrid = resolveCmsCapabilities('restaurant', 'saya', { site: { enabled: ['experiences'] } })
  assert.ok(hybrid.managers.some(manager => manager.key === 'location.menu'), 'restaurant default (menu) is preserved')
  assert.ok(hybrid.managers.some(manager => manager.key === 'location.experiences'), 'explicit enable adds experiences on top')
})

test('site feature disabled: an explicit disabled delta turns off a vertical default', () => {
  const withoutOrdering = resolveCmsCapabilities('restaurant', 'saya', { site: { disabled: ['ordering'] } })
  assert.ok(!withoutOrdering.pages.some(page => page.feature === 'ordering'))
  assert.ok(withoutOrdering.managers.some(manager => manager.key === 'location.menu'), 'other defaults are untouched')
})

test('location feature disabled: a location delta narrows the inherited site set', () => {
  const withoutLocationMenu = resolveCmsCapabilities('restaurant', 'saya', {
    location: { disabled: ['menu'] },
  })
  assert.ok(!withoutLocationMenu.managers.some(manager => manager.key === 'location.menu'))
  // site-scoped managers are unaffected by a location delta
  assert.ok(withoutLocationMenu.managers.some(manager => manager.key === 'site.blog'))
})

test('a location can re-enable a module the site already supports (round trip)', () => {
  const disabled = resolveCmsCapabilities('restaurant', 'saya', { location: { disabled: ['menu'] } })
  assert.ok(!disabled.managers.some(manager => manager.key === 'location.menu'))
  const reenabled = resolveCmsCapabilities('restaurant', 'saya', { location: { enabled: ['menu'], disabled: [] } })
  assert.ok(reenabled.managers.some(manager => manager.key === 'location.menu'))
})

test('location overrides must be a subset of the effective site feature set', () => {
  assert.throws(
    () => resolveCmsCapabilities('restaurant', 'saya', {
      site: { disabled: ['menu', 'ordering'] },
      location: { enabled: ['experiences'] },
    }),
    /Location capability override requires parent site support/,
  )
})

test('a location may always disable something it inherited, without validation', () => {
  assert.doesNotThrow(() => resolveCmsCapabilities('restaurant', 'saya', {
    location: { disabled: ['menu', 'ordering', 'reservations'] },
  }))
})

test('validation catches a duplicate manager key', () => {
  const valid = resolveCmsCapabilities('restaurant', 'saya')
  const broken = { ...valid, managers: [...valid.managers, valid.managers[0]!] }
  assert.throws(() => validateCmsCapabilityDefinition(broken), /Duplicate CMS manager key/)
})

test('validation catches two managers landing on the same effective route', () => {
  const valid = resolveCmsCapabilities('restaurant', 'saya')
  const siteManager = valid.managers.find(m => m.scope === 'site')!
  const collidingManager = { ...siteManager, key: 'site.contact', id: 'contact' as const }
  const broken = { ...valid, managers: [...valid.managers, collidingManager] }
  assert.throws(() => validateCmsCapabilityDefinition(broken), /Duplicate CMS manager route/)
})

test('validation catches a location-scoped manager missing :location in its route', () => {
  const valid = resolveCmsCapabilities('restaurant', 'saya')
  const badRoute = { ...valid.managers.find(m => m.scope === 'location')!, key: 'location.contact', id: 'contact' as const, route: 'no-location-token' }
  const broken = { ...valid, managers: [...valid.managers, badRoute] }
  assert.throws(() => validateCmsCapabilityDefinition(broken), /must declare :location/)
})

test('every manager key is guardable via allGuardableManagerKeys', () => {
  const guardable = new Set(allGuardableManagerKeys())
  for (const capability of cmsCapabilityRegistry) {
    for (const manager of capability.managers) {
      assert.ok(guardable.has(manager.key), `${manager.key} is missing from allGuardableManagerKeys()`)
    }
  }
})
