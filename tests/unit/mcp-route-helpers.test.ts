import assert from 'node:assert/strict'
import test from 'node:test'
import { mcpToolErrorResult } from '../../server/utils/mcp-route-helpers.ts'

test('a tool action carries its dashboard destination without unrelated private details', () => {
  const result = mcpToolErrorResult('A paid plan is required.', {
    code: 'LANGUAGE_ENTITLEMENT_REQUIRED', dashboard_url: '/dashboard/kanpai/payments?tab=plan',
    credential: 'private-value', customer_email: 'private@example.com',
  }, 'https://krabiclaw.com')
  assert.equal(result.isError, true)
  assert.deepEqual(result.structuredContent, {
    code: 'LANGUAGE_ENTITLEMENT_REQUIRED', message: 'A paid plan is required.',
    dashboard_url: 'https://krabiclaw.com/dashboard/kanpai/payments?tab=plan',
  })
  assert.deepEqual(JSON.parse(result.content[0]!.text), result.structuredContent)
  assert.equal(JSON.stringify(result).includes('private'), false)
})

test('a rejected tool cannot supply an external or escaped dashboard destination', () => {
  for (const dashboard_url of ['https://example.com/dashboard/kanpai', '//example.com/dashboard/kanpai', '/dashboard/../api/auth', '/dashboard/%2e%2e/api/auth']) {
    const result = mcpToolErrorResult('Blocked', { code: 'PLAN_REQUIRED', dashboard_url }, 'https://krabiclaw.com')
    assert.deepEqual(result.structuredContent, { code: 'PLAN_REQUIRED', message: 'Blocked' })
  }
})
