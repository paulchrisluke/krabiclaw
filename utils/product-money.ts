import type { Price } from '~/shared/prices'
import { formatMinorAmount } from '~/shared/prices'

export function formatProductMoney(price: Price | null, locale?: string): string {
  return price ? formatMinorAmount(price.amount_minor, price.currency, locale) : 'Price on request'
}
