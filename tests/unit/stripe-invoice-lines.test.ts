import assert from 'node:assert/strict'
import test from 'node:test'
import {
  invoiceLineExactQuantity,
  loadStripeInvoiceLines,
} from '../../server/utils/stripe-invoice-lines.ts'

test('canonical invoice quantity defaults only when absent and rejects malformed values', () => {
  assert.equal(invoiceLineExactQuantity({} as never), 1)
  assert.equal(invoiceLineExactQuantity({ quantity: 1, quantity_decimal: '1' } as never), 1)
  assert.equal(invoiceLineExactQuantity({ quantity: 0 } as never), null)
  assert.equal(invoiceLineExactQuantity({ quantity_decimal: 'not-a-number' } as never), null)
  assert.equal(invoiceLineExactQuantity({ quantity: 1, quantity_decimal: '2' } as never), null)
})

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
