import assert from 'node:assert/strict'
import test from 'node:test'

import { executeChowBotToolForTest } from '../../server/utils/chowbot-agent.ts'
import { CHOWBOT_CONFIRM_REQUIRED } from '../../server/utils/chowbot-tools/index.ts'
import { MEDIA_CHOWBOT_TOOLS } from '../../server/utils/chowbot-tools/media.ts'

const importTool = MEDIA_CHOWBOT_TOOLS.find(tool => tool.name === 'import_menu_from_media')

test('ChowBot menu import requires a menu name and explicit confirmation', async () => {
  assert.ok(importTool)
  assert.deepEqual(importTool.input_schema.required, ['menu_name'])
  assert.equal(CHOWBOT_CONFIRM_REQUIRED.has('import_menu_from_media'), true)

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
    pendingMedia: { assetId: 'asset-1', siteId: 'site-1' },
  } as Parameters<typeof executeChowBotToolForTest>[2]

  const confirmation = await executeChowBotToolForTest(
    'import_menu_from_media',
    { menu_name: 'Dinner' },
    { ...baseContext, agentMessages: [{ role: 'user', content: 'Import this menu.' }] },
  )
  assert.deepEqual(confirmation, {
    __requires_confirmation: true,
    message: 'Please confirm you want to import menu from media.',
  })

  const missingName = await executeChowBotToolForTest(
    'import_menu_from_media',
    {},
    { ...baseContext, agentMessages: [{ role: 'user', content: 'Yes, proceed.' }] },
  )
  assert.deepEqual(missingName, { error: 'menu_name is required.' })
})
