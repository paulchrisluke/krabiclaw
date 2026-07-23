import assert from 'node:assert/strict'
import test from 'node:test'
import { SiteLinksValidationError, validateLinkDestination } from '../../server/utils/site-links.ts'

test('validateLinkDestination accepts owned paths and approved URL schemes', () => {
  assert.equal(validateLinkDestination('/reservations'), '/reservations')
  assert.equal(validateLinkDestination('/contact?from=links'), '/contact?from=links')
  assert.equal(validateLinkDestination('https://example.com/path'), 'https://example.com/path')
  assert.equal(validateLinkDestination('http://example.com'), 'http://example.com/')
  assert.equal(validateLinkDestination('mailto:hello@example.com'), 'mailto:hello@example.com')
  assert.equal(validateLinkDestination('tel:+15551234567'), 'tel:+15551234567')
})

test('validateLinkDestination rejects ambiguous or unsafe destinations', () => {
  for (const destination of ['', 'not a url', '//evil.example/path', '\\contact', 'javascript:alert(1)', 'data:text/html,test']) {
    assert.throws(() => validateLinkDestination(destination), SiteLinksValidationError)
  }
})
