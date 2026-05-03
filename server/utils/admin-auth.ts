export interface AdminAuthEnv {
  AUTH_COOKIE_SECRET?: string
  GOOGLE_ADMIN_EMAILS?: string
  REVIEWS_ADMIN_TOKEN?: string
}

const sessionCookie = 'kikuzuki_admin_session'

const encoder = new TextEncoder()

const base64UrlEncode = (value: string | ArrayBuffer) => {
  const bytes = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value)
  let binary = ''
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

const base64UrlDecode = (value: string) => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

const getCookie = (request: Request, name: string) => {
  const header = request.headers.get('Cookie') ?? ''
  return header
    .split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

const sign = async (payload: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return base64UrlEncode(signature)
}

export const authorizedEmails = (env: AdminAuthEnv) =>
  (env.GOOGLE_ADMIN_EMAILS ?? 'paulchrisluke@gmail.com')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)

export const createAdminSessionCookie = async (email: string, env: AdminAuthEnv) => {
  const secret = env.AUTH_COOKIE_SECRET ?? env.REVIEWS_ADMIN_TOKEN
  if (!secret) throw new Error('Missing AUTH_COOKIE_SECRET')

  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
  const payload = base64UrlEncode(JSON.stringify({ email: email.toLowerCase(), exp: expiresAt }))
  const signature = await sign(payload, secret)
  const expires = new Date(expiresAt * 1000).toUTCString()

  return `${sessionCookie}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`
}

export const clearAdminSessionCookie = () =>
  `${sessionCookie}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

export const readAdminSession = async (request: Request, env: AdminAuthEnv) => {
  const secret = env.AUTH_COOKIE_SECRET ?? env.REVIEWS_ADMIN_TOKEN
  if (!secret) return null

  const cookie = getCookie(request, sessionCookie)
  if (!cookie) return null

  const [payload, signature] = cookie.split('.')
  if (!payload || !signature) return null

  const expectedSignature = await sign(payload, secret)
  if (!timingSafeEqual(signature, expectedSignature)) return null

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as { email?: string; exp?: number }
    if (!session.email || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null
    if (!authorizedEmails(env).includes(session.email.toLowerCase())) return null
    return { email: session.email.toLowerCase() }
  } catch {
    return null
  }
}

export const isAdminRequest = async (request: Request, env: AdminAuthEnv) => {
  const bearerToken = request.headers.get('Authorization')
  if (env.REVIEWS_ADMIN_TOKEN && bearerToken === `Bearer ${env.REVIEWS_ADMIN_TOKEN}`) {
    return true
  }
  return Boolean(await readAdminSession(request, env))
}
