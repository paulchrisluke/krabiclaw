import { CURRENCY_SYMBOLS } from '~/shared/money'
import { isCurrencyCode, type CurrencyCode } from '~/shared/currencies'

const PRODUCT_AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/

export function formatProductMoney(amount: string, currency: CurrencyCode): string {
  if (!PRODUCT_AMOUNT_PATTERN.test(amount)) throw new Error(`Invalid Product price: ${amount}`)
  if (!isCurrencyCode(currency)) throw new Error(`Unsupported Product currency: ${currency}`)
  return `${CURRENCY_SYMBOLS[currency]}${amount}`
}
