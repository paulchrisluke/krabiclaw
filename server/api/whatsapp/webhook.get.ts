import { cloudflareEnv } from '~/server/utils/api-response'

export default defineEventHandler((event) => {
  const env = cloudflareEnv(event)
  const query = getQuery(event)
  const mode = String(query['hub.mode'] ?? '')
  const token = String(query['hub.verify_token'] ?? '')
  const challenge = String(query['hub.challenge'] ?? '')

  if (mode !== 'subscribe' || !env.WHATSAPP_VERIFY_TOKEN || token !== env.WHATSAPP_VERIFY_TOKEN) {
    throw createError({ statusCode: 403, statusMessage: 'WhatsApp webhook verification failed' })
  }

  return new Response(challenge, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
})
