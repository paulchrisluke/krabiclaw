import { defineHandler, HTTPError } from 'nitro'
import { cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { detachConnectedCards, resolveBillingCustomer } from '~/server/utils/billing-customer'

/**
 * Remove: the card is detached at Stripe from this customer and, for an
 * account, its copies on every business it was offered to; nothing about it
 * is kept here.
 */
export default defineHandler(async (event) => {
  const body = await readRequiredBody<{ organizationId?: string; payment_method_id?: string }>(event)
  if (typeof body.payment_method_id !== 'string' || !/^pm_[A-Za-z0-9]+$/.test(body.payment_method_id)) throw new HTTPError({ statusCode: 400, statusMessage: 'Payment method is required' })
  const organizationId = typeof body.organizationId === 'string' && body.organizationId ? body.organizationId : null
  const { stripe, customerId, userId } = await resolveBillingCustomer(event, organizationId)
  if (!customerId) throw new HTTPError({ statusCode: 404, statusMessage: 'Payment method not found' })
  const method = await stripe.paymentMethods.retrieve(body.payment_method_id)
  if ((typeof method.customer === 'string' ? method.customer : method.customer?.id) !== customerId) throw new HTTPError({ statusCode: 404, statusMessage: 'Payment method not found' })
  const fingerprint = method.card?.fingerprint
  if (!organizationId && fingerprint) {
    await detachConnectedCards(cloudflareEnv(event).DB, stripe, userId, copy => copy.card?.fingerprint === fingerprint)
  }
  await stripe.paymentMethods.detach(body.payment_method_id)
  return jsonResponse({ removed: true })
})
