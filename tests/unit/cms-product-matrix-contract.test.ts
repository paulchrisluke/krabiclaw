import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCmsCapabilities, type CmsCapabilityDefinition } from '../../config/cms-registry.ts'

function managerKeys(definition: CmsCapabilityDefinition): Set<string> {
  return new Set(definition.managers.map(manager => manager.key))
}

function pageIds(definition: CmsCapabilityDefinition): Set<string> {
  return new Set(definition.pages.map(page => page.id))
}

test('full product matrix resolves one coherent capability model', () => {
  const sayaRestaurant = resolveCmsCapabilities('restaurant', 'saya')
  const sayaHybridRestaurant = resolveCmsCapabilities('restaurant', 'saya', {
    site: { enabled: ['experiences'] },
  })
  const sayaExperience = resolveCmsCapabilities('experience', 'saya')
  const blawbyProfessional = resolveCmsCapabilities('professional_service', 'blawby')

  assert.deepEqual([...managerKeys(sayaRestaurant)].sort(), [
    'location.menu',
    'location.photos',
    'location.posts',
    'location.qa',
    'location.reservations',
    'location.settings',
    'site.blog',
    'site.links',
    'site.locations',
    'site.media',
    'site.ordering',
    'site.qa',
    'site.settings',
    'site.testimonials',
  ])
  assert.equal(pageIds(sayaRestaurant).has('menu'), true)
  assert.equal(pageIds(sayaRestaurant).has('experiences'), false)

  assert.equal(managerKeys(sayaHybridRestaurant).has('location.menu'), true)
  assert.equal(managerKeys(sayaHybridRestaurant).has('location.experiences'), true)
  assert.equal(pageIds(sayaHybridRestaurant).has('experiences'), true)

  assert.equal(managerKeys(sayaExperience).has('location.experiences'), true)
  assert.equal(managerKeys(sayaExperience).has('location.reservations'), true)
  assert.equal(managerKeys(sayaExperience).has('location.menu'), false)
  assert.equal(managerKeys(sayaExperience).has('site.ordering'), false)
  assert.equal(sayaExperience.managers.find(manager => manager.key === 'location.reservations')?.label, 'Bookings')

  assert.equal(managerKeys(blawbyProfessional).has('site.services'), true)
  assert.equal(managerKeys(blawbyProfessional).has('location.menu'), false)
  assert.equal(managerKeys(blawbyProfessional).has('location.experiences'), false)
  assert.equal(blawbyProfessional.locationVocabulary, 'office/service area')
  assert.equal(pageIds(blawbyProfessional).has('services'), true)
  assert.equal(pageIds(blawbyProfessional).has('menu'), false)
})

test('site and location disabled states are enforced by the same resolver', () => {
  const siteMenuDisabled = resolveCmsCapabilities('restaurant', 'saya', {
    site: { disabled: ['menu'] },
  })
  assert.equal(managerKeys(siteMenuDisabled).has('location.menu'), false)
  assert.equal(pageIds(siteMenuDisabled).has('menu'), false)
  assert.equal(managerKeys(siteMenuDisabled).has('location.reservations'), true)

  const locationReservationsDisabled = resolveCmsCapabilities('restaurant', 'saya', {
    location: { disabled: ['reservations'] },
  })
  assert.equal(managerKeys(locationReservationsDisabled).has('location.reservations'), false)
  assert.equal(pageIds(locationReservationsDisabled).has('reservations'), true)
  assert.equal(managerKeys(locationReservationsDisabled).has('site.ordering'), true)
})
