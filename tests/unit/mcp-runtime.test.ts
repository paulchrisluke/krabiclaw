import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

// Shared MCP transport plumbing extracted from mcp.post.ts/mcp/platform.post.ts
// (issue: two 500-700+ line route files duplicating identical request/response
// shaping made it easy for the two surfaces to silently drift). These tests
// exercise the shared functions directly rather than through a full route,
// mocking only requireMcpUser (DB-backed) — everything else is real h3/
// mcp-protocol/mcp-route-helpers code running against a fake H3Event.

let requireMcpUserResult: { userId: string; oauthClientId: string | null } | { throw: unknown }

mock.module('../../server/utils/mcp-auth.ts', {
  namedExports: {
    requireMcpUser: async () => {
      if ('throw' in requireMcpUserResult) throw requireMcpUserResult.throw
      return requireMcpUserResult
    },
  },
})

const {
  dispatchStandardMcpMethod,
  resolveMissingMcpCredential,
  respondToMcpError,
  unsupportedMcpMethodError,
} = await import('../../server/utils/mcp-runtime.ts')
const { mcpProtocolError, MCP_ERROR, readMcpRequest } = await import('../../server/utils/mcp-protocol.ts')

function fakeEvent(headers: Record<string, string> = {}) {
  const responseHeaders: Record<string, string> = {}
  return {
    node: {
      req: { headers },
      res: {
        statusCode: 200,
        setHeader: (name: string, value: string) => { responseHeaders[name.toLowerCase()] = value },
      },
    },
    path: '/api/mcp',
    _responseHeaders: responseHeaders,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const runtimeDeps = {
  authOptions: { audiences: ['https://example.com/api/mcp'], requiredScopes: ['tenant'] },
  resourceMetadataUrl: (baseUrl: string) => `${baseUrl}/.well-known/oauth-protected-resource`,
  authDescription: 'Connect to continue.',
  authRequiredText: 'Authentication required: connect to continue.',
  logEvent: mock.fn(),
  resolveToolMeta: (toolName: string | null) => ({ domain: toolName ? 'content' : null, isMutating: toolName === 'set_thing' }),
}

test.beforeEach(() => {
  requireMcpUserResult = { userId: 'user-1', oauthClientId: null }
  runtimeDeps.logEvent.mock.resetCalls()
})

test('resolveMissingMcpCredential: no bearer token or cookie on a tools/call request returns an embedded 200 auth-required result, not a raw 401', async () => {
  const event = fakeEvent()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).readBody = async () => ({ id: 'req-1', method: 'tools/call', params: { name: 'set_thing' } })

  const result = await resolveMissingMcpCredential(event, runtimeDeps, 'https://example.com')

  assert.equal(result.handled, true)
  if (!result.handled) throw new Error('expected handled')
  assert.equal(result.requestId, 'req-1')
  assert.equal(result.requestMethod, 'tools/call')
  assert.equal(result.requestToolName, 'set_thing')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = result.response as any
  assert.equal(response.result.isError, true)
  assert.ok(response.result._meta['mcp/www_authenticate'][0].includes('error="invalid_token"'))
  assert.equal(event.node.res.statusCode, 200)

  const logged = runtimeDeps.logEvent.mock.calls[0]?.arguments[1] as Record<string, unknown>
  assert.equal(logged.status, 'auth_required')
  assert.equal(logged.toolDomain, 'content')
})

test('resolveMissingMcpCredential: no bearer token or cookie on a non-tools/call request returns a raw 401 with WWW-Authenticate', async () => {
  const event = fakeEvent()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).readBody = async () => ({ id: 'req-2', method: 'resources/list' })

  const result = await resolveMissingMcpCredential(event, runtimeDeps, 'https://example.com')

  assert.equal(result.handled, true)
  if (!result.handled) throw new Error('expected handled')
  assert.equal(event.node.res.statusCode, 401)
  assert.ok(event._responseHeaders['www-authenticate']?.includes('resource_metadata='))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal((result.response as any).error.code, MCP_ERROR.invalidRequest)
  assert.equal(runtimeDeps.logEvent.mock.calls.length, 0, 'non-tools/call credential_missing is not logged to telemetry')
})

test('resolveMissingMcpCredential: a bearer token present means "not handled here" — caller proceeds to the real request', async () => {
  const event = fakeEvent({ authorization: 'Bearer abc' })
  const result = await resolveMissingMcpCredential(event, runtimeDeps, 'https://example.com')
  assert.deepEqual(result, { handled: false })
})

test('resolveMissingMcpCredential: a cookie present (browser/session caller) also means "not handled here"', async () => {
  const event = fakeEvent({ cookie: 'session=x' })
  const result = await resolveMissingMcpCredential(event, runtimeDeps, 'https://example.com')
  assert.deepEqual(result, { handled: false })
})

const renderCalls: Array<{ name: string; args: Record<string, string> }> = []
const catalog = {
  resources: { list: [{ uri: 'kc://a' }], read: async (uri: string) => ({ uri, text: 'content' }) },
  prompts: {
    list: [{ name: 'p1' }],
    render: (name: string, args: Record<string, string>) => {
      renderCalls.push({ name, args })
      return { description: name, text: 'rendered' }
    },
  },
  discover: { serverName: 'test-mcp', serverVersion: 'v1', instructions: 'test instructions' },
}

test('dispatchStandardMcpMethod: ping is unauthenticated and does not call requireMcpUser', async () => {
  requireMcpUserResult = { throw: new Error('requireMcpUser should not be called for ping') }
  const event = fakeEvent()
  const request = readMcpRequest(event, { jsonrpc: '2.0', id: 1, method: 'ping', _meta: { 'io.modelcontextprotocol/version': '2025-06-18' } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await dispatchStandardMcpMethod(event, request, runtimeDeps, catalog) as any
  assert.deepEqual(response.result, {})
})

test('dispatchStandardMcpMethod: resources/list requires auth and returns the injected catalog', async () => {
  const event = fakeEvent()
  const request = readMcpRequest(event, { jsonrpc: '2.0', id: 2, method: 'resources/list', _meta: { 'io.modelcontextprotocol/version': '2025-06-18' } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await dispatchStandardMcpMethod(event, request, runtimeDeps, catalog) as any
  assert.deepEqual(response.result.resources, [{ uri: 'kc://a' }])
})

test('dispatchStandardMcpMethod: resources/list propagates a requireMcpUser rejection (fails closed, does not silently list)', async () => {
  requireMcpUserResult = { throw: Object.assign(new Error('Authentication required'), { statusCode: 401 }) }
  const event = fakeEvent()
  const request = readMcpRequest(event, { jsonrpc: '2.0', id: 3, method: 'resources/list', _meta: { 'io.modelcontextprotocol/version': '2025-06-18' } })
  await assert.rejects(() => dispatchStandardMcpMethod(event, request, runtimeDeps, catalog), /Authentication required/)
})

test('dispatchStandardMcpMethod: prompts/get renders with only string arguments accepted', async () => {
  renderCalls.length = 0
  const event = fakeEvent()
  const request = readMcpRequest(event, {
    jsonrpc: '2.0', id: 4, method: 'prompts/get',
    params: { name: 'p1', arguments: { a: 'x', b: 5 } },
    _meta: { 'io.modelcontextprotocol/version': '2025-06-18' },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await dispatchStandardMcpMethod(event, request, runtimeDeps, catalog) as any
  assert.equal(response.result.description, 'p1')
  assert.deepEqual(renderCalls, [{ name: 'p1', args: { a: 'x' } }])
})

test('dispatchStandardMcpMethod: an unrecognized method returns undefined so the caller falls through', async () => {
  const event = fakeEvent()
  const request = readMcpRequest(event, { jsonrpc: '2.0', id: 5, method: 'tools/list', _meta: { 'io.modelcontextprotocol/version': '2025-06-18' } })
  const response = await dispatchStandardMcpMethod(event, request, runtimeDeps, catalog)
  assert.equal(response, undefined)
})

test('unsupportedMcpMethodError produces a methodNotFound protocol error', () => {
  const error = unsupportedMcpMethodError('bad/method')
  assert.deepEqual(error, mcpProtocolError(MCP_ERROR.methodNotFound, 'Unsupported MCP method: bad/method', undefined, 'protocol'))
})

const errorRuntimeDeps = {
  requestId: 'req-9',
  requestMethod: 'tools/call',
  requestToolName: 'set_thing',
  requestToolArgs: { site_id: 'site-1' },
  baseUrl: 'https://example.com',
  resourceMetadataUrl: runtimeDeps.resourceMetadataUrl,
  authDescription: runtimeDeps.authDescription,
  authRequiredText: runtimeDeps.authRequiredText,
  logEvent: runtimeDeps.logEvent,
  resolveToolMeta: runtimeDeps.resolveToolMeta,
}

test('respondToMcpError: an auth-kind error on tools/call returns an embedded 200 auth-required result and logs auth_required telemetry', async () => {
  const event = fakeEvent()
  const authError = Object.assign(new Error('Authentication required.'), {
    statusCode: 401,
    data: { mcpAuth: { error: 'invalid_token', description: 'Token expired' } },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = respondToMcpError(event, authError, errorRuntimeDeps) as any
  assert.equal(response.result.isError, true)
  assert.equal(event.node.res.statusCode, 200)

  const logged = runtimeDeps.logEvent.mock.calls.at(-1)?.arguments[1] as Record<string, unknown>
  assert.equal(logged.status, 'auth_required')
  assert.equal(logged.toolDomain, 'content')
})

test('respondToMcpError: an auth-kind error on a non-tools/call method sends a raw error response with WWW-Authenticate, not an embedded result', async () => {
  const event = fakeEvent()
  const authError = Object.assign(new Error('Authentication required.'), { statusCode: 401 })
  respondToMcpError(event, authError, { ...errorRuntimeDeps, requestMethod: 'resources/list' })
  assert.equal(event.node.res.statusCode, 401)
  assert.ok(event._responseHeaders['www-authenticate']?.includes('resource_metadata='))
})

test('respondToMcpError: a forbidden (insufficient-role) error on tools/call returns a tool error result, not an HTTP 403', async () => {
  const event = fakeEvent()
  const forbiddenError = mcpProtocolError(MCP_ERROR.internal, 'Insufficient permissions', undefined, 'forbidden')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = respondToMcpError(event, forbiddenError, errorRuntimeDeps) as any
  assert.equal(response.result.isError, true)
  assert.equal(response.result.content[0].text, 'Insufficient permissions')
  assert.equal(event.node.res.statusCode, 200)
})

test('respondToMcpError: a generic tool_execution error on tools/call still logs telemetry with status "error", not "auth_required"', async () => {
  const event = fakeEvent()
  const genericError = mcpProtocolError(MCP_ERROR.internal, 'Something broke')
  respondToMcpError(event, genericError, errorRuntimeDeps)
  const logged = runtimeDeps.logEvent.mock.calls.at(-1)?.arguments[1] as Record<string, unknown>
  assert.equal(logged.status, 'error')
  assert.equal(logged.isMutating, true)
})

test('respondToMcpError: no telemetry is logged for non-tools/call methods (matches the pre-unification behavior of both route files)', async () => {
  const event = fakeEvent()
  const genericError = mcpProtocolError(MCP_ERROR.internal, 'Something broke')
  respondToMcpError(event, genericError, { ...errorRuntimeDeps, requestMethod: 'resources/list' })
  assert.equal(runtimeDeps.logEvent.mock.calls.length, 0)
})
