import { expect, test } from '@playwright/test'
import { devLoginHeaders } from './test-env'

test.describe('OAuth discovery endpoints', () => {
  test('/.well-known/oauth-protected-resource returns valid document', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/.well-known/oauth-protected-resource`)
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.resource).toBe(`${baseURL}/api/mcp`)
    expect(Array.isArray(body.authorization_servers)).toBe(true)
    expect((body.authorization_servers as string[]).length).toBeGreaterThan(0)
    expect(Array.isArray(body.bearer_methods_supported)).toBe(true)
    expect((body.bearer_methods_supported as string[])).toContain('header')
  })

  test('/.well-known/oauth-protected-resource/platform-mcp returns valid document', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/.well-known/oauth-protected-resource/platform-mcp`)
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.resource).toBe(`${baseURL}/api/mcp/platform`)
    expect(Array.isArray(body.authorization_servers)).toBe(true)
    expect((body.authorization_servers as string[]).length).toBeGreaterThan(0)
    expect(Array.isArray(body.bearer_methods_supported)).toBe(true)
    expect((body.bearer_methods_supported as string[])).toContain('header')
  })

  test('/.well-known/openid-configuration returns valid document', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/.well-known/openid-configuration`)
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body.issuer).toBe('string')
    expect(typeof body.authorization_endpoint).toBe('string')
    expect(typeof body.token_endpoint).toBe('string')
    expect(typeof body.jwks_uri).toBe('string')
    expect(typeof body.registration_endpoint).toBe('string')
    expect(body.client_id_metadata_document_supported).not.toBe(true)
  })

  test('/.well-known/oauth-authorization-server returns valid RFC 8414 document', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/.well-known/oauth-authorization-server`)
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body.issuer).toBe('string')
    expect(typeof body.authorization_endpoint).toBe('string')
    expect(typeof body.token_endpoint).toBe('string')
    expect(typeof body.registration_endpoint).toBe('string')
    expect(body.client_id_metadata_document_supported).not.toBe(true)
    expect(Array.isArray(body.code_challenge_methods_supported)).toBe(true)
    expect((body.code_challenge_methods_supported as string[])).toContain('S256')
  })

  test('unauthenticated MCP request returns 401 with WWW-Authenticate header', async ({ request, baseURL }) => {
    const MCP_VERSION = '2026-07-28'
    const res = await request.post(`${baseURL}/api/mcp`, {
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': MCP_VERSION,
        'mcp-method': 'server/discover',
      },
      data: {
        jsonrpc: '2.0',
        id: 'auth-check',
        method: 'server/discover',
        params: {},
        _meta: {
          'io.modelcontextprotocol/version': MCP_VERSION,
          'io.modelcontextprotocol/method': 'server/discover',
        },
      },
    })
    expect(res.status()).toBe(401)
    const wwwAuth = res.headers()['www-authenticate']
    expect(wwwAuth).toBeTruthy()
    expect(wwwAuth).toContain('Bearer')
    expect(wwwAuth).toContain('resource_metadata=')
    expect(wwwAuth).toContain('/.well-known/oauth-protected-resource')
  })

  test('unauthenticated MCP tool call returns mcp/www_authenticate challenge', async ({ request, baseURL }) => {
    const MCP_VERSION = '2026-07-28'
    const res = await request.post(`${baseURL}/api/mcp`, {
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': MCP_VERSION,
        'mcp-method': 'tools/call',
        'mcp-name': 'list_sites',
      },
      data: {
        jsonrpc: '2.0',
        id: 'auth-tool-check',
        method: 'tools/call',
        params: {
          name: 'list_sites',
          arguments: {},
        },
        _meta: {
          'io.modelcontextprotocol/version': MCP_VERSION,
          'io.modelcontextprotocol/method': 'tools/call',
          'io.modelcontextprotocol/name': 'list_sites',
        },
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json() as {
      result?: {
        isError?: boolean
        _meta?: Record<string, unknown>
      }
    }
    expect(body.result?.isError).toBe(true)
    const challenge = (body.result?._meta?.['mcp/www_authenticate'] as string[] | undefined)?.[0]
    expect(challenge).toContain('resource_metadata=')
    expect(challenge).toContain('error="invalid_token"')
    expect(challenge).toContain('error_description=')
  })

  test('unauthenticated platform MCP request returns platform WWW-Authenticate header', async ({ request, baseURL }) => {
    const MCP_VERSION = '2026-07-28'
    const res = await request.post(`${baseURL}/api/mcp/platform`, {
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': MCP_VERSION,
        'mcp-method': 'server/discover',
      },
      data: {
        jsonrpc: '2.0',
        id: 'platform-auth-check',
        method: 'server/discover',
        params: {},
        _meta: {
          'io.modelcontextprotocol/version': MCP_VERSION,
          'io.modelcontextprotocol/method': 'server/discover',
        },
      },
    })
    expect(res.status()).toBe(401)
    const wwwAuth = res.headers()['www-authenticate']
    expect(wwwAuth).toBeTruthy()
    expect(wwwAuth).toContain('/.well-known/oauth-protected-resource/platform-mcp')
  })

  test('unauthenticated tenant and platform MCP tool calls are logged to mcp telemetry', async ({ request, baseURL }) => {
    const MCP_VERSION = '2026-07-28'
    const since = new Date().toISOString()

    const tenantRes = await request.post(`${baseURL}/api/mcp`, {
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': MCP_VERSION,
        'mcp-method': 'tools/call',
        'mcp-name': 'list_sites',
      },
      data: {
        jsonrpc: '2.0',
        id: 'telemetry-tenant-auth-check',
        method: 'tools/call',
        params: {
          name: 'list_sites',
          arguments: {},
        },
        _meta: {
          'io.modelcontextprotocol/version': MCP_VERSION,
          'io.modelcontextprotocol/method': 'tools/call',
          'io.modelcontextprotocol/name': 'list_sites',
        },
      },
    })
    expect(tenantRes.status()).toBe(200)

    const platformRes = await request.post(`${baseURL}/api/mcp/platform`, {
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': MCP_VERSION,
        'mcp-method': 'tools/call',
        'mcp-name': 'get_platform_context',
      },
      data: {
        jsonrpc: '2.0',
        id: 'telemetry-platform-auth-check',
        method: 'tools/call',
        params: {
          name: 'get_platform_context',
          arguments: {},
        },
        _meta: {
          'io.modelcontextprotocol/version': MCP_VERSION,
          'io.modelcontextprotocol/method': 'tools/call',
          'io.modelcontextprotocol/name': 'get_platform_context',
        },
      },
    })
    expect(platformRes.status()).toBe(200)

    await expect.poll(async () => {
      const res = await request.get(
        `${baseURL}/api/dev/mcp-telemetry?since=${encodeURIComponent(since)}&method=tools%2Fcall&status=auth_required&limit=20`,
        { headers: devLoginHeaders() },
      )
      expect(res.status()).toBe(200)
      const body = await res.json() as {
        events: Array<{ mcp_surface: string; tool_name: string; status: string; error_message: string | null }>
      }
      return body.events.map((event) => `${event.mcp_surface}:${event.tool_name}:${event.status}:${event.error_message ?? ''}`)
    }).toEqual(expect.arrayContaining([
      'client:list_sites:auth_required:credential_missing: missing bearer token or cookie',
      'platform:get_platform_context:auth_required:credential_missing: missing bearer token or cookie',
    ]))
  })
})
