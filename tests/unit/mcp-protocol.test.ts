import assert from 'node:assert/strict'
import test from 'node:test'

import { asMcpError, MCP_ERROR, mcpProtocolError } from '../../server/utils/mcp-protocol.ts'

test('asMcpError maps a plain mcpProtocolError through unchanged', () => {
  const error = mcpProtocolError(MCP_ERROR.invalidParams, 'bad input')
  assert.deepEqual(asMcpError(error), { code: MCP_ERROR.invalidParams, message: 'bad input', data: undefined })
})

test('asMcpError maps an h3 createError with statusCode 400 to invalidParams (regression: server/utils/experiences.ts validation used createError, not mcpProtocolError, so tools/call leaked a raw HTTP 400 instead of isError:true)', () => {
  const h3Error = Object.assign(new Error('H3Error'), { statusCode: 400, statusMessage: 'location_id is required' })
  const mapped = asMcpError(h3Error)
  assert.equal(mapped.code, MCP_ERROR.invalidParams)
  assert.equal(mapped.message, 'location_id is required')
})

test('asMcpError leaves a non-400 h3 error (e.g. 404) as internal, not invalidParams', () => {
  const h3Error = Object.assign(new Error('Not found'), { statusCode: 404, statusMessage: 'Experience not found' })
  const mapped = asMcpError(h3Error)
  assert.notEqual(mapped.code, MCP_ERROR.invalidParams)
})

test('asMcpError falls back to internal for a plain Error', () => {
  const mapped = asMcpError(new Error('boom'))
  assert.equal(mapped.code, MCP_ERROR.internal)
  assert.equal(mapped.message, 'boom')
})
