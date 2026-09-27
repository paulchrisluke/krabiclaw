import { defineHandler } from 'nitro'
import { readRawBody } from 'nitro/h3'
import type { WebhookEventPayload } from 'resend'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getResendClient } from '~/server/utils/resend'
import { applyResendEmailEvent } from '~/server/domain/guest-threads/deliveries'
import { reconcileProductNewsFromProvider } from '~/server/domain/product-news-contacts'

// POST /api/resend/webhook — Resend delivery and Contact events.
//
// Resend owns the event history, retries and replay, so nothing here is
// logged or queued: a verified event is applied and answered. A 2xx tells
// Resend the event is done; an error status makes it retry.
//
// Email events project onto guest_thread_deliveries (applyResendEmailEvent);
// contact.updated reconciles the Product News preference from Resend's state.

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const webhookSecret = env.RESEND_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) return jsonResponse({ error: 'RESEND_WEBHOOK_SECRET is not configured' }, { status: 500 })

  // The signature covers the exact bytes Resend sent; the body is verified
  // before it is parsed, never re-serialised from a parsed object.
  const payload = await readRawBody(event) ?? ''
  const headers = {
    id: event.req.headers.get('svix-id') ?? '',
    timestamp: event.req.headers.get('svix-timestamp') ?? '',
    signature: event.req.headers.get('svix-signature') ?? '',
  }
  let verified: WebhookEventPayload
  try {
    verified = getResendClient(env).webhooks.verify({ payload, headers, webhookSecret })
  } catch (error) {
    return jsonResponse({ error: `Invalid webhook signature: ${error instanceof Error ? error.message : String(error)}` }, { status: 400 })
  }

  if (verified.type === 'contact.updated') {
    const outcome = await reconcileProductNewsFromProvider(db, env, verified.data.email)
    return jsonResponse({ received: verified.type, outcome })
  }

  return jsonResponse({ received: verified.type, outcome: await applyResendEmailEvent(db, env, verified) })
})
