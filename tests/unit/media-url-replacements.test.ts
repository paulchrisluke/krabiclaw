import assert from 'node:assert/strict'
import test from 'node:test'

import { replaceMediaUrls } from '../../scripts/utils/media-url-replacements.mjs'

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
