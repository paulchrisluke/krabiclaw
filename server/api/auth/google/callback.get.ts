import { toWebRequest } from 'h3'
import { authorizedEmails, createAdminSessionCookie } from '../../../utils/admin-auth'
import { saveGoogleRefreshToken } from '../../../utils/google-business'
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'

const base64UrlDecode = (value: string) => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

const getRequestCookie = (request: Request, name: string) => {
  const header = request.headers.get('Cookie') ?? ''
  return header
    .split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const request = toWebRequest(event)

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return jsonResponse({ error: 'Missing Google OAuth configuration.' }, { status: 500 })
  }

  const url = getRequestURL(event)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = getRequestCookie(request, 'kikuzuki_oauth_state')

  if (!code || !state || !expectedState || state !== expectedState) {
    return jsonResponse({ error: 'Invalid Google OAuth response.' }, { status: 400 })
  }

  const redirectUri = env.GOOGLE_REDIRECT_URI || `${url.origin}/api/auth/google/callback`
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  })

  if (!tokenResponse.ok) {
    return jsonResponse({ error: 'Could not verify Google sign-in.' }, { status: 401 })
  }

  const tokenBody = (await tokenResponse.json()) as { id_token?: string; refresh_token?: string; scope?: string }
  const [, payload] = tokenBody.id_token?.split('.') ?? []
  if (!payload) return jsonResponse({ error: 'Google did not return an identity token.' }, { status: 401 })

  const identity = JSON.parse(base64UrlDecode(payload)) as {
    aud?: string
    email?: string
    email_verified?: boolean
    exp?: number
  }
  const email = identity.email?.toLowerCase()
  const now = Math.floor(Date.now() / 1000)

  if (identity.aud !== env.GOOGLE_CLIENT_ID || !identity.email_verified || !email || (identity.exp ?? 0) < now) {
    return jsonResponse({ error: 'Google identity token was not valid.' }, { status: 401 })
  }

  if (!authorizedEmails(env).includes(email)) {
    return jsonResponse({ error: `${email} is not allowed to access review moderation.` }, { status: 403 })
  }

  if (tokenBody.refresh_token) {
    await saveGoogleRefreshToken(env, tokenBody.refresh_token, tokenBody.scope ?? '')
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin',
      'Set-Cookie': [
        await createAdminSessionCookie(email, env),
        'kikuzuki_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
      ].join(', ')
    }
  })
})
