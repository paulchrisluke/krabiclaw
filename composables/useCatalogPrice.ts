import type { Ref } from 'vue'
import type { Product } from '~/server/types/products'
import { isCurrencyCode } from '~/shared/currencies'
import { selectPrice } from '~/shared/prices'
import { formatProductMoney } from '~/utils/product-money'

/**
 * What a product costs in Catalog's scope, through the one price selection
 * contract. One location asks that location's price; the whole organization
 * asks every location's and shows the lowest, so a menu priced per branch does
 * not read as unpriced when no branch is chosen.
 */
export function useCatalogPrice(locationId: Ref<string | null>, locations: Ref<ReadonlyArray<{ id: string }>>) {
  const dashboard = useDashboardOrganization()
  const rawCurrency = dashboard.organization.value?.default_currency
  if (!isCurrencyCode(rawCurrency)) throw createError({ statusCode: 500, statusMessage: 'Unsupported organization currency' })
  const currency = rawCurrency

  function priceLabel(product: Product) {
    const at = new Date().toISOString()
    const scopes = locationId.value ? [locationId.value] : [null, ...locations.value.map(location => location.id)]
    const offers = scopes.flatMap(location_id => product.variants.flatMap(variant => selectPrice(variant.prices, { currency, location_id, at }) ?? []))
    const lowest = offers.reduce<typeof offers[number] | null>((best, offer) => (!best || offer.unit_amount < best.unit_amount ? offer : best), null)
    return formatProductMoney(lowest) ?? ''
  }

  return { priceLabel }
}
