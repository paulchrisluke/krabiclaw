import { defineHandler } from 'nitro'
import { getQuery } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { listCustomerCards, resolveBillingCustomer, type PaymentMethodRow } from '~/server/utils/billing-customer'

/** Airbnb's "Payment methods": the cards on this account's, or this business's, Stripe customer. */
export default defineHandler(async (event) => {
  const query = getQuery(event)
  const { stripe, customerId } = await resolveBillingCustomer(event, typeof query.organizationId === 'string' && query.organizationId ? query.organizationId : null)
  const payment_methods: PaymentMethodRow[] = customerId ? await listCustomerCards(stripe, customerId) : []
  return jsonResponse({ payment_methods }, { headers: { 'cache-control': 'private, no-store' } })
})
