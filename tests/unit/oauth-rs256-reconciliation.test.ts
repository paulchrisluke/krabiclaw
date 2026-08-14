import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { oauthProvider } from '@better-auth/oauth-provider'
import { betterAuth } from 'better-auth'
import { jwt } from 'better-auth/plugins'
import { decodeProtectedHeader } from 'jose'
import { OAUTH_SIGNING_POLICY, oauthSigningConfig } from '../../server/utils/auth.ts'

const BASE_URL = 'https://auth.test'
const RESOURCE = `${BASE_URL}/api/mcp`
const REDIRECT_URI = 'https://client.test/callback'
const SECRET = 'better-auth-rs256-reconciliation-test-secret'

function providerOptions(signingPolicy?: typeof OAUTH_SIGNING_POLICY) {
  return {
    loginPage: '/login',
    consentPage: '/consent',
    scopes: ['openid', 'offline_access', 'tenant', 'platform_admin'] as const,
    ...(signingPolicy
      ? oauthSigningConfig(BASE_URL)
      : {
          resources: [{
            identifier: RESOURCE,
            allowedScopes: ['openid', 'offline_access', 'tenant'],
          }],
        }),
    enforcePerClientResources: false,
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    silenceWarnings: {
      oauthAuthServerConfig: true,
      openidConfig: true,
    },
  }
}

function authOptions(database: DatabaseSync, signingPolicy?: typeof OAUTH_SIGNING_POLICY) {
  return {
    database,
    baseURL: BASE_URL,
    secret: SECRET,
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    plugins: [
      jwt(signingPolicy
        ? { jwks: { keyPairConfig: { alg: signingPolicy.algorithm } } }
        : undefined),
      oauthProvider(providerOptions(signingPolicy)),
    ],
  }
}

async function request(auth: ReturnType<typeof betterAuth>, path: string, init?: RequestInit) {
  return await auth.handler(new Request(`${BASE_URL}/api/auth${path}`, init))
}

async function issueOpenIdTokens(auth: ReturnType<typeof betterAuth>) {
  const signup = await request(auth, '/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE_URL },
    body: JSON.stringify({
      name: 'RS256 test user',
      email: 'rs256@example.com',
      password: 'password123',
    }),
  })
  assert.equal(signup.status, 200)

  const signIn = await request(auth, '/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE_URL },
    body: JSON.stringify({ email: 'rs256@example.com', password: 'password123' }),
  })
  assert.equal(signIn.status, 200)
  const cookie = signIn.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')

  const registration = await request(auth, '/oauth2/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE_URL },
    body: JSON.stringify({
      client_name: 'RS256 test client',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'openid offline_access tenant',
    }),
  })
  assert.equal(registration.status, 201)
  const { client_id: clientId } = await registration.json() as { client_id: string }

  const verifier = 'krabiclaw-rs256-reconciliation-verifier-0123456789'
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorizeQuery = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid offline_access tenant',
    state: 'rs256-reconciliation',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE,
    prompt: 'consent',
  })
  const authorize = await request(auth, `/oauth2/authorize?${authorizeQuery}`, {
    headers: { cookie },
    redirect: 'manual',
  })
  assert.equal(authorize.status, 302)
  const consentLocation = authorize.headers.get('location')
  assert.ok(consentLocation)

  const consent = await request(auth, '/oauth2/consent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE_URL, cookie },
    body: JSON.stringify({
      accept: true,
      oauth_query: new URL(consentLocation, BASE_URL).search.slice(1),
    }),
  })
  assert.equal(consent.status, 200)
  const consentBody = await consent.json() as { url: string }
  const code = new URL(consentBody.url).searchParams.get('code')
  assert.ok(code)

  const token = await request(auth, '/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE_URL },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })
  assert.equal(token.status, 200)
  return await token.json() as { access_token: string, id_token: string }
}

test('OAuth restart reconciles an existing EdDSA deployment to RS256', async () => {
  const database = new DatabaseSync(':memory:')
  try {
    const beforeMigrations = betterAuth(authOptions(database))
    await (await beforeMigrations.$context).runMigrations()

    const legacy = betterAuth(authOptions(database))
    await legacy.$context
    const legacyJwks = await request(legacy, '/jwks')
    assert.equal(legacyJwks.status, 200)
    const legacyKeys = await legacyJwks.json() as { keys: Array<{ alg: string }> }
    assert.deepEqual(legacyKeys.keys.map(key => key.alg), ['EdDSA'])
    const legacyResource = database.prepare(
      'SELECT signingAlgorithm FROM oauthResource WHERE identifier = ?',
    ).get(RESOURCE) as { signingAlgorithm: string | null } | undefined
    assert.equal(legacyResource?.signingAlgorithm, null)

    const reconciled = betterAuth(authOptions(database, OAUTH_SIGNING_POLICY))
    await reconciled.$context
    const reconciledResource = database.prepare(
      'SELECT signingAlgorithm FROM oauthResource WHERE identifier = ?',
    ).get(RESOURCE) as { signingAlgorithm: string | null } | undefined
    assert.equal(reconciledResource?.signingAlgorithm, 'RS256')
    const tokens = await issueOpenIdTokens(reconciled)

    assert.equal(decodeProtectedHeader(tokens.access_token).alg, 'RS256')
    assert.equal(decodeProtectedHeader(tokens.id_token).alg, 'RS256')

    const reconciledJwks = await request(reconciled, '/jwks')
    const reconciledKeys = await reconciledJwks.json() as { keys: Array<{ alg: string }> }
    assert.deepEqual(new Set(reconciledKeys.keys.map(key => key.alg)), new Set(['EdDSA', 'RS256']))
  }
  finally {
    database.close()
  }
})
