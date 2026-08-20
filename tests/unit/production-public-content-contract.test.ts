import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseStoredExperienceTimeSlots } from '../../server/utils/public-page.ts'
import { resolvePublicArticleCanonicalUrl } from '../../server/utils/professional-services.ts'

test('nullable stored experience time slots accept SQL and JSON null', () => {
  assert.equal(parseStoredExperienceTimeSlots(null), null)
  assert.equal(parseStoredExperienceTimeSlots('null'), null)
  assert.deepEqual(parseStoredExperienceTimeSlots('["11:00","14:00"]'), ['11:00', '14:00'])
  assert.throws(() => parseStoredExperienceTimeSlots('{"Monday":["11:00"]}'), /Stored experience time slots are invalid/)
})

test('tenant article canonical URL defaults to its public slug route', () => {
  assert.equal(resolvePublicArticleCanonicalUrl(null, 'tenant-news'), '/article/tenant-news')
  assert.equal(resolvePublicArticleCanonicalUrl('', 'tenant-news'), '/article/tenant-news')
  assert.equal(resolvePublicArticleCanonicalUrl(' https://example.com/news ', 'tenant-news'), 'https://example.com/news')
})
