import assert from 'node:assert/strict'
import test from 'node:test'

import {
  asMcpError,
  MCP_ERROR,
  mcpProtocolError,
} from '../../server/utils/mcp-protocol.ts'

// JSON-RPC envelope parsing, protocol-version negotiation, and JSON-RPC
// argument-shape validation moved to @modelcontextprotocol/server (see
// server/api/mcp.post.ts) — that coverage now lives in the e2e suite
// (tests/e2e/mcp-*.spec.ts, tests/e2e/oauth-discovery.spec.ts) against the
// real SDK behavior rather than as unit tests of hand-rolled parsing here.
// asMcpError/mcpProtocolError remain ours: every tool executor throws
// through this shape regardless of transport.

test('asMcpError maps a plain mcpProtocolError through unchanged', () => {
  const error = mcpProtocolError(MCP_ERROR.invalidParams, 'bad input')
  assert.deepEqual(asMcpError(error), { code: MCP_ERROR.invalidParams, message: 'bad input', data: undefined, kind: 'tool_execution' })
})

test('asMcpError maps an h3 createError with statusCode 400 to invalidParams (regression: server/utils/experiences.ts validation used createError, not mcpProtocolError, so tools/call leaked a raw HTTP 400 instead of isError:true)', () => {
  const h3Error = Object.assign(new Error('H3Error'), { statusCode: 400, statusMessage: 'location_id is required' })
  const mapped = asMcpError(h3Error)
  assert.equal(mapped.code, MCP_ERROR.invalidParams)
  assert.equal(mapped.message, 'location_id is required')
})

test('asMcpError maps an h3 createError with statusCode 404 to invalidParams so tools/call can return isError:true', () => {
  const h3Error = Object.assign(new Error('Not found'), { statusCode: 404, statusMessage: 'Experience not found' })
  const mapped = asMcpError(h3Error)
  assert.equal(mapped.code, MCP_ERROR.invalidParams)
  assert.equal(mapped.message, 'Experience not found')
  assert.equal(mapped.kind, 'tool_execution')
})

test('asMcpError falls back to internal for a plain Error', () => {
  const mapped = asMcpError(new Error('boom'))
  assert.equal(mapped.code, MCP_ERROR.internal)
  assert.equal(mapped.message, 'boom')
})

test('asMcpError maps statusCode 403 to forbidden rather than auth', () => {
  const forbidden = Object.assign(new Error('Forbidden'), { statusCode: 403 })
  const mapped = asMcpError(forbidden)
  assert.equal(mapped.kind, 'forbidden')
  assert.equal(mapped.code, MCP_ERROR.internal)
})
