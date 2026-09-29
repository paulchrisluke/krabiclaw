import { CONVERSION_EVENT_CATALOG, type ConversionItem, type ConversionValue, type OrganizationConversionEventName } from '~/utils/organization-conversion-events'
import { isCurrencyCode } from '~/shared/currencies'
import { minorAmountToMajor } from '~/shared/prices'

/**
 * The one projection from a native conversion to its Google Analytics event.
 * Browser (Zaraz web API), Zaraz HTTP Events API and Measurement Protocol all
 * send what this returns, so the same fact carries the same name, value and
 * dimensions whichever sender owns it. Amounts convert from minor units here,
 * once.
 */
export interface Ga4Item {
  item_id: string
  item_name: string
  item_variant?: string
  item_category?: string
  item_category2?: string
  item_category3?: string
  price: number
  quantity: number
}

export interface Ga4Projection {
  name: string
  params: Record<string, unknown>
  /** True when the event is a Zaraz/GA4 ecommerce event and must use the ecommerce API. */
  ecommerce: boolean
}

export function ga4Major(amountMinor: number, currency: string): number {
  if (!isCurrencyCode(currency)) throw new Error(`Unsupported currency for GA4 projection: ${currency}`)
  return Number(minorAmountToMajor(amountMinor, currency))
}

// GA4 item `price` is the (discounted) unit price. It is the exact line total over the quantity,
// so quantity x price reconciles with the line and no total is rounded into a different one.
function ga4UnitPrice(item: ConversionItem, currency: string): number {
  return ga4Major(item.amount_minor, currency) / item.quantity
}

export function ga4Items(items: readonly ConversionItem[], currency: string): Ga4Item[] {
  return items.map(({ amount_minor: _amount, ...item }) => ({ ...item, price: ga4UnitPrice({ ...item, amount_minor: _amount }, currency) }))
}

export interface Ga4ProjectionInput {
  eventName: OrganizationConversionEventName
  value?: ConversionValue | null
  /** Flat, allowlisted extras for the event (page_type, stage, location_id, purchase_type, ...). */
  params?: Record<string, string | number | boolean>
}

export function projectConversionToGa4(input: Ga4ProjectionInput): Ga4Projection {
  const definition = CONVERSION_EVENT_CATALOG[input.eventName]
  if (!definition.ga4) throw new Error(`${input.eventName} has no GA4 projection`)
  const params: Record<string, unknown> = { ...input.params }
  if (definition.conversionType) params.conversion_type = definition.conversionType
  const value = input.value
  if (!value) return { name: definition.ga4.name, params, ecommerce: false }

  params.currency = value.currency
  params.value = ga4Major(value.amount_minor, value.currency)
  if (value.basis === 'quoted') {
    // A custom event: flat dimensions, not ecommerce items. A quote is not revenue.
    params.value_basis = 'quoted'
    const item = value.items?.[0]
    if (item) Object.assign(params, { item_id: item.item_id, item_name: item.item_name, item_variant: item.item_variant, quantity: item.quantity, price: ga4UnitPrice(item, value.currency) })
    return { name: definition.ga4.name, params, ecommerce: false }
  }
  if (!value.transaction_id) throw new Error(`${input.eventName} requires a transaction identity`)
  params.transaction_id = value.transaction_id
  if (value.items?.length) params.items = ga4Items(value.items, value.currency)
  return { name: definition.ga4.name, params, ecommerce: true }
}
