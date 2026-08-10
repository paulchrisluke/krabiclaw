import test from 'node:test'
import assert from 'node:assert/strict'

import { isSiteCreationResponse } from '../../utils/site-creation-response.ts'

test('ChowBot site-creation validation accepts the POST /api/sites response contract', () => {
  assert.equal(isSiteCreationResponse({
    siteId: 'site-created',
    organizationId: 'org-created',
    subdomain: 'new-site',
  }), true)
  assert.equal(isSiteCreationResponse({ site: { id: 'site-created' } }), false)
  assert.equal(isSiteCreationResponse({ siteId: 42 }), false)
})
