import assert from 'node:assert/strict'
import test from 'node:test'

import { executeChowBotToolForTest } from '../../server/utils/chowbot-agent.ts'
import { CHOWBOT_CONFIRM_REQUIRED } from '../../server/utils/chowbot-tools/index.ts'
import { PRODUCTS_CHOWBOT_TOOLS } from '../../server/utils/chowbot-tools/products.ts'

const importTool = PRODUCTS_CHOWBOT_TOOLS.find(tool => tool.name === 'import_products_from_media')

test('ChowBot Product import requires explicit location and media asset scope plus confirmation', async () => {
  assert.ok(importTool)
  assert.deepEqual(importTool.input_schema.required, ['location_id', 'asset_id'])
  assert.equal(CHOWBOT_CONFIRM_REQUIRED.has('import_products_from_media'), true)

  const db = new Proxy({}, {
    get() {
      throw new Error('database must not be touched')
    },
  })
  const baseContext = {
    db,
    env: {},
    orgId: 'org-1',
    siteId: 'site-1',
    userId: 'user-1',
    memberId: 'member-1',
    userRole: 'owner',
  } as Parameters<typeof executeChowBotToolForTest>[2]

  const confirmation = await executeChowBotToolForTest(
    'import_products_from_media',
    { location_id: 'location-1', asset_id: 'asset-1' },
    { ...baseContext, agentMessages: [{ role: 'user', content: 'Import these Products.' }] },
  )
  assert.deepEqual(confirmation, {
    __requires_confirmation: true,
    message: 'Please confirm you want to import products from media.',
  })
})
