// POST /api/contact - Platform contact form submission via Resend
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

const NAME_MAX_LENGTH = 100
const EMAIL_MAX_LENGTH = 254
const MESSAGE_MAX_LENGTH = 5000
const IP_HOURLY_LIMIT = 5
const EMAIL_DAILY_LIMIT = 3

const hashIp = async (ip: string) => {
  if (!ip) return null
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const hashEmail = async (email: string) => {
  if (!email) return null
  const bytes = new TextEncoder().encode(email.toLowerCase().trim())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, (m) => map[m] || m)
}

function getClientIp(event: ApiValue): string {
  const rawForwardedFor = event.node.req.headers['x-forwarded-for']
  const forwardedFor = Array.isArray(rawForwardedFor)
    ? rawForwardedFor.join(',')
    : String(rawForwardedFor || '')

  const firstForwardedIp = forwardedFor
    .split(',')
    .map((part: string) => part.trim())
    .find(Boolean)

  return firstForwardedIp || event.node.req.socket.remoteAddress || 'unknown'
}

async function incrementRateLimit(db: D1Database, key: string, limit: number, expireMs: number): Promise<boolean> {
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + expireMs).toISOString()
  const result = await db.prepare(`
    INSERT INTO rate_limits (key, count, updated_at, expires_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at, expires_at = excluded.expires_at
    WHERE count < ?
  `).bind(key, now, expiresAt, limit).run()

  return Boolean(result?.success && result?.meta?.changes)
}

export default defineEventHandler(async (event) => {
  let body: { name?: string; email?: string; message?: string; consent?: boolean }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, email, message, consent } = body

  if (!name || !email || !message) {
    return jsonResponse({ error: 'name, email, and message are required' }, { status: 400 })
  }

  if (!consent) {
    return jsonResponse({ error: 'Consent to privacy policy is required' }, { status: 400 })
  }

  if (name.length > NAME_MAX_LENGTH) {
    return jsonResponse({ error: `name exceeds maximum length (${NAME_MAX_LENGTH})` }, { status: 400 })
  }
  if (email.length > EMAIL_MAX_LENGTH) {
    return jsonResponse({ error: `email exceeds maximum length (${EMAIL_MAX_LENGTH})` }, { status: 400 })
  }
  if (message.length > MESSAGE_MAX_LENGTH) {
    return jsonResponse({ error: `message exceeds maximum length (${MESSAGE_MAX_LENGTH})` }, { status: 400 })
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(email)) {
    return jsonResponse({ error: 'Invalid email address' }, { status: 400 })
  }

  // Rate limiting (simplified - in production use KV or proper rate limit store)
  const db = cloudflareEnv(event).REVIEWS_DB
  const clientIp = getClientIp(event)
  const hourKey = `rate:ip:${clientIp}:${Math.floor(Date.now() / 3600000)}`
  const emailHash = await hashEmail(email)
  const dateKey = `rate:email:${emailHash}:${new Date().toISOString().split('T')[0]}`

  if (db) {
    let ipIncremented = true
    let emailIncremented = true

    try {
      ipIncremented = await incrementRateLimit(db, hourKey, IP_HOURLY_LIMIT, 3600000)
    } catch (err) {
      console.error('Rate limit increment failed (ip):', err)
      return jsonResponse({ error: 'Rate limit service unavailable' }, { status: 500 })
    }

    try {
      emailIncremented = await incrementRateLimit(db, dateKey, EMAIL_DAILY_LIMIT, 86400000)
    } catch (err) {
      console.error('Rate limit increment failed (email):', err)
      return jsonResponse({ error: 'Rate limit service unavailable' }, { status: 500 })
    }

    if (!ipIncremented) {
      return jsonResponse({ error: 'Too many submissions from your IP. Please try again later.' }, { status: 429 })
    }
    if (!emailIncremented) {
      return jsonResponse({ error: 'Too many submissions from your email. Please try again tomorrow.' }, { status: 429 })
    }
  }

  try {
    const env = cloudflareEnv(event)
    const resendApiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY

    if (!resendApiKey) {
      return jsonResponse({ error: 'Email service not configured' }, { status: 500 })
    }

    // Store submission in database first
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const ipHash = await hashIp(clientIp)
    
    if (db) {
      try {
        await db.prepare(
          `INSERT INTO platform_contact_submissions (id, name, email, message, status, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(id, name, email, message, 'new', ipHash, now).run()
      } catch (err) {
        console.error('Failed to store contact submission:', err)
        // Continue to send email even if DB fails
      }
    }

    // Send email with sanitized content
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    
    let response
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          from: 'KrabiClaw <hello@krabiclaw.com>',
          to: ['hello@krabiclaw.com'],
          subject: `Contact Form: ${escapeHtml(name)}`,
          html: `
            <h2>New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Message:</strong></p>
            <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
          `
        })
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Resend API error:', errorText)
      return jsonResponse({ error: 'Failed to send email' }, { status: 500 })
    }

    return jsonResponse({ success: true, message: 'Message sent successfully' })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('Email send timeout')
      return jsonResponse({ error: 'Email service timeout' }, { status: 504 })
    }
    console.error('Contact form error:', error)
    return jsonResponse({ error: 'Failed to send message' }, { status: 500 })
  }
})
