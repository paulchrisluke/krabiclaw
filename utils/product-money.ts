import type { Price } from '~/shared/prices'
import { formatMinorAmount } from '~/shared/prices'
import type { Product, ProductDetail } from '~/server/types/products'

// No generic "Price on request" fallback — null means the caller must omit
// the price element entirely rather than render text nobody supplied.
export function formatProductMoney(price: Price | null, locale?: string): string | null {
  return price ? formatMinorAmount(price.amount_minor, price.currency, locale) : null
}

export function productPriceNote(details: readonly ProductDetail[]): string | null {
  return details.find(detail => detail.key === 'price-note')?.values[0] ?? null
}

// Precedence is always numeric Price > explicit price-note > nothing — a
// stale note never overrides an active Price, and the absence of both is
// not synthesized into customer-facing text. Callers must render no price
// element at all when this returns null.
export function formatProductPriceLabel(product: Pick<Product, 'price' | 'details'>, locale?: string): string | null {
  if (product.price) return formatMinorAmount(product.price.amount_minor, product.price.currency, locale)
  return productPriceNote(product.details)
}
