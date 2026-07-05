// POST /api/contact - Platform contact form submission via Resend
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { hashEmail, shouldSendRealEmail } from '~/server/utils/email-delivery'
import { execute } from '~/server/db'
import { notifyPlatformContactSubmitted } from '~/server/utils/notifications'

const NAME_MAX_LENGTH = 100
const EMAIL_MAX_LENGTH = 254
const TOPIC_MAX_LENGTH = 200
const MESSAGE_MAX_LENGTH = 5000
const SOURCE_MAX_LENGTH = 100
const ROUTE_CONTEXT_MAX_LENGTH = 500
const SUMMARY_MAX_LENGTH = 1000
const AGENT_METADATA_MAX_LENGTH = 10000
const IP_HOURLY_LIMIT = 5
const EMAIL_DAILY_LIMIT = 3

const hashIp = async (ip: string) => {
  if (!ip) return null
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
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
  const result = await execute(db, `
    INSERT INTO rate_limits (key, count, updated_at, expires_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at, expires_at = excluded.expires_at
    WHERE count < ?
  `, [key, now, expiresAt, limit])

  return Boolean(result?.success && result?.meta?.changes)
}

export default defineEventHandler(async (event) => {
  let body: {
    name?: string
    email?: string
    topic?: string | null
    message?: string
    consent?: boolean
    source?: string | null
    route_context?: string | null
    suggested_summary?: string | null
    agent_metadata_json?: string | Record<string, unknown> | null
  }
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, email, topic, message, consent } = body
  const source = typeof body.source === 'string' && body.source.trim()
    ? body.source.trim().slice(0, SOURCE_MAX_LENGTH)
    : 'contact_page'
  const routeContext = typeof body.route_context === 'string' && body.route_context.trim()
    ? body.route_context.trim().slice(0, ROUTE_CONTEXT_MAX_LENGTH)
    : null
  const suggestedSummary = typeof body.suggested_summary === 'string' && body.suggested_summary.trim()
    ? body.suggested_summary.trim().slice(0, SUMMARY_MAX_LENGTH)
    : null

  if (topic && typeof topic === 'string' && topic.length > TOPIC_MAX_LENGTH) {
    return jsonResponse({ error: `topic exceeds maximum length (${TOPIC_MAX_LENGTH})` }, { status: 400 })
  }
  const normalizedTopic = typeof topic === 'string' && topic.trim()
    ? topic.trim().slice(0, TOPIC_MAX_LENGTH)
    : null
  let agentMetadataJson: string | null = null
  if (body.agent_metadata_json != null) {
    if (typeof body.agent_metadata_json === 'string') {
      if (body.agent_metadata_json.length > AGENT_METADATA_MAX_LENGTH) {
        return jsonResponse({ error: `agent_metadata_json exceeds maximum length (${AGENT_METADATA_MAX_LENGTH})` }, { status: 400 })
      }
      try {
        const parsed = JSON.parse(body.agent_metadata_json)
        agentMetadataJson = JSON.stringify(parsed)
      } catch {
        agentMetadataJson = null
      }
    } else {
      const stringified = JSON.stringify(body.agent_metadata_json)
      if (stringified.length > AGENT_METADATA_MAX_LENGTH) {
        return jsonResponse({ error: `agent_metadata_json exceeds maximum length (${AGENT_METADATA_MAX_LENGTH})` }, { status: 400 })
      }
      agentMetadataJson = stringified
    }
  }

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
  const db = cloudflareEnv(event).DB
  const clientIp = getClientIp(event)
  const hourKey = `rate:ip:${clientIp}:${Math.floor(Date.now() / 3600000)}`
  const emailHash = hashEmail(email)
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

    if (shouldSendRealEmail(env) && !env.RESEND_API_KEY) {
      return jsonResponse({ error: 'Email service not configured' }, { status: 500 })
    }

    // Store submission in database first
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const ipHash = await hashIp(clientIp)
    
    if (db) {
      try {
        await execute(
          db,
          `INSERT INTO platform_contact_submissions (id, name, email, topic, message, source, route_context, suggested_summary, agent_metadata_json, status, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, name, email, normalizedTopic, message, source, routeContext, suggestedSummary, agentMetadataJson, 'new', ipHash, now]
        )
      } catch (err) {
        console.error('Failed to store contact submission:', err)
        // Continue to send email even if DB fails
      }
    }

    try {
      await notifyPlatformContactSubmitted(env, db, {
        contactId: id,
        guestName: name,
        email,
        subject: normalizedTopic,
        message,
        source,
        routeContext,
        suggestedSummary,
      })
    } catch (err) {
      console.error('Contact notification failed:', err)
    }

    return jsonResponse({ success: true, message: 'Message sent successfully' })
  } catch (error) {
    console.error('Contact form error:', error)
    return jsonResponse({ error: 'Failed to send message' }, { status: 500 })
  }
})
