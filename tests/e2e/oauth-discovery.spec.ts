import { expect, test } from '@playwright/test'

test.describe('OAuth discovery endpoints', () => {
  test('/.well-known/oauth-protected-resource returns valid document', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/.well-known/oauth-protected-resource`)
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.resource).toMatch(/\/api\/mcp$/)
    expect(Array.isArray(body.authorization_servers)).toBe(true)
    expect((body.authorization_servers as string[]).length).toBeGreaterThan(0)
    expect(body.bearer_methods_supported).toContain('header')
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
    expect(res.status()).toBe(401)
    const body = await res.json() as {
      result?: {
        isError?: boolean
        _meta?: Record<string, unknown>
      }
    }
    expect(body.result?.isError).toBe(true)
    const challenge = (body.result?._meta?.['mcp/www_authenticate'] as string[] | undefined)?.[0]
    expect(challenge).toContain('resource_metadata=')
    expect(challenge).toContain('error=')
    expect(challenge).toContain('error_description=')
  })
})
