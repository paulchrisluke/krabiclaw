import type { Price } from '~/shared/prices'
import { formatMinorAmount } from '~/shared/prices'
import type { Product, ProductDetail } from '~/server/types/products'

export function formatProductMoney(price: Price | null, locale?: string): string {
  return price ? formatMinorAmount(price.amount_minor, price.currency, locale) : 'Price on request'
}

export function productPriceNote(details: readonly ProductDetail[]): string | null {
  return details.find(detail => detail.key === 'price-note')?.values[0] ?? null
}

// Precedence is always numeric Price > explicit price-note > generic
// fallback — a stale note never overrides an active Price.
export function formatProductPriceLabel(product: Pick<Product, 'price' | 'details'>, locale?: string): string {
  if (product.price) return formatMinorAmount(product.price.amount_minor, product.price.currency, locale)
  return productPriceNote(product.details) ?? 'Price on request'
}
