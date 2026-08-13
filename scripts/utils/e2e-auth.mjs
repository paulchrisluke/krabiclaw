import { findE2eAuthFixture } from '../../config/e2e-auth-fixtures.ts'

function responseCookies(response) {
  return response.headers.getSetCookie()
    .map(value => value.split(';')[0])
    .filter(Boolean)
}

function mergeCookieHeader(current, response) {
  const cookies = new Map()
  for (const value of String(current || '').split(';')) {
    const entry = value.trim()
    if (!entry) continue
    const separator = entry.indexOf('=')
    if (separator > 0) cookies.set(entry.slice(0, separator), entry)
  }
  for (const entry of responseCookies(response)) {
    const separator = entry.indexOf('=')
    if (separator > 0) cookies.set(entry.slice(0, separator), entry)
  }
  return [...cookies.values()].join('; ')
}

async function expectOk(response, label) {
  if (response.ok) return response
  throw new Error(`${label} failed with ${response.status}: ${await response.text()}`)
}

export async function credentialSession(baseURL, options = {}) {
  const fixture = options.userId ? findE2eAuthFixture(options.userId) : null
  const email = options.email || fixture?.email
  const password = options.password || process.env.E2E_TEST_PASSWORD
  if (!email) throw new Error('A seeded E2E userId or explicit email is required for credential sign-in.')
  if (!password) throw new Error('E2E_TEST_PASSWORD or an explicit password is required for credential sign-in.')

  const origin = new URL(baseURL).origin
  const signIn = await expectOk(await fetch(new URL('/api/auth/sign-in/email', baseURL), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email, password, rememberMe: false }),
  }), 'Better Auth credential sign-in')
  let cookie = mergeCookieHeader('', signIn)
  if (!cookie) throw new Error('Better Auth credential sign-in did not return a session cookie.')

  const organizationId = options.organizationId || fixture?.memberships?.[0]?.organizationId
  if (organizationId) {
    const activeOrganization = await expectOk(await fetch(new URL('/api/auth/organization/set-active', baseURL), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin },
      body: JSON.stringify({ organizationId }),
    }), 'Better Auth active-organization selection')
    cookie = mergeCookieHeader(cookie, activeOrganization)
  }

  return { cookie }
}

export async function credentialCookie(baseURL, options = {}) {
  return (await credentialSession(baseURL, options)).cookie
}
