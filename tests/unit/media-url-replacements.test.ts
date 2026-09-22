import assert from 'node:assert/strict'
import test from 'node:test'

import { replaceMediaUrls } from '../../scripts/utils/media-url-replacements.mjs'
import { SiteLinksValidationError, validateLinkDestination } from '../../server/utils/links-page.ts'

test('replaces media URLs inside nested Markdown strings', () => {
  const source = 'https://images.example.test/legacy/image.webp'
  const destination = 'https://media.example.test/imports/hash.webp'
  const value = {
    body: `[![Consultation](${source})](/schedule)`,
    nested: [{ public_url: source }],
  }

  assert.deepEqual(replaceMediaUrls(value, new Map([[source, destination]])), {
    body: `[![Consultation](${destination})](/schedule)`,
    nested: [{ public_url: destination }],
  })
})

test('site link destinations validate URLs', () => {
  assert.equal(validateLinkDestination('/reservations'), '/reservations')
  assert.equal(validateLinkDestination('/contact?from=links'), '/contact?from=links')
  assert.equal(validateLinkDestination('https://example.com/path'), 'https://example.com/path')
  assert.equal(validateLinkDestination('http://example.com'), 'http://example.com/')
  assert.equal(validateLinkDestination('mailto:hello@example.com'), 'mailto:hello@example.com')
  assert.equal(validateLinkDestination('tel:+15551234567'), 'tel:+15551234567')
  for (const destination of ['', 'not a url', '//evil.example/path', '\\contact', 'javascript:alert(1)', 'data:text/html,test']) {
    assert.throws(() => validateLinkDestination(destination), SiteLinksValidationError)
  }
})
