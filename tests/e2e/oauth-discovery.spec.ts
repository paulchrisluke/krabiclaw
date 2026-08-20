import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { decodeProtectedHeader, importJWK, SignJWT } from 'jose'
import { loginAs } from './helpers/auth'

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

function oauthMetadataBaseURL(baseURL: string) {
  return (process.env.BETTER_AUTH_URL || baseURL).replace(/\/$/, '')
}

test.describe('OAuth discovery endpoints', () => {
  test('/.well-known/oauth-protected-resource returns valid document', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/.well-known/oauth-protected-resource`)
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.resource).toBe(`${oauthMetadataBaseURL(baseURL!)}/api/mcp`)
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
    expect(Array.isArray(body.id_token_signing_alg_values_supported)).toBe(true)
    // OpenID Connect Discovery requires RS256 support. ChatGPT validates the
    // ID token after code exchange and will abort before MCP initialize when
    // the provider advertises only Better Auth's EdDSA default.
    expect(body.id_token_signing_alg_values_supported as string[]).toContain('RS256')
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

  test('public CIMD exchanges an authorization code once and reuses remembered consent', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, 'user-e2e-oauth-cimd')

    const cimdClientId = process.env.MCP_CIMD_CLIENT_URL || `${baseURL}/api/auth/oauth2/test-client-metadata?nonce=${Date.now()}`
    const redirectUri = new URL('/oauth/test-callback', cimdClientId).toString()
    const verifier = 'krabiclaw-public-cimd-e2e-verifier-0123456789'
    const authorizeParams = {
      client_id: cimdClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid offline_access tenant',
      state: 'first-pass',
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      resource: `${baseURL}/api/mcp`,
    }

    const firstAuthorize = await request.get(oauthAuthorizeUrl(baseURL!, {
      ...authorizeParams,
      prompt: 'consent',
    }), { maxRedirects: 0 })
    expect(firstAuthorize.status()).toBe(302)
    const consentLocation = firstAuthorize.headers()['location']
    expect(consentLocation).toContain('/oauth/consent?')

    const consentUrl = new URL(consentLocation!, baseURL)
    const oauthQuery = consentUrl.search.slice(1)

    const consentRes = await request.post(`${baseURL}/api/auth/oauth2/consent`, {
      headers: {
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
    const code = consentRedirect.searchParams.get('code')
    expect(code).toBeTruthy()

    const exchangeCode = async () => await request.post(`${baseURL}/api/auth/oauth2/token`, {
      headers: { Origin: baseURL! },
      form: {
        grant_type: 'authorization_code',
        client_id: cimdClientId,
        code: code!,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      },
    })
    const token = await exchangeCode()
    expect(token.status()).toBe(200)
    const tokenBody = await token.json() as { access_token?: string, refresh_token?: string }
    expect(tokenBody.access_token).toBeTruthy()
    expect(tokenBody.refresh_token).toBeTruthy()

    const replay = await exchangeCode()
    expect(replay.status()).toBe(400)

    const secondAuthorize = await request.get(oauthAuthorizeUrl(baseURL!, {
      ...authorizeParams,
      state: 'second-pass',
    }), { maxRedirects: 0 })
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
    test.skip(new URL(baseURL!).protocol !== 'https:', 'CIMD requires an HTTPS client metadata and JWKS URI')
    await loginAs(request, baseURL!, 'user-e2e-oauth-private-cimd')

    const clientId = process.env.MCP_PRIVATE_CIMD_CLIENT_URL || `${baseURL}/api/auth/oauth2/test-private-client-metadata?nonce=${Date.now()}`
    const redirectUri = new URL('/oauth/test-callback', clientId).toString()
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

    const authorize = await request.get(oauthAuthorizeUrl(baseURL!, {
      ...authorizeParams,
      prompt: 'consent',
    }), { maxRedirects: 0 })
    expect(authorize.status()).toBe(302)
    const consentUrl = new URL(authorize.headers()['location']!, baseURL)
    expect(consentUrl.pathname).toBe('/oauth/consent')

    const consent = await request.post(`${baseURL}/api/auth/oauth2/consent`, {
      headers: { Origin: baseURL! },
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
    const tokenBody = await token.json() as { access_token?: string, id_token?: string }
    expect(tokenBody.access_token).toBeTruthy()
    expect(tokenBody.id_token).toBeTruthy()
    expect(decodeProtectedHeader(tokenBody.id_token!).alg).toBe('RS256')

    const secondAuthorize = await request.get(oauthAuthorizeUrl(baseURL!, {
      ...authorizeParams,
      state: 'private-replay',
    }), { maxRedirects: 0 })
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
    const MCP_VERSION = '2025-06-18'
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
    const MCP_VERSION = '2025-06-18'
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

})
