import { defineHandler, HTTPError } from 'nitro'
import { jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { resolveBillingCustomer } from '~/server/utils/billing-customer'

/** Remove: the card is detached at Stripe from this customer; nothing about it is kept here. */
export default defineHandler(async (event) => {
  const body = await readRequiredBody<{ organizationId?: string; payment_method_id?: string }>(event)
  if (typeof body.payment_method_id !== 'string' || !/^pm_[A-Za-z0-9]+$/.test(body.payment_method_id)) throw new HTTPError({ statusCode: 400, statusMessage: 'Payment method is required' })
  const { stripe, customerId } = await resolveBillingCustomer(event, typeof body.organizationId === 'string' && body.organizationId ? body.organizationId : null)
  if (!customerId) throw new HTTPError({ statusCode: 404, statusMessage: 'Payment method not found' })
  const method = await stripe.paymentMethods.retrieve(body.payment_method_id)
  if ((typeof method.customer === 'string' ? method.customer : method.customer?.id) !== customerId) throw new HTTPError({ statusCode: 404, statusMessage: 'Payment method not found' })
  await stripe.paymentMethods.detach(body.payment_method_id)
  return jsonResponse({ removed: true })
})
