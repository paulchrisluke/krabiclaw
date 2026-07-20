import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { importJWK, SignJWT } from 'jose'
import { devLoginHeaders, isDeployedWorkerTarget } from './test-env'

const PRIVATE_CLIENT_TEST_KEY_ID = 'krabiclaw-cimd-e2e-rs256'
const PRIVATE_CLIENT_TEST_JWK = {
  kty: 'RSA',
  n: '0PJUgpQ_Fg1ArCJcwrncgB9r8EX2UVD7pvpNJN8d_E6n4c_yQ_LVC0jyzdAlWnRFXE2THja5mSMQ7ddEYBznURS563ki2qHbMxkkhsIvzR3BeWWOe_qhqWenjFx5le5VFZIg1kcUZ0nzR4IM8gX1BJSEERZUkydY5K584rv3dVVdWWhUwux1ES0gEqpjQle9iiRPQ6lU8lSpYLEI02rkjvtF7HB5wKtnr1wsTOA5hWLwaKnFKN-G4v5ITO0cFys9bN6024YL8bj4N7HvPA-uxDM7AjxHZkAZ9PE90v85QS3r49AysOQIOxM7pq9i3su_5kECwCcZuG9gddOGUOs1fw',
  e: 'AQAB',
  d: 'VAt1VMS-j2crQVHdD_JksCBzcUUi69hwMNzzVMZuMEOPIbRcFVrCuPRRvdlgfP7Ru2v0pi2K__7r209AUIyvupxkoEOsclaybd5KI-5N_epfHS5tXo8Uoahw63Ny8IzaKoAJt0cF_Pnw4i18eYlN4da_PIRH5pzoE6vfze-ffNDsN0QbPHLKdE3pwxkIl0h73pXtFK8PN6Et2efMRMBR9n7Mc1JhzgE64RgrPchC5RqTMioiEeNVvtgi-11-Is2gZFnbpNkbH8Fubm0PNg9wC6lnO2MnOOhUkwKx6yV1G16oytMjDUlQMxo1jaaS8p-duV4DbFDJBYM7yUhexvGtsQ',
  p: '8DfWJ-BCJxyv7v8_CLFph4Gj0OcgByIGey3uIMcO7NzCLHmWQmfQyI7seIGEZDLFnY6mj2ECJlUVgo56ZGxl6ur3V54NPVolAvQkw0jtTOPaL0k7UcGpQ4fdaOgAE7_6EpXQomsBqqS1ccc2FL0wkBTnpYCG8UHgEfutVW-j_Yk',
  q: '3qyL6Bq_cm4IRE3dMV4exCNihJwRAEqRJ5z6OGxq-W01AHNW7_mQ8-JIj_09qdJ6l9LripRpB4nmTrUcZf310ZcGAONr2jVLRtmbHuMJToLS0SffxSJiXNjIdn8SN5HFthO4rBKG-jUagwy3tsnIAsbfhLZOOulnQRINVFLAIMc',
  dp: 'y3YvsKS0w1X7-g09gYprHLgEXYt1yDTcknarrB2OGbc9y9fMGkC-STEtP0BMN2X9lV7e2rBK1tbYGjW9mtNpW5lamF6pTh7NHHxXqwRY4fhXtBdt4-iJCkbIlPN0JUZEdHtqNDc4OSW6_TzDJLu9pzvdnIOJSE0IkZK_FI8zsik',
  dq: 'a9C33SY2VD2amxfoZaLg2q8XYIYAZVe1eKy1KuSz1xlddF5kVcVMvglugOlpFfTnjuN9UJgTUqcecDWZDnkssNKjAYMcEYeEb0Wlqgrb0rvdP5BC9Lx1S-dbCKT2ORnH1SUvYYGHAVb9Az8BJOwGf_GzABsVPckNSaBn-9AlXrk',
  qi: 'Zz2Dyw9UFsy1TGuBur55ihvvutD2V6Q0GfaYjrfoQ9kWmWV3DTofW5jYcW3i0YelASgasxix11mqnoGu6TE1bdeJmOdp-9PUHaU5Cpnsd2BlmAy4PMsRxWFpJc6Qf6OaQ8dzDV3I-f921RYnWxU4QvjYLW9GbKli3x1UunSSaI4',
  alg: 'RS256',
} as const

function pkceChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

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

  test('ChatGPT-shaped CIMD uses private_key_jwt and rejects assertion replay', async ({ request, baseURL }) => {
    test.skip(isDeployedWorkerTarget(baseURL!), 'same-zone CIMD/JWKS self-fetch requires the public local tunnel')
    const devHeaders = devLoginHeaders()
    test.skip(!devHeaders, 'E2E_DEV_ROUTE_SECRET required for dev login')

    const loginRes = await request.get(`${baseURL}/api/dev/login?userId=oauth-private-cimd-e2e`, {
      headers: devHeaders,
      maxRedirects: 0,
    })
    expect(loginRes.status()).toBe(302)
    const cookieHeader = loginRes.headersArray()
      .filter(header => header.name.toLowerCase() === 'set-cookie')
      .map(header => header.value.split(';')[0])
      .join('; ')
    expect(cookieHeader).toBeTruthy()

    const clientId = `${baseURL}/api/auth/oauth2/test-private-client-metadata?nonce=${Date.now()}`
    const redirectUri = `${baseURL}/oauth/test-callback`
    const verifier = 'krabiclaw-private-cimd-e2e-verifier-0123456789'
    const authorizeParams = {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid offline_access tenant',
      state: 'private-first',
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      resource: `${baseURL}/api/mcp`,
    }

    const authorize = await request.get(oauthAuthorizeUrl(baseURL!, authorizeParams), {
      headers: { Cookie: cookieHeader },
      maxRedirects: 0,
    })
    expect(authorize.status()).toBe(302)
    const consentUrl = new URL(authorize.headers()['location']!, baseURL)
    expect(consentUrl.pathname).toBe('/oauth/consent')

    const consent = await request.post(`${baseURL}/api/auth/oauth2/consent`, {
      headers: { Cookie: cookieHeader, Origin: baseURL! },
      data: { accept: true, oauth_query: consentUrl.search.slice(1) },
    })
    expect(consent.status()).toBe(200)
    const consentBody = await consent.json() as { url: string }
    const code = new URL(consentBody.url).searchParams.get('code')
    expect(code).toBeTruthy()

    const now = Math.floor(Date.now() / 1000)
    const privateKey = await importJWK(PRIVATE_CLIENT_TEST_JWK, 'RS256')
    const assertion = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: PRIVATE_CLIENT_TEST_KEY_ID })
      .setIssuer(clientId)
      .setSubject(clientId)
      .setAudience(`${baseURL}/api/auth/oauth2/token`)
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .setJti(`cimd-replay-${crypto.randomUUID()}`)
      .sign(privateKey)

    const token = await request.post(`${baseURL}/api/auth/oauth2/token`, {
      headers: { Origin: baseURL! },
      form: {
        grant_type: 'authorization_code',
        client_id: clientId,
        code: code!,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
      },
    })
    expect(token.status()).toBe(200)
    expect((await token.json() as { access_token?: string }).access_token).toBeTruthy()

    const secondAuthorize = await request.get(oauthAuthorizeUrl(baseURL!, {
      ...authorizeParams,
      state: 'private-replay',
    }), { headers: { Cookie: cookieHeader }, maxRedirects: 0 })
    expect(secondAuthorize.status()).toBe(302)
    const replayCode = new URL(secondAuthorize.headers()['location']!, baseURL).searchParams.get('code')
    expect(replayCode).toBeTruthy()

    const replay = await request.post(`${baseURL}/api/auth/oauth2/token`, {
      headers: { Origin: baseURL! },
      form: {
        grant_type: 'authorization_code',
        client_id: clientId,
        code: replayCode!,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: assertion,
      },
    })
    expect(replay.status()).toBeGreaterThanOrEqual(400)
    const replayBody = await replay.json() as { error?: string, error_description?: string }
    expect(replayBody.error).toBeTruthy()
    expect(replayBody.error_description).toMatch(/assertion|replay|already/i)
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
