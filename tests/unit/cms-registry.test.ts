import assert from 'node:assert/strict'
import test from 'node:test'
import {
  allGuardableManagerKeys,
  cmsCapabilityRegistry,
  resolveCmsCapabilities,
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

test('vertical-specific managers never leak into another product (defaults)', () => {
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

test('site.qa and location.qa are distinct, independently keyed managers', () => {
  const restaurant = resolveCmsCapabilities('restaurant', 'saya')
  const siteQa = restaurant.managers.find(manager => manager.key === 'site.qa')
  const locationQa = restaurant.managers.find(manager => manager.key === 'location.qa')
  assert.ok(siteQa && locationQa)
  assert.notEqual(siteQa.route, locationQa.route)
  assert.equal(siteQa.scope, 'site')
  assert.equal(locationQa.scope, 'location')
})

test('always-on features survive even when a site override omits them', () => {
  const resolved = resolveCmsCapabilities('restaurant', 'saya', { site: ['menu'] })
  assert.ok(resolved.managers.some(manager => manager.key === 'site.settings'))
  assert.ok(resolved.managers.some(manager => manager.key === 'site.locations'))
})

test('hybrid site override: restaurant with experiences added on top of defaults', () => {
  const hybrid = resolveCmsCapabilities('restaurant', 'saya', {
    site: [...(cmsCapabilityRegistry.find(c => c.vertical === 'restaurant')?.managers.map(m => m.id) ?? []), 'experiences'],
  })
  assert.ok(hybrid.managers.some(manager => manager.key === 'location.menu'))
  assert.ok(hybrid.managers.some(manager => manager.key === 'location.experiences'))
})

test('site feature disabled: an explicit site override can turn off a vertical default', () => {
  const withoutOrdering = resolveCmsCapabilities('restaurant', 'saya', { site: ['menu', 'reservations'] })
  assert.ok(!withoutOrdering.pages.some(page => page.feature === 'ordering'))
  assert.ok(withoutOrdering.managers.some(manager => manager.key === 'location.menu'))
})

test('location feature disabled: a location override narrows the inherited site set', () => {
  const withoutLocationMenu = resolveCmsCapabilities('restaurant', 'saya', {
    location: ['reservations'],
  })
  assert.ok(!withoutLocationMenu.managers.some(manager => manager.key === 'location.menu'))
  // site-scoped managers are unaffected by a location override
  assert.ok(withoutLocationMenu.managers.some(manager => manager.key === 'site.blog'))
})

test('location overrides must be a subset of the effective site feature set', () => {
  assert.throws(
    () => resolveCmsCapabilities('restaurant', 'saya', { site: ['menu'], location: ['experiences'] }),
    /Location capability override requires parent site support/,
  )
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
