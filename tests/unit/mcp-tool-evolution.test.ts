import assert from 'node:assert/strict'
import test from 'node:test'

import { catalogFingerprint } from '../../server/utils/mcp-catalog.ts'
import { mcpHttpStatusForError } from '../../server/utils/mcp-http-response.ts'
import { MCP_ERROR } from '../../server/utils/mcp-protocol.ts'
import { PLATFORM_MCP_TOOLS, PLATFORM_PUBLIC_MCP_TOOLS } from '../../server/utils/platform-mcp-tools.ts'
import { MCP_RELEASED_TOOLS } from '../../server/utils/mcp-released-tools.ts'

test('hidden compatibility adapters are intentionally limited by surface', () => {
  assert.equal(PLATFORM_PUBLIC_MCP_TOOLS.some(tool => tool.name === 'update_platform_blog_post'), false)
  assert.equal(PLATFORM_MCP_TOOLS.some(tool => tool.name === 'update_platform_blog_post'), true)
})

test('released-tool manifest distinguishes retained adapters from retired stale tools', () => {
  const platformBlog = MCP_RELEASED_TOOLS.find(entry => entry.surface === 'platform' && entry.name === 'update_platform_blog_post')
  assert.equal(platformBlog?.status, 'deprecated')
  assert.deepEqual(platformBlog?.replacementTools, ['update_platform_blog_metadata', 'replace_platform_blog_content'])
  assert.ok(platformBlog?.compatibilityHandler)
})

test('routine JSON-RPC errors map to HTTP 200, not transport errors', () => {
  assert.equal(mcpHttpStatusForError({ code: MCP_ERROR.methodNotFound, message: 'Unsupported', kind: 'protocol' }), 200)
  assert.equal(mcpHttpStatusForError({ code: MCP_ERROR.invalidParams, message: 'Unknown tool', kind: 'protocol' }), 200)
  assert.equal(mcpHttpStatusForError({ code: MCP_ERROR.invalidParams, message: 'Bad argument', kind: 'tool_execution' }), 200)
  assert.equal(mcpHttpStatusForError({ code: MCP_ERROR.internal, message: 'Auth', kind: 'auth' }), 401)
  assert.equal(mcpHttpStatusForError({ code: MCP_ERROR.internal, message: 'Forbidden', kind: 'forbidden' }), 403)
})

test('catalog fingerprints ignore tool order and description text', () => {
  const base = [
    {
      name: 'b',
      description: 'old',
      inputSchema: { type: 'object', properties: { z: { type: 'string' }, a: { type: 'number' } } },
      outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    },
    {
      name: 'a',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
    },
  ]
  const changedDescriptionsAndOrder = [
    { ...base[1], description: 'new' },
    { ...base[0], description: 'newer' },
  ]
  assert.equal(catalogFingerprint(base), catalogFingerprint(changedDescriptionsAndOrder))
})
