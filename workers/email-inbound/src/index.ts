import PostalMime from 'postal-mime'

export interface Env {
  INBOUND_API_URL: string
  EMAIL_INBOUND_SECRET: string
}

// Cloudflare Email Routing invokes this handler for every message caught by the
// reply.<platform-domain> catch-all rule (see wrangler.toml). It parses the raw MIME message and
// forwards the plain-text body to the main app's /api/email/inbound, which verifies the
// reply-to token and threads the message onto the right submission.
export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    const rawEmail = await new Response(message.raw).arrayBuffer()
    const parsed = await PostalMime.parse(rawEmail)
    // Prefer plain text; if only HTML is available, strip tags to avoid raw HTML exposure
    const body = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '').trim()

    if (!body) return

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(env.INBOUND_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-email-inbound-secret': env.EMAIL_INBOUND_SECRET,
        },
        body: JSON.stringify({
          to: message.to,
          from: message.from,
          body,
          messageId: message.headers.get('Message-ID') || crypto.randomUUID(),
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Forwarding failed with status ${response.status}`)
      }
    } catch (error) {
      clearTimeout(timeout)
      console.error('Email inbound forwarding failed', error)
      throw error
    }
  },
}
