import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertConversationalToolEnabled,
  filterConversationalTools,
  isConversationalToolEnabled,
  normalizeMcpToolForConversationalSurface,
} from '../../server/utils/conversational-tool-surface.ts'

describe('conversational tool surface policy', () => {
  test('hides experimental conversational groups by default', () => {
    assert.equal(isConversationalToolEnabled('start_translation_job'), false)
    assert.equal(isConversationalToolEnabled('get_site_domains'), false)
    assert.equal(isConversationalToolEnabled('create_work_request'), false)
    assert.equal(isConversationalToolEnabled('publish_to_facebook'), false)
    assert.equal(isConversationalToolEnabled('update_menu_item'), true)
  })

  test('enables a group only through its explicit env flag', () => {
    const env = { CONVERSATIONAL_TOOLS_TRANSLATIONS_ENABLED: 'true' }

    assert.equal(isConversationalToolEnabled('start_translation_job', env), true)
    assert.equal(isConversationalToolEnabled('get_site_domains', env), false)
  })

  test('filters mixed tool lists consistently', () => {
    const tools = [
      { name: 'update_menu_item' },
      { name: 'start_translation_job' },
      { name: 'get_site_domains' },
    ]

    assert.deepEqual(filterConversationalTools(tools).map((tool) => tool.name), ['update_menu_item'])
  })

  test('blocks stale calls to hidden tools', () => {
    assert.throws(
      () => assertConversationalToolEnabled('sync_google_business_locations'),
      /CONVERSATIONAL_TOOLS_SOCIAL_PUBLISHING_ENABLED/,
    )
  })

  test('narrows publish_post social channels while social publishing is disabled', () => {
    const tool = normalizeMcpToolForConversationalSurface({
      name: 'publish_post',
      description: 'Publish a post.',
      inputSchema: {
        type: 'object',
        properties: {
          post_id: { type: 'string' },
          channels: { type: 'array', items: { type: 'string', enum: ['site', 'facebook'] } },
        },
      },
    })

    const channels = tool.inputSchema?.properties?.channels as { items?: { enum?: string[] } }
    assert.deepEqual(channels.items?.enum, ['site'])
    assert.match(tool.description ?? '', /dashboard/)
  })
})
