// POST /api/contact - Platform contact form submission via Resend
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

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

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(email)) {
    return jsonResponse({ error: 'Invalid email address' }, { status: 400 })
  }

  // Rate limiting (simplified - in production use KV or proper rate limit store)
  const db = cloudflareEnv(event).REVIEWS_DB
  if (db) {
    const ip = event.node.req.headers['x-forwarded-for'] as string || event.node.req.socket.remoteAddress || 'unknown'
    const hourKey = `rate:ip:${ip}:${Math.floor(Date.now() / 3600000)}`
    const dateKey = `rate:email:${email}:${new Date().toISOString().split('T')[0]}`
    
    try {
      const ipCount = await db.prepare(`SELECT count FROM rate_limits WHERE key = ?`).bind(hourKey).first()
      if (ipCount && (ipCount as any).count >= 5) {
        return jsonResponse({ error: 'Too many submissions from your IP. Please try again later.' }, { status: 429 })
      }
      
      const emailCount = await db.prepare(`SELECT count FROM rate_limits WHERE key = ?`).bind(dateKey).first()
      if (emailCount && (emailCount as any).count >= 3) {
        return jsonResponse({ error: 'Too many submissions from your email. Please try again tomorrow.' }, { status: 429 })
      }
      
      // Increment counters
      await db.prepare(`INSERT INTO rate_limits (key, count) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET count = count + 1`).bind(hourKey).run()
      await db.prepare(`INSERT INTO rate_limits (key, count) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET count = count + 1`).bind(dateKey).run()
    } catch (err) {
      console.error('Rate limit check failed:', err)
      // Continue anyway - don't block on rate limit errors
    }
  }

  try {
    const env = cloudflareEnv(event)
    const resendApiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY

    if (!resendApiKey) {
      return jsonResponse({ error: 'Email service not configured' }, { status: 500 })
    }

    // Store submission in database first (with retention timestamp)
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const retentionDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
    
    if (db) {
      try {
        await db.prepare(
          `INSERT INTO platform_contact_submissions (id, name, email, message, created_at, retention_until) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(id, name, email, message, now, retentionDate).run()
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
