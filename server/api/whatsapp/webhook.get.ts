import { HTTPError, defineHandler  } from 'nitro';

import { cloudflareEnv } from '~/server/utils/api-response'

export default defineHandler((event) => {
  const env = cloudflareEnv(event)
  const query = getQuery(event)
  const mode = String(query['hub.mode'] ?? '')
  const token = String(query['hub.verify_token'] ?? '')
  const challenge = String(query['hub.challenge'] ?? '')

  if (!env.WHATSAPP_VERIFY_TOKEN) {
    throw new HTTPError({ statusCode: 500, statusMessage: 'Missing WHATSAPP_VERIFY_TOKEN configuration' })
  }

  if (mode !== 'subscribe' || token !== env.WHATSAPP_VERIFY_TOKEN) {
    throw new HTTPError({ statusCode: 403, statusMessage: 'WhatsApp webhook verification failed' })
  }

  if (!challenge.trim()) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'WhatsApp webhook challenge is required' })
  }

  return new Response(challenge, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
})
import { getQuery } from 'nitro/h3';
