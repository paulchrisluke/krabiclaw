import { HTTPError } from 'nitro'
import { NOT_HANDLED, type McpExecutorContext } from './execution'
import { authorizePayments, listPayments, paymentSummary, paymentPayouts, readPaymentDetails } from '~/server/domain/payments'
import { paymentTransactions } from '~/server/domain/payments/earnings'
import { paymentsUsageStatus } from '~/server/domain/payments/usage'
import { assertRoleAllows } from '~/server/utils/member-access'
import { dashboardOrigin } from '~/server/utils/dashboard-notification-links'
import { isRecord } from '~/server/utils/type-guards'
import { organizationTool, type McpToolDefinition } from './shared'

const string = { type: 'string' } as const
const period = {
  from: { ...string, description: 'Inclusive UTC ISO instant.' },
  to: { ...string, description: 'Exclusive UTC ISO instant.' },
}

export const PAYMENTS_TOOLS: McpToolDefinition[] = [
  organizationTool({ name: 'get_payment_summary', description: 'Read totals for the selected business’s customer payments in a UTC period: captured volume, refunds and disputes, separately by currency. Use list_payments for individual transactions. Trust receipts are distinct from earned revenue. Does not change payments or move money.', domain: 'payments', minimumRole: 'admin', confirmRequired: false, inputSchema: period, required: ['from', 'to'] }),
  organizationTool({ name: 'list_payments', description: 'List the selected business’s customer payment records in a UTC period, with purchase links and amounts in each currency’s minor units. Use the returned cursor as after for another page and get_payment for one transaction’s details. These are customer payments, separate from the business’s platform subscription bill. Does not change payments.', domain: 'payments', minimumRole: 'admin', confirmRequired: false, inputSchema: { ...period, after: { ...string, description: 'The cursor returned by the previous payment page.' }, location_id: string, earnings_type: { type: 'string', enum: ['paid', 'refunded'], description: 'Only payments still paid, or only payments with a refund.' } }, required: ['from', 'to'] }),
  organizationTool({ name: 'get_payment', description: 'Read one customer payment belonging to the selected business, including its original purchase details, current refund records, disputes and authenticated dashboard URL. Requires payment_id from list_payments. Does not issue a refund, prepare an approval or change payment state; use the authenticated dashboard for financial actions.', domain: 'payments', minimumRole: 'admin', confirmRequired: false, inputSchema: { payment_id: string }, required: ['payment_id'] }),
  organizationTool({ name: 'get_payment_payouts', description: 'Read the selected business’s connected Stripe balance and payout history, with source and retrieval time. Continue with next_cursor as after for another page. Use get_payment_summary for customer payment totals. This is a read of the business’s own connected account; it does not create a payout or transfer funds.', domain: 'payments', minimumRole: 'admin', confirmRequired: false, inputSchema: { after: { ...string, description: 'next_cursor from the previous payout page.' } } }),
  organizationTool({ name: 'get_payments_usage', description: 'Read the selected business’s KrabiClaw Payments usage, Metronome invoices, accrued usage and undelivered provider-cost events. These are operating costs, separate from customer payments and platform subscription billing. Requires payment and billing read access. Does not change billing or move money.', domain: 'payments', minimumRole: 'admin', confirmRequired: false }),
  organizationTool({ name: 'get_payments_dashboard_link', description: 'Get the selected business’s authenticated Payments setup and dashboard URL when the owner wants to manage its Stripe integration. Returns a link for the person to open; it does not open a page, create an account, start onboarding, prepare a refund or change the integration. Identity and bank details are entered only in the dashboard’s Stripe-hosted flow.', domain: 'payments', minimumRole: 'owner', confirmRequired: false, outputSchema: { type: 'object', properties: { organization_id: string, dashboard_url: string, source: string }, required: ['organization_id', 'dashboard_url', 'source'] } }),
]

export async function handlePaymentsTools(ctx: McpExecutorContext): Promise<unknown> {
  const { db, env, organizationId, userId, role, organizationSlug } = ctx.organization
  const principal = { organizationId, userId, role }
  const args = ctx.args
  const dashboard = (path: string) => {
    if (!organizationSlug) throw new HTTPError({ statusCode: 503, statusMessage: 'Payments dashboard link requires the organization slug' })
    return `${dashboardOrigin(env, { orgSlug: organizationSlug, locationSlug: null })}${path}`
  }
  switch (ctx.toolName) {
    case 'get_payment_summary': return { ...await paymentSummary(db, principal, String(args.from), String(args.to)), dashboard_url: dashboard('/earnings') }
    case 'list_payments': {
      const page = await listPayments(db, principal, { from: String(args.from), to: String(args.to), after: typeof args.after === 'string' ? args.after : undefined, location_id: typeof args.location_id === 'string' ? args.location_id : undefined, earnings_type: args.earnings_type === 'paid' || args.earnings_type === 'refunded' ? args.earnings_type : undefined })
      if (!organizationSlug) throw new HTTPError({ statusCode: 503, statusMessage: 'Payments dashboard link requires the organization slug' })
      const transactions = await paymentTransactions(db, principal, organizationSlug, page)
      return { ...page, ...transactions, payments: transactions.payments.map(payment => ({ ...payment, to: new URL(payment.to, dashboard('/')).toString() })), dashboard_url: dashboard('/earnings/transactions') }
    }
    case 'get_payment': {
      await authorizePayments(principal, 'read')
      const detail = await readPaymentDetails(db, organizationId, String(args.payment_id))
      if (!organizationSlug) throw new HTTPError({ statusCode: 503, statusMessage: 'Payments dashboard link requires the organization slug' })
      const transactions = await paymentTransactions(db, principal, organizationSlug, { payments: [detail.payment], next_cursor: null })
      const transaction = transactions.payments[0]!
      const url = new URL(transaction.to, dashboard('/')).toString()
      const snapshot: unknown = JSON.parse(detail.payment.price_snapshot_json)
      if (!isRecord(snapshot) || (snapshot.price !== undefined && !isRecord(snapshot.price))) throw new Error('Payment purchase details are invalid')
      return {
        organization_id: organizationId, payment: { ...transaction, to: url }, dashboard_url: url,
        purchase: { title: snapshot.title, quantity: snapshot.quantity, product_id: snapshot.product_id, variant_id: snapshot.variant_id, session_id: snapshot.session_id,
          ...(isRecord(snapshot.price) ? { price: { currency: snapshot.price.currency, unit_amount: snapshot.price.unit_amount, type: snapshot.price.type, tax_behavior: snapshot.price.tax_behavior } } : {}),
        },
        refunds: detail.refunds.map(refund => ({ id: refund.id, amount: refund.amount, status: refund.status })),
        disputes: detail.disputes.map(dispute => {
          if (!isRecord(dispute)) throw new Error('Payment dispute details are invalid')
          return { id: dispute.id, amount: dispute.amount, currency: dispute.currency, reason: dispute.reason, status: dispute.status, evidence_due_at: dispute.evidence_due_at, updated_at: dispute.updated_at }
        }),
      }
    }
    case 'get_payments_usage': {
      await authorizePayments(principal, 'read')
      await assertRoleAllows({ organizationId, role, permissions: { billing: ['read'] } })
      const result = await paymentsUsageStatus(db, env, organizationId)
      return {
        organization_id: organizationId, configured: result.configured, source: result.source, refreshed_at: result.refreshed_at, dashboard_url: dashboard('/payments/invoices'),
        account: result.account ? { currency: result.account.currency, status: result.account.status, contract_start_at: result.account.contract_start_at } : undefined,
        pricing: result.pricing ? { currency: result.pricing.currency, units: result.pricing.units, captured_volume_rate: result.pricing.captured_volume_rate, captured_volume_rate_percent: result.pricing.captured_volume_rate_percent, validated_at: result.pricing.validated_at } : null,
        pending: result.pending.map(row => {
          if (!isRecord(row)) throw new Error('Payments usage details are invalid')
          return { currency: row.currency, kind: row.kind, event_count: row.event_count, amount: row.amount, action_required: Boolean(row.error) }
        }),
        credits: result.credits.map(credit => ({ id: credit.id, kind: credit.kind, currency: credit.currency, amount: credit.amount, provider_occurred_at: credit.provider_occurred_at, action_required: Boolean(credit.error) })),
        invoices: result.invoices.map((invoice: unknown) => {
          if (!isRecord(invoice)) throw new Error('Payments invoice details are invalid')
          return { id: invoice.id, type: invoice.type, status: invoice.status, start_timestamp: invoice.start_timestamp, end_timestamp: invoice.end_timestamp, total: invoice.total,
            credit_type: isRecord(invoice.credit_type) ? { name: invoice.credit_type.name } : undefined,
            collection_invoice: invoice.collection_invoice,
          }
        }),
      }
    }
    case 'get_payment_payouts': {
      const result = await paymentPayouts(db, env, principal, typeof args.after === 'string' ? args.after : undefined)
      return {
        organization_id: organizationId, configured: result.configured, source: result.source, refreshed_at: result.refreshed_at, next_cursor: result.next_cursor,
        dashboard_url: dashboard('/earnings/payouts'),
        balance: result.balance ? { available: result.balance.available.map(row => ({ currency: row.currency.toUpperCase(), amount: row.amount })), pending: result.balance.pending.map(row => ({ currency: row.currency.toUpperCase(), amount: row.amount })) } : undefined,
        payouts: result.payouts.map(payout => ({ id: payout.id, amount: payout.amount, currency: payout.currency.toUpperCase(), status: payout.status, arrival_date: payout.arrival_date, created: payout.created, automatic: payout.automatic, dashboard_url: dashboard(`/earnings/payouts/${encodeURIComponent(payout.id)}`) })),
      }
    }
    case 'get_payments_dashboard_link': {
      await authorizePayments(principal, 'integration')
      return { organization_id: organizationId, dashboard_url: dashboard('/payments?tab=payouts'), source: 'Authenticated Payments integration dashboard' }
    }
    default: return NOT_HANDLED
  }
}
