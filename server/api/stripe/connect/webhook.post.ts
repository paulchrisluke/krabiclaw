import { defineHandler, HTTPError } from 'nitro'
import { readRawBody } from 'nitro/h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createStripeClient } from '~/server/utils/stripe-client'
import { processStripeConnectEvent } from '~/server/utils/stripe-connect-events'

const MAX_STRIPE_WEBHOOK_BYTES = 512 * 1024

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe Connect webhooks are not configured' })
  }
  const contentLength = Number(event.req.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_STRIPE_WEBHOOK_BYTES) {
    throw new HTTPError({ statusCode: 413, statusMessage: 'Stripe webhook payload is too large' })
  }
  const payload = await readRawBody(event)
  if (payload === undefined || new TextEncoder().encode(payload).byteLength > MAX_STRIPE_WEBHOOK_BYTES) {
    throw new HTTPError({ statusCode: 413, statusMessage: 'Stripe webhook payload is missing or too large' })
  }
  const signature = event.req.headers.get('stripe-signature')
  if (!signature) throw new HTTPError({ statusCode: 400, statusMessage: 'Stripe signature is required' })

  const stripe = createStripeClient(env.STRIPE_SECRET_KEY, 'payments')
  let notification
  try {
    notification = await stripe.parseEventNotificationAsync(payload, signature, env.STRIPE_CONNECT_WEBHOOK_SECRET)
  } catch (error) {
    console.warn('stripe_connect_webhook_signature_rejected', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw new HTTPError({ statusCode: 400, statusMessage: 'Stripe signature is invalid' })
  }

  if (!await processStripeConnectEvent(env.DB, stripe, notification, payload)) {
    throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe Connect event processing is in progress' })
  }

  return jsonResponse({ received: true })
})
