import assert from 'node:assert/strict'
import test from 'node:test'
import { loadStripeInvoiceLines } from '../../server/utils/stripe-invoice-lines.ts'

test('missing embedded invoice lines loads the complete first page', async () => {
  const calls: Array<{ invoiceId: string; params: Record<string, unknown> }> = []
  const stripe = {
    invoices: {
      listLineItems: async (invoiceId: string, params: Record<string, unknown>) => {
        calls.push({ invoiceId, params })
        return {
          data: [{
            id: 'il_base',
            pricing: {
              price_details: {
                price: { id: 'price_growth', product: { id: 'prod_growth' } },
              },
            },
          }],
          has_more: false,
        }
      },
    },
    prices: {
      retrieve: async () => {
        throw new Error('expanded prices must not be retrieved again')
      },
    },
  }

  const lines = await loadStripeInvoiceLines(stripe as never, { id: 'in_missing_lines' } as never)

  assert.equal(lines.length, 1)
  assert.deepEqual(calls, [{
    invoiceId: 'in_missing_lines',
    params: { limit: 100, expand: ['data.pricing.price_details.price'] },
  }])
})
