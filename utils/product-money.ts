import type { Price, PriceSelection } from '~/shared/prices'
import { formatMinorAmount, selectPrice } from '~/shared/prices'
import type { ProductVariant } from '~/server/types/products'

/**
 * Render one resolved offer.
 *
 * Null means the caller omits the price element entirely. There is no
 * "Price on request" stand-in: text nobody supplied is not a price.
 */
export function formatProductMoney(price: Price | null, locale?: string): string | null {
  return price ? formatMinorAmount(price.unit_amount, price.currency, locale) : null
}

/**
 * The price a surface shows for one variant, in one currency and location.
 *
 * A thin pass-through to the one selection contract, so a component never
 * reaches into `variant.prices` and invents a rule of its own. It throws on an
 * ambiguous set and returns null when nothing applies — both are the surface's
 * problem to state, not to paper over.
 */
export function formatVariantPrice(variant: ProductVariant, selection: PriceSelection, locale?: string): string | null {
  return formatProductMoney(selectPrice(variant.prices, selection), locale)
}
