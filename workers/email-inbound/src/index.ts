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
    const body = (parsed.text || parsed.html || '').trim()

    if (!body) return

    await fetch(env.INBOUND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-email-inbound-secret': env.EMAIL_INBOUND_SECRET,
      },
      body: JSON.stringify({
        to: message.to,
        from: message.from,
        body,
      }),
    })
  },
}
