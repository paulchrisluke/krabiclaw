import { defineHandler, HTTPError } from 'nitro'
import { readRawBody } from 'nitro/h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createStripeClient } from '~/server/utils/stripe-client'
import { processPaymentEvent } from '~/server/domain/payments/events'

export default defineHandler(async event => {
  const env=cloudflareEnv(event)
  if(!env.STRIPE_SECRET_KEY || !env.STRIPE_PAYMENTS_WEBHOOK_SECRET) throw new HTTPError({statusCode:503,statusMessage:'Stripe Payments webhook is not configured'})
  if(Number(event.req.headers.get('content-length'))>512*1024) throw new HTTPError({statusCode:413,statusMessage:'Payload too large'})
  const payload=await readRawBody(event), signature=event.req.headers.get('stripe-signature')
  if(!payload || new TextEncoder().encode(payload).byteLength>512*1024 || !signature) throw new HTTPError({statusCode:400,statusMessage:'Signed payment payload required'})
  const stripe=createStripeClient(env.STRIPE_SECRET_KEY, 'payments')
  let notification
  try {notification=await stripe.webhooks.constructEventAsync(payload,signature,env.STRIPE_PAYMENTS_WEBHOOK_SECRET)}
  catch {throw new HTTPError({statusCode:400,statusMessage:'Invalid Stripe payment signature'})}
  await processPaymentEvent(env.DB,stripe,notification,payload,env)
  return jsonResponse({received:true})
})
