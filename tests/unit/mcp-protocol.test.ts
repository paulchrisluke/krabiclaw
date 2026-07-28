import assert from 'node:assert/strict'
import test from 'node:test'

import {
  asMcpError,
  MCP_ERROR,
  MCP_PROTOCOL_VERSION,
  mcpProtocolError,
  negotiatedMcpProtocolVersion,
  readMcpRequest,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../../server/utils/mcp-protocol.ts'

test('MCP protocol versions advertise only supported spec revisions', () => {
  assert.equal(MCP_PROTOCOL_VERSION, '2025-11-25')
  assert.deepEqual(SUPPORTED_PROTOCOL_VERSIONS, ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'])
  assert.equal(Array.from(SUPPORTED_PROTOCOL_VERSIONS).includes('2026-07-28'), false)
  assert.equal(Array.from(SUPPORTED_PROTOCOL_VERSIONS).includes('2025-11-25'), true)
})

test('negotiatedMcpProtocolVersion returns the client version when supported', () => {
  assert.equal(
    negotiatedMcpProtocolVersion({
      _meta: { 'io.modelcontextprotocol/version': '2025-11-25' },
    }),
    '2025-11-25',
  )
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

test('readMcpRequest defaults missing protocol version to the current server revision', () => {
  const event = {
    node: {
      req: {
        headers: {},
      },
    },
  } as unknown as Parameters<typeof readMcpRequest>[0]
  const request = readMcpRequest(event, {
    jsonrpc: '2.0',
    id: 'missing-version-call',
    method: 'tools/call',
    params: {
      name: 'list_sites',
      arguments: {},
    },
    _meta: {},
  })

  assert.equal(request.method, 'tools/call')
  assert.equal(request._meta?.['io.modelcontextprotocol/version'], MCP_PROTOCOL_VERSION)
})

test('readMcpRequest defaults notification requests without protocol metadata to the current server revision', () => {
  const event = {
    node: {
      req: {
        headers: {},
      },
    },
  } as unknown as Parameters<typeof readMcpRequest>[0]
  const request = readMcpRequest(event, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  })

  assert.equal(request.method, 'notifications/initialized')
  assert.equal(request._meta?.['io.modelcontextprotocol/version'], MCP_PROTOCOL_VERSION)
})

test('readMcpRequest rejects an explicitly unsupported protocol version', () => {
  const event = {
    node: {
      req: {
        headers: {
          'mcp-protocol-version': '2026-07-28',
        },
      },
    },
  } as unknown as Parameters<typeof readMcpRequest>[0]

  assert.throws(
    () => readMcpRequest(event, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }),
    /Unsupported MCP protocol version: 2026-07-28/,
  )
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
