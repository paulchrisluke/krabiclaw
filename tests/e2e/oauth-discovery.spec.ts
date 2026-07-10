import { expect, test } from '@playwright/test'
import { devLoginHeaders, isDeployedWorkerTarget } from './test-env'

function oauthAuthorizeUrl(baseURL: string, params: Record<string, string>) {
  return `${baseURL}/api/auth/oauth2/authorize?${new URLSearchParams(params).toString()}`
}

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
    expect(body.registration_endpoint).toBeUndefined()
    expect(body.client_id_metadata_document_supported).toBe(true)
  })

  test('/.well-known/oauth-authorization-server returns valid RFC 8414 document', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/.well-known/oauth-authorization-server`)
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body.issuer).toBe('string')
    expect(typeof body.authorization_endpoint).toBe('string')
    expect(typeof body.token_endpoint).toBe('string')
    expect(body.registration_endpoint).toBeUndefined()
    expect(body.client_id_metadata_document_supported).toBe(true)
    expect(Array.isArray(body.code_challenge_methods_supported)).toBe(true)
    expect((body.code_challenge_methods_supported as string[])).toContain('S256')
  })

  test('repeat authorize skips consent after remembered approval for the same CIMD client', async ({ request, baseURL }) => {
    // The CIMD client_id document (test-client-metadata) is served by this same
    // app/origin, so the auth server's fetch of it is a same-zone Worker
    // self-fetch on a deployed Cloudflare Worker. That self-fetch fails there
    // deterministically (reproduced directly via curl against preview.krabiclaw.com,
    // not a timeout — a Cloudflare Workers/zone-level restriction on a Worker's
    // own subrequest into its own route, not app logic). The same flow passes
    // reliably against a local dev server exposed through a real public tunnel
    // (see docs/local-mcp-harness.md), so this test is local-harness-only until
    // the CIMD test fixture is hosted off-zone or the platform restriction is
    // otherwise worked around.
    test.skip(isDeployedWorkerTarget(baseURL!), 'CIMD same-zone self-fetch is not supported on deployed Cloudflare Workers — verify via the local MCP tunnel harness instead')

    const devHeaders = devLoginHeaders()
    test.skip(!devHeaders, 'E2E_DEV_ROUTE_SECRET required for dev login')

    const loginRes = await request.get(`${baseURL}/api/dev/login?userId=oauth-cimd-e2e`, {
      headers: devHeaders,
      maxRedirects: 0,
    })
    expect(loginRes.status()).toBe(302)

    const cookies = (loginRes.headersArray() ?? [])
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value.split(';')[0])
    expect(cookies.length).toBeGreaterThan(0)
    const cookieHeader = cookies.join('; ')

    const cimdClientId = `${baseURL}/api/auth/oauth2/test-client-metadata?nonce=${Date.now()}`
    const redirectUri = `${baseURL}/oauth/test-callback`
    const authorizeParams = {
      client_id: cimdClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid offline_access tenant',
      state: 'first-pass',
      code_challenge: 'test-challenge-s256',
      code_challenge_method: 'S256',
      resource: `${baseURL}/api/mcp`,
    }

    const firstAuthorize = await request.get(oauthAuthorizeUrl(baseURL!, authorizeParams), {
      headers: { Cookie: cookieHeader },
      maxRedirects: 0,
    })
    expect(firstAuthorize.status()).toBe(302)
    const consentLocation = firstAuthorize.headers()['location']
    expect(consentLocation).toContain('/oauth/consent?')

    const consentUrl = new URL(consentLocation!, baseURL)
    const oauthQuery = consentUrl.search.slice(1)

    const consentRes = await request.post(`${baseURL}/api/auth/oauth2/consent`, {
      headers: {
        Cookie: cookieHeader,
        Origin: baseURL!,
      },
      data: {
        accept: true,
        oauth_query: oauthQuery,
      },
    })
    expect(consentRes.status()).toBe(200)
    const consentBody = await consentRes.json() as { url?: string }
    expect(consentBody.url).toBeTruthy()
    const consentRedirect = new URL(consentBody.url!)
    expect(consentRedirect.searchParams.get('code')).toBeTruthy()

    const secondAuthorize = await request.get(oauthAuthorizeUrl(baseURL!, {
      ...authorizeParams,
      state: 'second-pass',
    }), {
      headers: { Cookie: cookieHeader },
      maxRedirects: 0,
    })
    expect(secondAuthorize.status()).toBe(302)
    const secondLocation = secondAuthorize.headers()['location']
    expect(secondLocation).toBeTruthy()
    expect(secondLocation).not.toContain('/oauth/consent?')

    const secondRedirect = new URL(secondLocation!, baseURL)
    expect(secondRedirect.origin + secondRedirect.pathname).toBe(redirectUri)
    expect(secondRedirect.searchParams.get('code')).toBeTruthy()
    expect(secondRedirect.searchParams.get('state')).toBe('second-pass')
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
