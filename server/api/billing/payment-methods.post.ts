import { defineHandler, HTTPError } from 'nitro'
import { jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { resolveBillingCustomer } from '~/server/utils/billing-customer'

/**
 * Add card details: a SetupIntent for Stripe's own card form in the sheet;
 * Set default: the card future charges use. Stripe keeps the card either way.
 */
export default defineHandler(async (event) => {
  const body = await readRequiredBody<{ organizationId?: string; action?: string; payment_method_id?: string }>(event)
  const organizationId = typeof body.organizationId === 'string' && body.organizationId ? body.organizationId : null
  if (body.action === 'setup') {
    const { stripe, customerId } = await resolveBillingCustomer(event, organizationId, { create: true })
    if (!customerId) throw new HTTPError({ statusCode: 409, statusMessage: 'Choose a plan before adding a payment method' })
    const intent = await stripe.setupIntents.create({ customer: customerId, payment_method_types: ['card'], usage: 'off_session' })
    if (!intent.client_secret) throw new Error('Stripe returned no client secret for the card form')
    return jsonResponse({ client_secret: intent.client_secret })
  }
  if (body.action === 'set_default') {
    if (typeof body.payment_method_id !== 'string' || !/^pm_[A-Za-z0-9]+$/.test(body.payment_method_id)) throw new HTTPError({ statusCode: 400, statusMessage: 'Payment method is required' })
    const { stripe, customerId } = await resolveBillingCustomer(event, organizationId)
    if (!customerId) throw new HTTPError({ statusCode: 404, statusMessage: 'Payment method not found' })
    const method = await stripe.paymentMethods.retrieve(body.payment_method_id)
    if ((typeof method.customer === 'string' ? method.customer : method.customer?.id) !== customerId) throw new HTTPError({ statusCode: 404, statusMessage: 'Payment method not found' })
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: body.payment_method_id } })
    return jsonResponse({ default: body.payment_method_id })
  }
  throw new HTTPError({ statusCode: 400, statusMessage: 'Unknown payment method action' })
})
