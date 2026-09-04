import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveDashboardPrimaryLocationPath,
  resolveDashboardSitePageDestination,
} from '../../composables/useDashboardSiteLinks.ts'
import { SiteLinksValidationError, validateLinkDestination } from '../../server/utils/site-links.ts'

test('site link destinations validate URLs and require concrete dashboard location scope', () => {
  assert.equal(validateLinkDestination('/reservations'), '/reservations')
  assert.equal(validateLinkDestination('/contact?from=links'), '/contact?from=links')
  assert.equal(validateLinkDestination('https://example.com/path'), 'https://example.com/path')
  assert.equal(validateLinkDestination('http://example.com'), 'http://example.com/')
  assert.equal(validateLinkDestination('mailto:hello@example.com'), 'mailto:hello@example.com')
  assert.equal(validateLinkDestination('tel:+15551234567'), 'tel:+15551234567')
  for (const destination of ['', 'not a url', '//evil.example/path', '\\contact', 'javascript:alert(1)', 'data:text/html,test']) {
    assert.throws(() => validateLinkDestination(destination), SiteLinksValidationError)
  }

  const sitePath = '/dashboard/acme/sites/cafe'
  const locationsPath = `${sitePath}/locations`
  const primaryLocationPath = resolveDashboardPrimaryLocationPath([
    { slug: 'first', is_primary: false },
    { slug: 'primary', is_primary: true },
  ], locationsPath)
  const firstLocationPath = resolveDashboardPrimaryLocationPath([
    { slug: 'first', is_primary: false },
    { slug: 'second', is_primary: false },
  ], locationsPath)
  const missingLocationPath = resolveDashboardPrimaryLocationPath([], locationsPath)

  assert.equal(primaryLocationPath, `${locationsPath}/primary`)
  assert.equal(firstLocationPath, `${locationsPath}/first`)
  assert.equal(missingLocationPath, null)

  const locationRoutes = ['/menu', '/products', '/reservations', '/experiences']
  const resolvedDestinations = locationRoutes.map(path =>
    resolveDashboardSitePageDestination(path, sitePath, primaryLocationPath),
  )
  assert.deepEqual(resolvedDestinations, [
    `${locationsPath}/primary/products`,
    `${locationsPath}/primary/products`,
    `${locationsPath}/primary/reservations`,
    `${locationsPath}/primary/experiences`,
  ])
  assert.deepEqual(
    locationRoutes.map(path => resolveDashboardSitePageDestination(path, sitePath, missingLocationPath)),
    [null, null, null, null],
  )

  assert.equal(resolveDashboardSitePageDestination('/blog', sitePath, null), `${sitePath}/blog`)
  assert.equal(resolveDashboardSitePageDestination('/order', sitePath, null), `${sitePath}/orders`)
  for (const path of ['/services', '/pricing', '/donate', '/schedule']) {
    assert.equal(resolveDashboardSitePageDestination(path, sitePath, null), `${sitePath}/professional-services`)
  }

  assert.equal(
    resolvedDestinations.some(destination => typeof destination === 'string' && /\/locations\/(?:products|reservations|experiences)$/.test(destination)),
    false,
  )
})
