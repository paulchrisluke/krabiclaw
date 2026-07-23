import assert from 'node:assert/strict'
import test from 'node:test'

import {
  asMcpError,
  MCP_ERROR,
  MCP_PROTOCOL_VERSION,
  mcpProtocolError,
  negotiatedMcpProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../../server/utils/mcp-protocol.ts'

test('MCP protocol versions advertise only supported spec revisions', () => {
  assert.equal(MCP_PROTOCOL_VERSION, '2025-06-18')
  assert.deepEqual(SUPPORTED_PROTOCOL_VERSIONS, ['2025-06-18', '2025-03-26', '2024-11-05'])
  assert.equal(Array.from(SUPPORTED_PROTOCOL_VERSIONS).includes('2026-07-28'), false)
  assert.equal(Array.from(SUPPORTED_PROTOCOL_VERSIONS).includes('2025-11-25'), false)
})

test('negotiatedMcpProtocolVersion returns the client version when supported', () => {
  assert.equal(
    negotiatedMcpProtocolVersion({
      _meta: { 'io.modelcontextprotocol/version': '2025-03-26' },
    }),
    '2025-03-26',
  )
})

test('negotiatedMcpProtocolVersion falls back to the current server revision', () => {
  assert.equal(negotiatedMcpProtocolVersion({ _meta: {} }), MCP_PROTOCOL_VERSION)
})

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
