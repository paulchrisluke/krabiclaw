import assert from 'node:assert/strict'
import test from 'node:test'
import { tenantPageLocationRegex } from '../../server/utils/zaraz-analytics.ts'

test('tenantPageLocationRegex scopes pageviews to exact active hostnames', () => {
  const pattern = new RegExp(tenantPageLocationRegex([
    'ncls.krabiclaw.com',
    'www.northcarolinalegalservices.org',
  ]))

  assert.equal(pattern.test('https://ncls.krabiclaw.com/'), true)
  assert.equal(pattern.test('https://www.northcarolinalegalservices.org/services'), true)
  assert.equal(pattern.test('https://other.krabiclaw.com/'), false)
  assert.equal(pattern.test('https://nclsXkrabiclawXcom/'), false)
  assert.equal(pattern.test('http://ncls.krabiclaw.com/'), false)
})
