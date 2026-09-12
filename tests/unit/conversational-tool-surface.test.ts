import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMcpToolForConversationalSurface } from '../../server/utils/conversational-tool-surface.ts'

describe('conversational tool surface policy', () => {
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
