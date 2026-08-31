import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeHtmlAttribute } from '../../scripts/check-social-images.mjs'

test('social image verifier decodes HTML entities before URL parsing', () => {
  assert.equal(
    decodeHtmlAttribute('https://img.example/card.png?width=1200&amp;height=630&#x26;fit=cover'),
    'https://img.example/card.png?width=1200&height=630&fit=cover',
  )
})
