import type Stripe from 'stripe'
import type { StripePlan } from '@better-auth/stripe'
import { queryAll, queryFirst, type DbClient } from '~/server/db'
import {
  invoiceSubscriptionId as resolveInvoiceSubscriptionId,
  resolveCanonicalSubscriptionPlan,
  selectCanonicalStripePrice,
  type StripePlanLoader,
} from '~/server/utils/better-auth-stripe'
import {
  validateOrganizationBillingProjection,
  type OrganizationBillingProjection,
  type OrganizationBillingProjectionRow,
} from '~/server/utils/organization-billing'
import { betterAuthTimestampToIso, type BetterAuthTimestamp } from '~/server/utils/better-auth-timestamps'
import { sha256CanonicalJson } from '~/server/utils/operator-approval'
import { assertDirectOperatorSession } from '~/server/utils/operator-session'
import { getPlanEntitlements, type EntitlementsMap } from '~/server/utils/billing-entitlements'
import { isKnownRecurringPlan, isNewSalePlan } from '~/shared/billing-model'
import { assertGrowthStripeCatalogPrices } from '~/server/utils/stripe-catalog'
import {
  invoiceLineIsProration,
  invoiceLineIsSubscription,
  invoiceLineExactQuantity,
  invoiceLinePrice,
  invoiceLineSubscriptionId,
  invoiceLineSubscriptionItemId,
  type StripeInvoiceLine,
} from '~/server/utils/stripe-invoice-lines'

export type OrganizationReconciliationProviderMode = 'test' | 'live'

export interface OrganizationSubscriptionReconciliationRequest {
  organizationId: string
  providerMode: OrganizationReconciliationProviderMode
  expectedStripeAccountId: string
}

export interface OrganizationReconciliationOrganization {
  id: string
  name?: string | null
  slug?: string | null
  stripeCustomerId?: string | null
}

export interface BetterAuthSubscriptionReadAdapter {
  findMany<T>(_input: {
    model: string
    where?: Array<{ field: string; value: unknown }>
    limit?: number
    sortBy?: { field: string; direction: 'asc' | 'desc' }
  }): Promise<T[]>
}

export type OrganizationReconciliationDriftSeverity = 'drift' | 'blocked'

export interface OrganizationReconciliationDrift {
  code: string
  severity: OrganizationReconciliationDriftSeverity
  subject: string
  detail: string
}

export interface OrganizationReconciliationBetterAuthSubscription {
  id: string | null
  referenceId: string | null
  ownerMetadataConflict: boolean
  plan: string | null
  status: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  periodStart: string | null
  periodEnd: string | null
  cancelAtPeriodEnd: boolean | null
  billingInterval: string | null
  seats: number | null
}

export interface OrganizationReconciliationProviderSubscription {
  id: string
  customerId: string | null
  status: string | null
  metadata: {
    organizationId: string | null
    organization_id: string | null
    referenceId: string | null
    subscriptionId: string | null
    ownerId: string | null
    ownerMetadataConflict: boolean
  }
  canonicalPlan: string | null
  canonicalBasePriceId: string | null
  canonicalBaseItemId: string | null
  billingInterval: string | null
  quantity: number | null
  periodStart: string | null
  periodEnd: string | null
  cancelAtPeriodEnd: boolean | null
  latestInvoiceId: string | null
  latestInvoice: OrganizationReconciliationProviderInvoice | null
  resolutionError?: string
}

export interface OrganizationReconciliationProviderInvoiceLine {
  id: string
  subscriptionId: string | null
  subscriptionItemId: string | null
  priceId: string | null
  quantity: number | null
  periodStart: string | null
  periodEnd: string | null
  proration: boolean
  subscriptionLine: boolean
}

export interface OrganizationReconciliationProviderInvoice {
  id: string
  subscriptionId: string | null
  status: string | null
  linesRetrieved: number
  linesComplete: boolean
  lines: OrganizationReconciliationProviderInvoiceLine[]
  baseLine: OrganizationReconciliationProviderInvoiceLine | null
}

export interface OrganizationReconciliationLocalEvidence {
  organizationEntitlements: Array<{
    key: string
    value: string | null
    source: string | null
  }>
  invoices: Array<{
    stripeInvoiceId: string
    stripeSubscriptionId: string
    basePlanPriceId: string | null
    status: string | null
    periodStart: string | null
    periodEnd: string | null
    lastEventId: string | null
  }>
  subscriptionVersions: Array<{
    stripeSubscriptionId: string
    lastEventCreated: number | null
    lastEventId: string | null
  }>
  webhookEvents: Array<{
    stripeEventId: string
    eventType: string | null
    status: string | null
    attemptCount: number | null
    deadLetteredAt: string | null
  }>
  sites: Array<{
    id: string
    plan: string | null
    status: string | null
  }>
  siteBilling: Array<{
    siteId: string
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    plan: string | null
    status: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean | null
  }>
  siteEntitlements: Array<{
    siteId: string
    key: string
    value: string | null
    source: string | null
  }>
}

export interface OrganizationSubscriptionReconciliationReport {
  schemaVersion: 1
  kind: 'organization-subscription-reconciliation'
  capturedAt: string
  operator: {
    actor: string
    direct: true
  }
  request: OrganizationSubscriptionReconciliationRequest
  provider: {
    mode: OrganizationReconciliationProviderMode
    expectedAccountId: string
    modeVerified: boolean
    account: {
      id: string | null
      verified: boolean
    }
    customer: {
      id: string | null
      discoveredByMetadataSearch: boolean
      deleted: boolean
      metadata: {
        organizationId: string | null
        organization_id: string | null
        ownerId: string | null
        ownerMetadataConflict: boolean
        customerType: string | null
      } | null
    }
    subscriptions: OrganizationReconciliationProviderSubscription[]
  }
  betterAuth: {
    organization: {
      id: string
      stripeCustomerId: string | null
    }
    subscriptions: OrganizationReconciliationBetterAuthSubscription[]
  }
  appProjection: {
    row: OrganizationBillingProjectionRow | null
    projection: OrganizationBillingProjection | null
    projectionError: string | null
  }
  effectiveEntitlements: EntitlementsMap
  localEvidence: OrganizationReconciliationLocalEvidence
  drifts: OrganizationReconciliationDrift[]
  status: 'match' | 'drift' | 'blocked'
  reportSha256: string
}

export type OrganizationReconciliationErrorCode =
  | 'invalid_request'
  | 'provider_mode_mismatch'
  | 'provider_configuration_missing'
  | 'organization_not_found'

export class OrganizationSubscriptionReconciliationError extends Error {
  readonly code: OrganizationReconciliationErrorCode
  readonly statusCode: number

  constructor(code: OrganizationReconciliationErrorCode, statusCode: number, message: string) {
    super(message)
    this.name = 'OrganizationSubscriptionReconciliationError'
    this.code = code
    this.statusCode = statusCode
  }
}

function fail(code: OrganizationReconciliationErrorCode, statusCode: number, message: string): never {
  throw new OrganizationSubscriptionReconciliationError(code, statusCode, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.trim() !== value) {
    fail('invalid_request', 400, `${field} must be a non-empty, unpadded string.`)
  }
  return value
}

/** Parse the deliberately small request surface. There is no preview/apply mode. */
export function parseOrganizationSubscriptionReconciliationRequest(value: unknown): OrganizationSubscriptionReconciliationRequest {
  if (!isRecord(value)) fail('invalid_request', 400, 'Request body must be an object.')
  const allowed = new Set(['organizationId', 'providerMode', 'expectedStripeAccountId'])
  const unknown = Object.keys(value).filter(key => !allowed.has(key))
  if (unknown.length > 0) fail('invalid_request', 400, 'Request contains unsupported fields.')

  const organizationId = exactString(value.organizationId, 'organizationId', 128)
  const providerMode = exactString(value.providerMode, 'providerMode', 4)
  if (providerMode !== 'test' && providerMode !== 'live') {
    fail('invalid_request', 400, 'providerMode must be test or live.')
  }
  const expectedStripeAccountId = exactString(value.expectedStripeAccountId, 'expectedStripeAccountId', 64)
  if (!/^acct_[A-Za-z0-9]+$/u.test(expectedStripeAccountId)) {
    fail('invalid_request', 400, 'expectedStripeAccountId is malformed.')
  }
  return { organizationId, providerMode, expectedStripeAccountId }
}

export function assertOrganizationSubscriptionReconciliationOperatorSession(session: unknown): string {
  return assertDirectOperatorSession(session)
}

/** Validate the key prefix before constructing a Stripe client or doing a provider read. */
export function assertStripeProviderMode(secretKey: string | undefined, providerMode: OrganizationReconciliationProviderMode): void {
  if (typeof secretKey !== 'string' || !secretKey.trim()) {
    fail('provider_configuration_missing', 503, 'Stripe provider configuration is unavailable.')
  }
  const match = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/u.exec(secretKey)
  if (!match || match[1] !== providerMode) {
    fail('provider_mode_mismatch', 503, 'Stripe secret key mode does not match the requested provider mode.')
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nullableBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1
  if (typeof value === 'string') {
    if (value === '1' || value.toLowerCase() === 'true') return true
    if (value === '0' || value.toLowerCase() === 'false') return false
  }
  return null
}

function safeTimestamp(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null
  try {
    return betterAuthTimestampToIso(value as BetterAuthTimestamp, field)
  } catch {
    return null
  }
}

function isoFromUnix(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const date = new Date(value * 1000)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function metadataValue(metadata: Stripe.Metadata | null | undefined, key: string): string | null {
  return nullableString(metadata?.[key])
}

interface ResolvedOwnerMetadata {
  referenceId: string | null
  organizationId: string | null
  organization_id: string | null
  ownerId: string | null
  conflict: boolean
}

function resolveOwnerMetadata(metadata: Stripe.Metadata | null | undefined): ResolvedOwnerMetadata {
  const referenceId = metadataValue(metadata, 'referenceId')
  const organizationId = metadataValue(metadata, 'organizationId')
  const organization_id = metadataValue(metadata, 'organization_id')
  const values = [...new Set([referenceId, organizationId, organization_id].filter((value): value is string => Boolean(value)))]
  return {
    referenceId,
    organizationId,
    organization_id,
    ownerId: values[0] ?? null,
    conflict: values.length > 1,
  }
}

interface ResolvedCustomerOwnerMetadata {
  organizationId: string | null
  organization_id: string | null
  ownerId: string | null
  conflict: boolean
}

function resolveCustomerOwnerMetadata(metadata: Stripe.Metadata | null | undefined): ResolvedCustomerOwnerMetadata {
  const organizationId = metadataValue(metadata, 'organizationId')
  const organization_id = metadataValue(metadata, 'organization_id')
  const values = [...new Set([organizationId, organization_id].filter((value): value is string => Boolean(value)))]
  return {
    organizationId,
    organization_id,
    ownerId: values[0] ?? null,
    conflict: values.length > 1,
  }
}

function providerCustomerId(value: Stripe.Subscription['customer']): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id.trim()) {
    return value.id.trim()
  }
  return null
}

function assertProviderPageRows<T extends { id?: unknown }>(
  rows: T[],
  subject: string,
): asserts rows is Array<T & { id: string }> {
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => typeof row?.id !== 'string' || !row.id.trim())) {
    throw new ReconciliationProviderReadBoundError('provider_catalog_malformed', `${subject} returned malformed rows.`)
  }
}

async function loadBoundedStripeCatalog(
  stripe: Stripe,
  includeFeatureDisabled: boolean,
): Promise<StripePlan[]> {
  const products: Stripe.Product[] = []
  let productsStartingAfter: string | undefined
  let productsComplete = false
  for (let pageNumber = 0; pageNumber < MAX_PROVIDER_CATALOG_PAGES; pageNumber += 1) {
    const page = await stripe.products.list({
      active: true,
      limit: 100,
      ...(productsStartingAfter ? { starting_after: productsStartingAfter } : {}),
    })
    assertProviderPageRows(page.data, 'Stripe product catalog')
    products.push(...page.data)
    if (typeof page.has_more !== 'boolean') {
      throw new ReconciliationProviderReadBoundError('provider_catalog_malformed', 'Stripe product catalog omitted has_more.')
    }
    if (!page.has_more) {
      productsComplete = true
      break
    }
    productsStartingAfter = page.data.at(-1)?.id
    if (!productsStartingAfter || pageNumber === MAX_PROVIDER_CATALOG_PAGES - 1) {
      throw new ReconciliationProviderReadBoundError('provider_catalog_unbounded', 'Stripe product catalog exceeded the bounded reconciliation window.')
    }
  }
  if (!productsComplete) {
    throw new ReconciliationProviderReadBoundError('provider_catalog_unbounded', 'Stripe product catalog exceeded the bounded reconciliation window.')
  }

  const prices: Stripe.Price[] = []
  let pricesStartingAfter: string | undefined
  let pricesComplete = false
  for (let pageNumber = 0; pageNumber < MAX_PROVIDER_CATALOG_PAGES; pageNumber += 1) {
    const page = await stripe.prices.list({
      active: true,
      type: 'recurring',
      limit: 100,
      ...(pricesStartingAfter ? { starting_after: pricesStartingAfter } : {}),
    })
    assertProviderPageRows(page.data, 'Stripe price catalog')
    prices.push(...page.data)
    if (typeof page.has_more !== 'boolean') {
      throw new ReconciliationProviderReadBoundError('provider_catalog_malformed', 'Stripe price catalog omitted has_more.')
    }
    if (!page.has_more) {
      pricesComplete = true
      break
    }
    pricesStartingAfter = page.data.at(-1)?.id
    if (!pricesStartingAfter || pageNumber === MAX_PROVIDER_CATALOG_PAGES - 1) {
      throw new ReconciliationProviderReadBoundError('provider_catalog_unbounded', 'Stripe price catalog exceeded the bounded reconciliation window.')
    }
  }
  if (!pricesComplete) {
    throw new ReconciliationProviderReadBoundError('provider_catalog_unbounded', 'Stripe price catalog exceeded the bounded reconciliation window.')
  }

  const pricesByProduct = new Map<string, Stripe.Price[]>()
  for (const price of prices) {
    const productId = typeof price.product === 'string' ? price.product : price.product?.id
    if (typeof productId !== 'string' || !productId.trim()) {
      throw new ReconciliationProviderReadBoundError('provider_catalog_malformed', `Stripe price ${price.id} has no product identity.`)
    }
    const productPrices = pricesByProduct.get(productId) ?? []
    productPrices.push(price)
    pricesByProduct.set(productId, productPrices)
  }

  const plans: StripePlan[] = []
  const planIds = new Set<string>()
  for (const product of products) {
    const planId = product.metadata?.plan_id?.trim().toLowerCase()
    if (!planId || !isKnownRecurringPlan(planId)) continue
    if (!includeFeatureDisabled && !isNewSalePlan(planId)) continue
    if (planIds.has(planId)) throw new Error(`Stripe has multiple active products for plan ${planId}`)

    const billablePrices = (pricesByProduct.get(product.id) ?? []).filter(
      price => typeof price.unit_amount === 'number' && price.unit_amount > 0,
    )
    const monthly = selectCanonicalStripePrice(product, billablePrices, 'month')
    if (!monthly) throw new Error(`Stripe product ${product.id} for plan ${planId} is missing a canonical monthly price`)
    const yearly = selectCanonicalStripePrice(product, billablePrices, 'year')
    if (isNewSalePlan(planId)) assertGrowthStripeCatalogPrices(monthly, yearly)
    if (yearly && yearly.currency !== monthly.currency) {
      throw new Error(`Stripe product ${product.id} has monthly and annual prices in different currencies`)
    }
    const configuredCurrency = product.metadata?.currency?.trim().toLowerCase()
    if (configuredCurrency && configuredCurrency !== monthly.currency.toLowerCase()) {
      throw new Error(`Stripe product ${product.id} currency metadata does not match its canonical price`)
    }
    plans.push({
      name: planId,
      priceId: monthly.id,
      ...(monthly.lookup_key?.trim() ? { lookupKey: monthly.lookup_key.trim() } : {}),
      annualDiscountPriceId: yearly?.id,
      ...(yearly?.lookup_key?.trim() ? { annualDiscountLookupKey: yearly.lookup_key.trim() } : {}),
      limits: getPlanEntitlements(planId),
      group: 'krabiclaw',
      ...(product.metadata?.seat_price_id?.trim() ? { seatPriceId: product.metadata.seat_price_id.trim() } : {}),
    })
    planIds.add(planId)
  }
  return plans
}

function createBoundedReconciliationPlanLoader(stripe: Stripe): StripePlanLoader {
  let snapshot: Promise<StripePlan[]> | null = null
  return async (options = {}) => {
    if (!snapshot) snapshot = loadBoundedStripeCatalog(stripe, Boolean(options.includeFeatureDisabled))
    return await snapshot
  }
}

function createBoundedHistoricalProvider(stripe: Stripe): Stripe {
  let lookupCount = 0
  const pricesResource = stripe.prices
  const productsResource = stripe.products
  const boundedPrices = Object.assign({}, stripe.prices, {
    retrieve: async (...args: Parameters<typeof stripe.prices.retrieve>) => {
      if (lookupCount >= MAX_PROVIDER_HISTORICAL_LOOKUPS) {
        throw new ReconciliationProviderReadBoundError('provider_historical_unbounded', 'Historical Stripe price resolution exceeded the bounded reconciliation window.')
      }
      if (!pricesResource || typeof pricesResource.retrieve !== 'function') {
        throw new ReconciliationProviderReadBoundError('provider_catalog_malformed', 'Stripe price retrieval is unavailable for historical resolution.')
      }
      lookupCount += 1
      return await pricesResource.retrieve(...args)
    },
  })
  const boundedProducts = Object.assign({}, stripe.products, {
    retrieve: async (...args: Parameters<typeof stripe.products.retrieve>) => {
      if (lookupCount >= MAX_PROVIDER_HISTORICAL_LOOKUPS) {
        throw new ReconciliationProviderReadBoundError('provider_historical_unbounded', 'Historical Stripe product resolution exceeded the bounded reconciliation window.')
      }
      if (!productsResource || typeof productsResource.retrieve !== 'function') {
        throw new ReconciliationProviderReadBoundError('provider_catalog_malformed', 'Stripe product retrieval is unavailable for historical resolution.')
      }
      lookupCount += 1
      return await productsResource.retrieve(...args)
    },
  })
  return Object.assign({}, stripe, { prices: boundedPrices, products: boundedProducts }) as Stripe
}

async function searchOrganizationCustomers(
  stripe: Stripe,
  organizationId: string,
): Promise<{ ids: string[]; hasMore: boolean }> {
  const ids = new Set<string>()
  let hasMore = false
  for (const key of ['organizationId', 'organization_id']) {
    const searchResult = await stripe.customers.search({
      query: `metadata["${key}"]:"${escapeSearchValue(organizationId)}"`,
      limit: 100,
    })
    if (!Array.isArray(searchResult.data) || typeof searchResult.has_more !== 'boolean') {
      throw new ReconciliationProviderReadBoundError('provider_search_malformed', 'Stripe customer metadata search returned malformed pagination evidence.')
    }
    if (searchResult.data.length > 100) {
      throw new ReconciliationProviderReadBoundError('provider_search_unbounded', 'Stripe customer metadata search returned more than its bounded page size.')
    }
    for (const customer of searchResult.data) {
      if (typeof customer?.id !== 'string' || !customer.id.trim()) {
        throw new ReconciliationProviderReadBoundError('provider_search_malformed', 'Stripe customer metadata search returned a customer without an id.')
      }
      ids.add(customer.id)
    }
    if (searchResult.has_more) {
      hasMore = true
    }
  }
  return { ids: [...ids].sort(), hasMore }
}

async function searchOrganizationSubscriptions(
  stripe: Stripe,
  organizationId: string,
): Promise<{ subscriptions: Stripe.Subscription[]; customerIds: string[]; hasMore: boolean }> {
  const subscriptionsById = new Map<string, Stripe.Subscription>()
  let hasMore = false
  for (const key of ['referenceId', 'organizationId', 'organization_id']) {
    let page: string | undefined
    for (let pageNumber = 0; pageNumber < MAX_PROVIDER_SEARCH_PAGES; pageNumber += 1) {
      const searchResult = await stripe.subscriptions.search({
        query: `metadata["${key}"]:"${escapeSearchValue(organizationId)}"`,
        limit: 100,
        ...(page ? { page } : {}),
      })
      if (!Array.isArray(searchResult.data) || typeof searchResult.has_more !== 'boolean') {
        throw new ReconciliationProviderReadBoundError('provider_search_malformed', 'Stripe subscription metadata search returned malformed pagination evidence.')
      }
      if (searchResult.data.length > 100) {
        throw new ReconciliationProviderReadBoundError('provider_search_unbounded', 'Stripe subscription metadata search returned more than its bounded page size.')
      }
      for (const subscription of searchResult.data) {
        if (typeof subscription?.id !== 'string' || !subscription.id.trim()) {
          throw new ReconciliationProviderReadBoundError('provider_search_malformed', 'Stripe subscription metadata search returned a subscription without an id.')
        }
        subscriptionsById.set(subscription.id, subscription)
      }
      if (!searchResult.has_more) break
      if (typeof searchResult.next_page !== 'string' || !searchResult.next_page.trim() || pageNumber === MAX_PROVIDER_SEARCH_PAGES - 1) {
        hasMore = true
        break
      }
      page = searchResult.next_page
    }
  }
  const subscriptions = [...subscriptionsById.values()].sort((a, b) => a.id.localeCompare(b.id))
  const customerIds = [...new Set(subscriptions
    .map(subscription => providerCustomerId(subscription.customer))
    .filter((value): value is string => Boolean(value)))].sort()
  return { subscriptions, customerIds, hasMore }
}

function invoiceId(value: Stripe.Subscription['latest_invoice']): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id
  return null
}

function invoiceLinePriceId(line: StripeInvoiceLine): string | null {
  const price = invoiceLinePrice(line)
  if (typeof price === 'string' && price.trim()) return price.trim()
  if (price && typeof price === 'object' && typeof price.id === 'string' && price.id.trim()) return price.id.trim()
  return null
}

function invoiceLinePeriod(value: unknown): { start: string | null; end: string | null } {
  if (!value || typeof value !== 'object') return { start: null, end: null }
  const period = value as { start?: unknown; end?: unknown }
  return {
    start: isoFromUnix(period.start),
    end: isoFromUnix(period.end),
  }
}

function normalizeProviderInvoiceLine(line: StripeInvoiceLine): OrganizationReconciliationProviderInvoiceLine {
  const lineId = (line as { id?: unknown }).id
  if (typeof lineId !== 'string' || !lineId.trim()) {
    throw new ReconciliationProviderReadBoundError('provider_invoice_malformed', 'Stripe invoice line omitted an id.')
  }
  const period = invoiceLinePeriod(line.period)
  return {
    id: lineId,
    subscriptionId: invoiceLineSubscriptionId(line),
    subscriptionItemId: invoiceLineSubscriptionItemId(line),
    priceId: invoiceLinePriceId(line),
    quantity: invoiceLineExactQuantity(line),
    periodStart: period.start,
    periodEnd: period.end,
    proration: invoiceLineIsProration(line),
    subscriptionLine: invoiceLineIsSubscription(line),
  }
}

async function readBoundedProviderInvoice(
  stripe: Stripe,
  invoiceId: string,
  subscriptionId: string,
  canonicalBasePriceId: string | null,
  canonicalBaseItemId: string | null,
  canonicalQuantity: number | null,
): Promise<OrganizationReconciliationProviderInvoice> {
  if (!stripe.invoices || typeof stripe.invoices.retrieve !== 'function') {
    throw new ReconciliationProviderReadBoundError('provider_invoice_malformed', 'Stripe invoice retrieval is unavailable.')
  }
  const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ['lines.data.pricing.price_details.price'],
  }) as unknown as Stripe.Invoice & { lines?: Stripe.ApiList<StripeInvoiceLine> | null }
  if (!invoice || invoice.id !== invoiceId) {
    throw new ReconciliationProviderReadBoundError('provider_invoice_malformed', 'Stripe invoice retrieval returned the wrong invoice identity.')
  }

  let rawLines: StripeInvoiceLine[]
  const embeddedLines = invoice.lines?.data
  if (Array.isArray(embeddedLines) && invoice.lines && invoice.lines.has_more === false) {
    if (embeddedLines.length > MAX_PROVIDER_INVOICE_LINES) {
      throw new ReconciliationProviderReadBoundError('provider_invoice_lines_unbounded', 'Stripe invoice lines exceeded the bounded reconciliation window.')
    }
    rawLines = embeddedLines
  } else {
    if (!stripe.invoices.listLineItems || typeof stripe.invoices.listLineItems !== 'function') {
      throw new ReconciliationProviderReadBoundError('provider_invoice_malformed', 'Stripe invoice line retrieval is unavailable.')
    }
    const page = await stripe.invoices.listLineItems(invoiceId, {
      limit: MAX_PROVIDER_INVOICE_LINES,
      expand: ['data.pricing.price_details.price'],
    }) as unknown as { data?: StripeInvoiceLine[]; has_more?: unknown }
    if (!Array.isArray(page.data) || page.data.length > MAX_PROVIDER_INVOICE_LINES || typeof page.has_more !== 'boolean') {
      throw new ReconciliationProviderReadBoundError('provider_invoice_malformed', 'Stripe invoice line retrieval returned malformed pagination evidence.')
    }
    if (page.has_more) {
      throw new ReconciliationProviderReadBoundError('provider_invoice_lines_unbounded', 'Stripe invoice lines exceeded the bounded reconciliation window.')
    }
    rawLines = page.data
  }
  const lines = rawLines.map(normalizeProviderInvoiceLine)
  const matchingLines = lines.filter(line =>
    line.subscriptionLine
    && !line.proration
    && line.subscriptionId === subscriptionId,
  )
  const canonicalLines = canonicalBasePriceId && canonicalBaseItemId && canonicalQuantity
    ? matchingLines.filter(line =>
        line.priceId === canonicalBasePriceId
        && line.subscriptionItemId === canonicalBaseItemId
        && line.quantity === canonicalQuantity,
      )
    : []
  return {
    id: invoiceId,
    subscriptionId: resolveInvoiceSubscriptionId(invoice),
    status: nullableString(invoice.status),
    linesRetrieved: lines.length,
    linesComplete: true,
    lines,
    baseLine: canonicalLines.length === 1 ? (canonicalLines[0] ?? null) : null,
  }
}

function compareProviderInvoiceCoverage(
  drifts: OrganizationReconciliationDrift[],
  provider: OrganizationReconciliationProviderSubscription,
): void {
  if (provider.status !== 'active') return
  const invoice = provider.latestInvoice
  if (!invoice) {
    addDrift(drifts, 'provider_invoice_missing', 'blocked', provider.id, 'Active provider subscription has no retrievable latest invoice evidence.')
    return
  }
  if (invoice.subscriptionId !== provider.id) {
    addDrift(drifts, 'provider_invoice_subscription_mismatch', 'blocked', invoice.id, 'Latest provider invoice points at a different subscription.')
  }
  if (invoice.status !== 'paid') {
    addDrift(drifts, 'provider_invoice_payment_unconfirmed', 'blocked', invoice.id, 'Active provider subscription lacks an invoice with paid status.')
  }
  const subscriptionLines = invoice.lines.filter(line =>
    line.subscriptionLine
    && !line.proration
    && line.subscriptionId === provider.id,
  )
  const canonicalLines = provider.canonicalBasePriceId && provider.canonicalBaseItemId && provider.quantity
    ? subscriptionLines.filter(line =>
        line.priceId === provider.canonicalBasePriceId
        && line.subscriptionItemId === provider.canonicalBaseItemId
        && line.quantity === provider.quantity,
      )
    : []
  if (!provider.canonicalBasePriceId) {
    addDrift(drifts, 'provider_invoice_base_price_unresolved', 'blocked', invoice.id, 'Active provider subscription has no canonical recurring base price.')
  } else if (!provider.canonicalBaseItemId) {
    addDrift(drifts, 'provider_invoice_base_item_unresolved', 'blocked', invoice.id, 'Active provider subscription has no canonical recurring base item.')
  } else if (provider.quantity !== 1) {
    addDrift(drifts, 'provider_invoice_base_quantity_invalid', 'blocked', invoice.id, 'Active provider subscription canonical base quantity is not exactly one.')
  } else if (canonicalLines.length === 0) {
    if (subscriptionLines.length === 0) {
      addDrift(drifts, 'provider_invoice_base_line_missing', 'blocked', invoice.id, 'Latest paid invoice has no non-proration subscription base line for the active subscription.')
    } else {
      addDrift(drifts, 'provider_invoice_base_price_mismatch', 'blocked', invoice.id, 'Latest paid invoice subscription lines do not match the canonical recurring base price, item, and quantity.')
    }
  } else if (canonicalLines.length > 1) {
    addDrift(drifts, 'provider_invoice_base_line_ambiguous', 'blocked', invoice.id, 'Latest paid invoice has multiple canonical recurring base lines for the active subscription.')
  }
  const baseLine = invoice.baseLine
  if (!baseLine || !provider.periodEnd) return
  const baseLineStart = baseLine.periodStart ? Date.parse(baseLine.periodStart) : Number.NaN
  const baseLineEnd = baseLine.periodEnd ? Date.parse(baseLine.periodEnd) : Number.NaN
  const providerEnd = Date.parse(provider.periodEnd)
  if (
    !Number.isFinite(baseLineStart)
    || !Number.isFinite(baseLineEnd)
    || !Number.isFinite(providerEnd)
    || baseLineStart >= baseLineEnd
    || baseLineEnd < providerEnd
  ) {
    addDrift(drifts, 'provider_invoice_base_line_period_insufficient', 'blocked', invoice.id, 'Canonical paid invoice base-line period does not cover the provider subscription period end.')
  }
}

function currentSubscriptionStatus(status: string | null): boolean {
  return Boolean(status && !['canceled', 'cancelled', 'incomplete_expired'].includes(status))
}

const KNOWN_PROVIDER_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'cancelled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
])

const MAX_PROVIDER_SEARCH_PAGES = 10
const MAX_PROVIDER_SUBSCRIPTION_PAGES = 10
const MAX_PROVIDER_CATALOG_PAGES = 10
const MAX_PROVIDER_HISTORICAL_LOOKUPS = 100
const MAX_PROVIDER_CURRENT_INVOICE_READS = 10
const MAX_PROVIDER_INVOICE_LINES = 100
const MAX_LOCAL_EVIDENCE_ROWS = 1_000
const MAX_LOCAL_INVOICE_ROWS = 100
const MAX_D1_BOUND_PARAMETERS = 100
const MAX_IDS_PER_D1_QUERY = MAX_D1_BOUND_PARAMETERS - 1

class ReconciliationProviderReadBoundError extends Error {
  readonly code:
    | 'provider_catalog_unbounded'
    | 'provider_catalog_malformed'
    | 'provider_search_malformed'
    | 'provider_search_unbounded'
    | 'provider_historical_unbounded'
    | 'provider_invoice_malformed'
    | 'provider_invoice_lines_unbounded'

  constructor(
    code: 'provider_catalog_unbounded'
      | 'provider_catalog_malformed'
      | 'provider_search_malformed'
      | 'provider_search_unbounded'
      | 'provider_historical_unbounded'
      | 'provider_invoice_malformed'
      | 'provider_invoice_lines_unbounded',
    message: string,
  ) {
    super(message)
    this.name = 'ReconciliationProviderReadBoundError'
    this.code = code
  }
}

class ReconciliationLocalEvidenceBoundError extends Error {
  readonly subject: string
  readonly limit: number

  constructor(subject: string, limit: number) {
    super(`${subject} exceeded the bounded local evidence limit of ${limit} rows.`)
    this.name = 'ReconciliationLocalEvidenceBoundError'
    this.subject = subject
    this.limit = limit
  }
}

function isPositiveSafeInteger(value: number | null): boolean {
  return value !== null && Number.isSafeInteger(value) && value > 0
}

function hasOrderedPeriod(periodStart: string | null, periodEnd: string | null): boolean {
  if (!periodStart || !periodEnd) return false
  const start = Date.parse(periodStart)
  const end = Date.parse(periodEnd)
  return Number.isFinite(start) && Number.isFinite(end) && start < end
}


function addDrift(
  drifts: OrganizationReconciliationDrift[],
  code: string,
  severity: OrganizationReconciliationDriftSeverity,
  subject: string,
  detail: string,
): void {
  drifts.push({ code, severity, subject, detail })
}

function sortDrifts(drifts: OrganizationReconciliationDrift[]): OrganizationReconciliationDrift[] {
  return [...drifts].sort((a, b) => `${a.code}:${a.subject}:${a.detail}`.localeCompare(`${b.code}:${b.subject}:${b.detail}`))
}

function sortById<T extends { id?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
}

function normalizeBetterAuthSubscription(row: Record<string, unknown>): OrganizationReconciliationBetterAuthSubscription {
  const referenceId = nullableString(row.referenceId)
  const legacyReferenceId = nullableString(row.reference_id)
  const ownerMetadataConflict = Boolean(referenceId && legacyReferenceId && referenceId !== legacyReferenceId)
  return {
    id: nullableString(row.id),
    referenceId: referenceId ?? legacyReferenceId,
    ownerMetadataConflict,
    plan: nullableString(row.plan),
    status: nullableString(row.status),
    stripeCustomerId: nullableString(row.stripeCustomerId ?? row.stripe_customer_id),
    stripeSubscriptionId: nullableString(row.stripeSubscriptionId ?? row.stripe_subscription_id),
    periodStart: safeTimestamp(row.periodStart ?? row.period_start, 'subscription.periodStart'),
    periodEnd: safeTimestamp(row.periodEnd ?? row.period_end, 'subscription.periodEnd'),
    cancelAtPeriodEnd: nullableBoolean(row.cancelAtPeriodEnd ?? row.cancel_at_period_end),
    billingInterval: nullableString(row.billingInterval ?? row.billing_interval),
    seats: nullableNumber(row.seats),
  }
}

function normalizeProjectionRow(row: OrganizationBillingProjectionRow | null): OrganizationBillingProjectionRow | null {
  if (!row) return null
  return {
    organization_id: nullableString(row.organization_id),
    stripe_customer_id: nullableString(row.stripe_customer_id),
    stripe_subscription_id: nullableString(row.stripe_subscription_id),
    plan: nullableString(row.plan),
    status: nullableString(row.status),
    payment_status: nullableString(row.payment_status),
    paid_through: nullableString(row.paid_through),
    past_due_since: nullableString(row.past_due_since),
    current_period_end: nullableString(row.current_period_end),
    cancel_at_period_end: nullableBoolean(row.cancel_at_period_end),
    updated_at: nullableString(row.updated_at),
  }
}

function normalizeProviderSubscription(
  subscription: Stripe.Subscription,
  resolved: { item: Stripe.SubscriptionItem; plan: StripePlan } | null,
  resolutionError?: string,
): OrganizationReconciliationProviderSubscription {
  const item = resolved?.item ?? subscription.items.data[0]
  const ownerMetadata = resolveOwnerMetadata(subscription.metadata)
  return {
    id: subscription.id,
    customerId: providerCustomerId(subscription.customer),
    status: nullableString(subscription.status),
    metadata: {
      organizationId: ownerMetadata.organizationId,
      organization_id: ownerMetadata.organization_id,
      referenceId: ownerMetadata.referenceId,
      subscriptionId: metadataValue(subscription.metadata, 'subscriptionId'),
      ownerId: ownerMetadata.ownerId,
      ownerMetadataConflict: ownerMetadata.conflict,
    },
    canonicalPlan: resolved?.plan.name ?? null,
    canonicalBasePriceId: resolved?.item.price.id ?? null,
    canonicalBaseItemId: resolved?.item.id ?? null,
    billingInterval: nullableString(item?.price?.recurring?.interval),
    quantity: nullableNumber(item?.quantity),
    periodStart: isoFromUnix(item?.current_period_start),
    periodEnd: isoFromUnix(item?.current_period_end),
    cancelAtPeriodEnd: nullableBoolean(subscription.cancel_at_period_end),
    latestInvoiceId: invoiceId(subscription.latest_invoice),
    latestInvoice: null,
    ...(resolutionError ? { resolutionError } : {}),
  }
}

function isDeletedCustomer(value: Stripe.Customer | Stripe.DeletedCustomer): value is Stripe.DeletedCustomer {
  return 'deleted' in value && value.deleted === true
}

function escapeSearchValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function emptyLocalEvidence(): OrganizationReconciliationLocalEvidence {
  return {
    organizationEntitlements: [],
    invoices: [],
    subscriptionVersions: [],
    webhookEvents: [],
    sites: [],
    siteBilling: [],
    siteEntitlements: [],
  }
}

function chunksOf<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function statusFromDrifts(drifts: OrganizationReconciliationDrift[]): 'match' | 'drift' | 'blocked' {
  if (drifts.some(drift => drift.severity === 'blocked')) return 'blocked'
  return drifts.length > 0 ? 'drift' : 'match'
}

function accountMatches(
  account: Stripe.Account,
  request: OrganizationSubscriptionReconciliationRequest,
): boolean {
  return account.id === request.expectedStripeAccountId
}

function compareValue(
  drifts: OrganizationReconciliationDrift[],
  code: string,
  subject: string,
  left: unknown,
  right: unknown,
  severity: OrganizationReconciliationDriftSeverity = 'drift',
): void {
  if (left !== right) {
    addDrift(drifts, code, severity, subject, `Observed values differ (${String(left)} != ${String(right)}).`)
  }
}

function compareSubscriptionPair(
  drifts: OrganizationReconciliationDrift[],
  betterAuth: OrganizationReconciliationBetterAuthSubscription,
  provider: OrganizationReconciliationProviderSubscription,
): void {
  compareValue(drifts, 'subscription_id_mismatch', 'subscription.id', betterAuth.stripeSubscriptionId, provider.id, 'blocked')
  compareValue(drifts, 'subscription_customer_mismatch', 'subscription.customer', betterAuth.stripeCustomerId, provider.customerId, 'blocked')
  compareValue(drifts, 'subscription_plan_mismatch', 'subscription.plan', betterAuth.plan, provider.canonicalPlan, 'blocked')
  compareValue(drifts, 'subscription_status_mismatch', 'subscription.status', betterAuth.status, provider.status)
  compareValue(drifts, 'subscription_period_start_mismatch', 'subscription.periodStart', betterAuth.periodStart, provider.periodStart)
  compareValue(drifts, 'subscription_period_end_mismatch', 'subscription.periodEnd', betterAuth.periodEnd, provider.periodEnd)
  compareValue(drifts, 'subscription_cancel_mismatch', 'subscription.cancelAtPeriodEnd', betterAuth.cancelAtPeriodEnd, provider.cancelAtPeriodEnd)
  compareValue(drifts, 'subscription_interval_mismatch', 'subscription.billingInterval', betterAuth.billingInterval, provider.billingInterval)
  compareValue(drifts, 'subscription_quantity_mismatch', 'subscription.seats', betterAuth.seats, provider.quantity)
  if (betterAuth.ownerMetadataConflict) {
    addDrift(drifts, 'better_auth_subscription_owner_metadata_conflict', 'blocked', betterAuth.id ?? 'unknown', 'Better Auth subscription owner metadata keys conflict.')
  }
  if (provider.metadata.subscriptionId && provider.metadata.subscriptionId !== (betterAuth.id ?? provider.id)) {
    addDrift(drifts, 'provider_subscription_metadata_id_mismatch', 'blocked', provider.id, 'Provider subscriptionId metadata differs from Better Auth.')
  }
}

async function readLocalEvidence(db: DbClient, organizationId: string, subscriptionIds: string[]): Promise<OrganizationReconciliationLocalEvidence> {
  const organizationEntitlements = await queryAll<{
    key: string
    value: string | null
    source: string | null
  }>(db, `
     SELECT key, value, source
      FROM organization_entitlements
     WHERE organization_id = ? ORDER BY key, source LIMIT ?
  `, [organizationId, MAX_LOCAL_EVIDENCE_ROWS + 1])
  if (organizationEntitlements.length > MAX_LOCAL_EVIDENCE_ROWS) {
    throw new ReconciliationLocalEvidenceBoundError('organization_entitlements', MAX_LOCAL_EVIDENCE_ROWS)
  }
  const invoices = await queryAll<{
    stripe_invoice_id: string
    stripe_subscription_id: string
    base_plan_price_id: string | null
    status: string | null
    period_start: string | null
    period_end: string | null
    last_event_id: string | null
  }>(db, `
    SELECT stripe_invoice_id, stripe_subscription_id, base_plan_price_id, status,
           period_start, period_end, last_event_id
      FROM stripe_invoice_payments
     WHERE organization_id = ?
     ORDER BY period_end DESC, stripe_invoice_id ASC
     LIMIT ?
  `, [organizationId, MAX_LOCAL_INVOICE_ROWS + 1])
  if (invoices.length > MAX_LOCAL_INVOICE_ROWS) {
    throw new ReconciliationLocalEvidenceBoundError('stripe_invoice_payments', MAX_LOCAL_INVOICE_ROWS)
  }
  const versions: Array<{
    stripe_subscription_id: string
    last_event_created: number | null
    last_event_id: string | null
  }> = []
  for (const subscriptionIdChunk of chunksOf(subscriptionIds, MAX_IDS_PER_D1_QUERY)) {
    const rows = await queryAll<{
      stripe_subscription_id: string
      last_event_created: number | null
      last_event_id: string | null
    }>(db, `
        SELECT stripe_subscription_id, last_event_created, last_event_id
         FROM stripe_subscription_versions
         WHERE stripe_subscription_id IN (${subscriptionIdChunk.map(() => '?').join(', ')})
         ORDER BY stripe_subscription_id LIMIT ?
    `, [...subscriptionIdChunk, MAX_LOCAL_EVIDENCE_ROWS + 1])
    versions.push(...rows)
    if (versions.length > MAX_LOCAL_EVIDENCE_ROWS) {
      throw new ReconciliationLocalEvidenceBoundError('stripe_subscription_versions', MAX_LOCAL_EVIDENCE_ROWS)
    }
  }
  const eventIds = [...new Set([
    ...invoices.map(invoice => invoice.last_event_id).filter((value): value is string => Boolean(value)),
    ...versions.map(version => version.last_event_id).filter((value): value is string => Boolean(value)),
  ])].sort()
  const webhooks: Array<{
    stripe_event_id: string
    event_type: string | null
    status: string | null
    attempt_count: number | null
    dead_lettered_at: string | null
  }> = []
  for (const eventIdChunk of chunksOf(eventIds, MAX_IDS_PER_D1_QUERY)) {
    const rows = await queryAll<{
      stripe_event_id: string
      event_type: string | null
      status: string | null
      attempt_count: number | null
      dead_lettered_at: string | null
    }>(db, `
        SELECT stripe_event_id, event_type, status, attempt_count, dead_lettered_at
          FROM stripe_webhook_events
         WHERE stripe_event_id IN (${eventIdChunk.map(() => '?').join(', ')})
         ORDER BY stripe_event_id LIMIT ?
    `, [...eventIdChunk, MAX_LOCAL_EVIDENCE_ROWS + 1])
    webhooks.push(...rows)
    if (webhooks.length > MAX_LOCAL_EVIDENCE_ROWS) {
      throw new ReconciliationLocalEvidenceBoundError('stripe_webhook_events', MAX_LOCAL_EVIDENCE_ROWS)
    }
  }
  const sites = await queryAll<{ id: string; plan: string | null; status: string | null }>(db, `
    SELECT id, plan, status FROM sites WHERE organization_id = ? ORDER BY id LIMIT ?
  `, [organizationId, MAX_LOCAL_EVIDENCE_ROWS + 1])
  if (sites.length > MAX_LOCAL_EVIDENCE_ROWS) {
    throw new ReconciliationLocalEvidenceBoundError('sites', MAX_LOCAL_EVIDENCE_ROWS)
  }
  const siteBilling = await queryAll<{
    site_id: string
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    plan: string | null
    status: string | null
    current_period_end: string | null
    cancel_at_period_end: unknown
  }>(db, `
    SELECT site_id, stripe_customer_id, stripe_subscription_id, plan, status,
           current_period_end, cancel_at_period_end
      FROM site_billing
     WHERE organization_id = ? ORDER BY site_id LIMIT ?
  `, [organizationId, MAX_LOCAL_EVIDENCE_ROWS + 1])
  if (siteBilling.length > MAX_LOCAL_EVIDENCE_ROWS) {
    throw new ReconciliationLocalEvidenceBoundError('site_billing', MAX_LOCAL_EVIDENCE_ROWS)
  }
  const siteEntitlements = await queryAll<{
    site_id: string
    key: string
    value: string | null
    source: string | null
  }>(db, `
    SELECT site_id, key, value, source
      FROM site_entitlements
     WHERE organization_id = ? ORDER BY site_id, key LIMIT ?
  `, [organizationId, MAX_LOCAL_EVIDENCE_ROWS + 1])
  if (siteEntitlements.length > MAX_LOCAL_EVIDENCE_ROWS) {
    throw new ReconciliationLocalEvidenceBoundError('site_entitlements', MAX_LOCAL_EVIDENCE_ROWS)
  }
  return {
    organizationEntitlements: organizationEntitlements.map(row => ({
      key: row.key,
      value: row.value ?? null,
      source: row.source ?? null,
    })),
    invoices: invoices.map(invoice => ({
      stripeInvoiceId: invoice.stripe_invoice_id,
      stripeSubscriptionId: invoice.stripe_subscription_id,
      basePlanPriceId: invoice.base_plan_price_id ?? null,
      status: invoice.status ?? null,
      periodStart: invoice.period_start ?? null,
      periodEnd: invoice.period_end ?? null,
      lastEventId: invoice.last_event_id ?? null,
    })),
    subscriptionVersions: versions.map(version => ({
      stripeSubscriptionId: version.stripe_subscription_id,
      lastEventCreated: nullableNumber(version.last_event_created),
      lastEventId: version.last_event_id ?? null,
    })),
    webhookEvents: webhooks.map(webhook => ({
      stripeEventId: webhook.stripe_event_id,
      eventType: webhook.event_type ?? null,
      status: webhook.status ?? null,
      attemptCount: nullableNumber(webhook.attempt_count),
      deadLetteredAt: webhook.dead_lettered_at ?? null,
    })),
    sites: sites.map(site => ({ id: site.id, plan: site.plan ?? null, status: site.status ?? null })),
    siteBilling: siteBilling.map(row => ({
      siteId: row.site_id,
      stripeCustomerId: row.stripe_customer_id ?? null,
      stripeSubscriptionId: row.stripe_subscription_id ?? null,
      plan: row.plan ?? null,
      status: row.status ?? null,
      currentPeriodEnd: row.current_period_end ?? null,
      cancelAtPeriodEnd: nullableBoolean(row.cancel_at_period_end),
    })),
    siteEntitlements: siteEntitlements.map(row => ({
      siteId: row.site_id,
      key: row.key,
      value: row.value ?? null,
      source: row.source ?? null,
    })),
  }
}

function compareAppProjection(
  drifts: OrganizationReconciliationDrift[],
  projection: OrganizationBillingProjection | null,
  ba: OrganizationReconciliationBetterAuthSubscription | null,
  provider: OrganizationReconciliationProviderSubscription | null,
  projectionMaterialized: boolean,
): void {
  if (!projection) {
    addDrift(drifts, 'app_projection_missing', 'blocked', 'organization_billing', 'Organization billing projection is unavailable.')
    return
  }
  if (!ba || !provider) {
    if (projection.plan !== 'free' || projection.stripeSubscriptionId || projection.stripeCustomerId) {
      addDrift(drifts, 'app_authoritative_subscription_missing', 'blocked', 'organization_billing', 'Paid organization projection has no matched Better Auth and Stripe subscription pair.')
    }
    return
  }
  if (!projectionMaterialized && (ba.plan !== 'free' || provider.canonicalPlan !== 'free')) {
    addDrift(drifts, 'app_projection_missing', 'blocked', 'organization_billing', 'Matched paid subscription has no materialized organization projection.')
    return
  }
  compareValue(drifts, 'app_customer_mismatch', 'organization_billing.stripeCustomerId', projection.stripeCustomerId, ba.stripeCustomerId)
  compareValue(drifts, 'app_subscription_mismatch', 'organization_billing.stripeSubscriptionId', projection.stripeSubscriptionId, ba.stripeSubscriptionId)
  compareValue(drifts, 'app_plan_mismatch', 'organization_billing.plan', projection.plan, ba.plan)
  compareValue(drifts, 'app_status_mismatch', 'organization_billing.status', projection.status, ba.status)
  compareValue(drifts, 'app_period_end_mismatch', 'organization_billing.currentPeriodEnd', projection.currentPeriodEnd, ba.periodEnd)
  compareValue(drifts, 'app_cancel_mismatch', 'organization_billing.cancelAtPeriodEnd', projection.cancelAtPeriodEnd, ba.cancelAtPeriodEnd)
  compareValue(drifts, 'app_provider_plan_mismatch', 'organization_billing.plan', projection.plan, provider.canonicalPlan)
  compareValue(drifts, 'app_provider_status_mismatch', 'organization_billing.status', projection.status, provider.status)
  compareValue(drifts, 'app_provider_period_end_mismatch', 'organization_billing.currentPeriodEnd', projection.currentPeriodEnd, provider.periodEnd)
  compareValue(drifts, 'app_provider_cancel_mismatch', 'organization_billing.cancelAtPeriodEnd', projection.cancelAtPeriodEnd, provider.cancelAtPeriodEnd)
}

function compareSiteProjection(
  drifts: OrganizationReconciliationDrift[],
  local: OrganizationReconciliationLocalEvidence,
  projection: OrganizationBillingProjection | null,
): void {
  if (!projection) return
  for (const site of local.sites) {
    compareValue(drifts, 'site_plan_mismatch', `site:${site.id}.plan`, site.plan, projection.effectivePlan)
  }
  for (const billing of local.siteBilling) {
    compareValue(drifts, 'site_billing_customer_mismatch', `site:${billing.siteId}.stripeCustomerId`, billing.stripeCustomerId, projection.stripeCustomerId)
    if (billing.stripeSubscriptionId !== null) {
      addDrift(drifts, 'site_billing_legacy_subscription_id', 'drift', `site:${billing.siteId}.stripeSubscriptionId`, 'Site billing must not retain an organization subscription id.')
    }
    compareValue(drifts, 'site_billing_plan_mismatch', `site:${billing.siteId}.plan`, billing.plan, projection.effectivePlan)
    compareValue(drifts, 'site_billing_status_mismatch', `site:${billing.siteId}.status`, billing.status, projection.status)
    compareValue(drifts, 'site_billing_period_mismatch', `site:${billing.siteId}.currentPeriodEnd`, billing.currentPeriodEnd, projection.currentPeriodEnd)
    compareValue(drifts, 'site_billing_cancel_mismatch', `site:${billing.siteId}.cancelAtPeriodEnd`, billing.cancelAtPeriodEnd, projection.cancelAtPeriodEnd)
  }
}

function compareExactEntitlements(
  drifts: OrganizationReconciliationDrift[],
  local: OrganizationReconciliationLocalEvidence,
  projection: OrganizationBillingProjection | null,
  projectionMaterialized: boolean,
): void {
  if (!projection || !projectionMaterialized) return
  const expected = getPlanEntitlements(projection.effectivePlan)
  const expectedEntries = Object.entries(expected)
  const organizationRows = local.organizationEntitlements.filter(row => row.source === 'better-auth-stripe')
  const organizationByKey = new Map(organizationRows.map(row => [row.key, row]))
  for (const [key, expectedValue] of expectedEntries) {
    const row = organizationByKey.get(key)
    if (!row) {
      addDrift(drifts, 'organization_entitlement_missing', 'drift', `organization.entitlement:${key}`, 'Expected Better Auth organization entitlement is missing.')
    } else if (String(expectedValue) !== String(row.value)) {
      addDrift(drifts, 'organization_entitlement_mismatch', 'drift', `organization.entitlement:${key}`, 'Better Auth organization entitlement differs from the canonical projection.')
    }
  }
  for (const row of organizationRows) {
    if (!(row.key in expected)) {
      addDrift(drifts, 'organization_entitlement_stale', 'drift', `organization.entitlement:${row.key}`, 'Stale Better Auth organization entitlement is materialized.')
    }
  }

  const siteIds = new Set([
    ...local.sites.map(site => site.id),
    ...local.siteBilling.map(site => site.siteId),
    ...local.siteEntitlements.map(site => site.siteId),
  ])
  for (const siteId of siteIds) {
    const siteRows = local.siteEntitlements.filter(row => row.siteId === siteId && row.source === 'better-auth-stripe')
    const siteByKey = new Map(siteRows.map(row => [row.key, row]))
    for (const [key, expectedValue] of expectedEntries) {
      const row = siteByKey.get(key)
      if (!row) {
        addDrift(drifts, 'site_entitlement_missing', 'drift', `site:${siteId}.entitlement:${key}`, 'Expected Better Auth site entitlement is missing.')
      } else if (String(expectedValue) !== String(row.value)) {
        addDrift(drifts, 'site_entitlement_mismatch', 'drift', `site:${siteId}.entitlement:${key}`, 'Better Auth site entitlement differs from the canonical projection.')
      }
    }
    for (const row of siteRows) {
      if (!(row.key in expected)) {
        addDrift(drifts, 'site_entitlement_stale', 'drift', `site:${siteId}.entitlement:${row.key}`, 'Stale Better Auth site entitlement is materialized.')
      }
    }
  }
}

function comparePaymentEvidence(
  drifts: OrganizationReconciliationDrift[],
  local: OrganizationReconciliationLocalEvidence,
  provider: OrganizationReconciliationProviderSubscription | null,
): void {
  if (!provider) return
  const latestInvoiceId = provider.latestInvoiceId
  if (latestInvoiceId && !local.invoices.some(invoice => invoice.stripeInvoiceId === latestInvoiceId)) {
    addDrift(drifts, 'invoice_evidence_missing', 'drift', latestInvoiceId, 'Latest provider invoice is not present in the local payment evidence.')
  }
  const latestLocalInvoice = latestInvoiceId
    ? local.invoices.find(invoice => invoice.stripeInvoiceId === latestInvoiceId)
    : local.invoices[0]
  if (latestLocalInvoice && latestLocalInvoice.stripeSubscriptionId !== provider.id) {
    addDrift(drifts, 'invoice_subscription_mismatch', 'drift', latestLocalInvoice.stripeInvoiceId, 'Latest local invoice points at a different subscription.')
  }
  if (latestLocalInvoice && provider.latestInvoice) {
    compareValue(drifts, 'invoice_status_mismatch', `invoice:${latestLocalInvoice.stripeInvoiceId}.status`, latestLocalInvoice.status, provider.latestInvoice.status)
    compareValue(drifts, 'invoice_base_price_mismatch', `invoice:${latestLocalInvoice.stripeInvoiceId}.basePlanPriceId`, latestLocalInvoice.basePlanPriceId, provider.canonicalBasePriceId)
    compareValue(
      drifts,
      'invoice_period_start_mismatch',
      `invoice:${latestLocalInvoice.stripeInvoiceId}.periodStart`,
      latestLocalInvoice.periodStart,
      provider.latestInvoice.baseLine?.periodStart ?? null,
    )
    compareValue(
      drifts,
      'invoice_period_end_mismatch',
      `invoice:${latestLocalInvoice.stripeInvoiceId}.periodEnd`,
      latestLocalInvoice.periodEnd,
      provider.latestInvoice.baseLine?.periodEnd ?? null,
    )
  }
  for (const webhook of local.webhookEvents) {
    if (webhook.status !== 'processed' || webhook.deadLetteredAt) {
      addDrift(drifts, 'webhook_evidence_unprocessed', 'blocked', webhook.stripeEventId, 'Referenced webhook evidence is not durably processed.')
    }
  }
}

type ReconciliationSubscriptionPair = {
  betterAuth: OrganizationReconciliationBetterAuthSubscription
  provider: OrganizationReconciliationProviderSubscription
}

function selectAuthoritativeSubscriptionPair(
  betterAuthSubscriptions: OrganizationReconciliationBetterAuthSubscription[],
  providerSubscriptions: OrganizationReconciliationProviderSubscription[],
  currentBetterAuth: OrganizationReconciliationBetterAuthSubscription[],
): ReconciliationSubscriptionPair | null {
  const currentPairs = currentBetterAuth
    .map(betterAuth => {
      const subscriptionId = betterAuth.stripeSubscriptionId
      const provider = subscriptionId ? providerSubscriptions.find(candidate => candidate.id === subscriptionId) : null
      return provider && currentSubscriptionStatus(provider.status) ? { betterAuth, provider } : null
    })
    .filter((pair): pair is ReconciliationSubscriptionPair => Boolean(pair))
  if (currentPairs.length > 0) {
    return currentPairs.sort((a, b) => a.provider.id.localeCompare(b.provider.id))[0] ?? null
  }

  const terminalPairs = betterAuthSubscriptions
    .filter(subscription => Boolean(subscription.stripeSubscriptionId) && !currentSubscriptionStatus(subscription.status))
    .map(betterAuth => {
      const subscriptionId = betterAuth.stripeSubscriptionId
      const provider = subscriptionId
        ? providerSubscriptions.find(candidate => candidate.id === subscriptionId && !currentSubscriptionStatus(candidate.status))
        : null
      return provider ? { betterAuth, provider } : null
    })
    .filter((pair): pair is ReconciliationSubscriptionPair => Boolean(pair))
    .sort((a, b) => {
      const aEnd = Date.parse(a.provider.periodEnd ?? a.betterAuth.periodEnd ?? '')
      const bEnd = Date.parse(b.provider.periodEnd ?? b.betterAuth.periodEnd ?? '')
      if (aEnd !== bEnd) return bEnd - aEnd
      return b.provider.id.localeCompare(a.provider.id)
    })
  return terminalPairs[0] ?? null
}

function reportSnapshot(report: Omit<OrganizationSubscriptionReconciliationReport, 'reportSha256' | 'capturedAt' | 'operator'>): unknown {
  return {
    schemaVersion: report.schemaVersion,
    kind: report.kind,
    request: report.request,
    provider: report.provider,
    betterAuth: report.betterAuth,
    appProjection: report.appProjection,
    effectiveEntitlements: report.effectiveEntitlements,
    localEvidence: report.localEvidence,
    drifts: report.drifts,
    status: report.status,
  }
}

export interface ReconcileOrganizationSubscriptionOptions {
  db: DbClient
  stripe: Stripe
  adapter: BetterAuthSubscriptionReadAdapter
  organization: OrganizationReconciliationOrganization
  request: OrganizationSubscriptionReconciliationRequest
  actor: string
  providerModeVerified?: boolean
  now?: Date
  loadPlans?: StripePlanLoader
}

/**
 * Produce evidence only. This function intentionally has no write-capable DB
 * import and no Stripe mutation path; a future apply command must be separate.
 */
export async function reconcileOrganizationSubscription(
  options: ReconcileOrganizationSubscriptionOptions,
): Promise<OrganizationSubscriptionReconciliationReport> {
  const now = options.now ?? new Date()
  const request = options.request
  const drifts: OrganizationReconciliationDrift[] = []
  const localEvidence = emptyLocalEvidence()
  const providerModeVerified = options.providerModeVerified ?? false
  if (!providerModeVerified) {
    addDrift(drifts, 'provider_mode_unverified', 'blocked', 'stripe.key', 'Stripe provider mode was not verified before the provider read.')
  }
  const organizationIdentityMatches = options.organization.id === request.organizationId
  if (!organizationIdentityMatches) {
    addDrift(drifts, 'organization_identity_mismatch', 'blocked', 'organization', 'Resolved organization identity does not match the requested organization.')
  }
  let appProjectionRow: OrganizationBillingProjectionRow | null = null
  try {
    appProjectionRow = await queryFirst<OrganizationBillingProjectionRow>(options.db, `
      SELECT organization_id, stripe_customer_id, stripe_subscription_id, plan, status,
             payment_status, paid_through, past_due_since, current_period_end,
             cancel_at_period_end, updated_at
        FROM organization_billing
       WHERE organization_id = ? LIMIT 1
    `, [request.organizationId])
  } catch {
    addDrift(drifts, 'local_state_unavailable', 'blocked', request.organizationId, 'Application billing projection could not be read.')
  }
  const normalizedRow = normalizeProjectionRow(appProjectionRow)
  let projection: OrganizationBillingProjection | null = null
  let projectionError: string | null = null
  try {
    projection = validateOrganizationBillingProjection(normalizedRow, request.organizationId, now)
  } catch {
    projectionError = 'invalid_organization_billing_projection'
    addDrift(drifts, 'app_projection_malformed', 'blocked', 'organization_billing', 'Organization billing projection failed validation.')
  }

  let betterAuthRows: Record<string, unknown>[] = []
  try {
    betterAuthRows = await options.adapter.findMany<Record<string, unknown>>({
      model: 'subscription',
      where: [{ field: 'referenceId', value: request.organizationId }],
      limit: 100,
      sortBy: { field: 'id', direction: 'asc' },
    })
  } catch {
    addDrift(drifts, 'better_auth_state_unavailable', 'blocked', request.organizationId, 'Better Auth subscription records could not be read.')
  }
  if (betterAuthRows.length >= 100) {
    addDrift(drifts, 'better_auth_history_unbounded', 'blocked', request.organizationId, 'Better Auth subscription history reached the bounded adapter limit.')
  }
  const betterAuthSubscriptions = sortById(betterAuthRows.map(normalizeBetterAuthSubscription))
  for (const subscription of betterAuthSubscriptions) {
    if (
      subscription.ownerMetadataConflict
      || !subscription.id
      || !subscription.referenceId
      || subscription.referenceId !== request.organizationId
      || !subscription.plan
      || !subscription.status
      || !subscription.stripeCustomerId
      || !subscription.stripeSubscriptionId
      || !hasOrderedPeriod(subscription.periodStart, subscription.periodEnd)
      || !subscription.billingInterval
      || !isPositiveSafeInteger(subscription.seats)
      || subscription.cancelAtPeriodEnd === null
    ) {
      addDrift(drifts, 'better_auth_subscription_malformed', 'blocked', subscription.id ?? 'unknown', 'Better Auth subscription has incomplete ownership or plan state.')
    }
  }
  const betterAuthOrganizationCustomerId = nullableString(options.organization.stripeCustomerId)
  const appCustomerId = normalizedRow?.stripe_customer_id ?? null
  const betterAuthSubscriptionCustomerIds = betterAuthSubscriptions
    .map(subscription => subscription.stripeCustomerId)
    .filter((value): value is string => Boolean(value))
  const candidateCustomerIds = [...new Set([
    betterAuthOrganizationCustomerId,
    ...betterAuthSubscriptionCustomerIds,
    appCustomerId,
  ].filter((value): value is string => Boolean(value)))].sort()
  let account: Stripe.Account | null = null
  let accountRequestError = false
  if (providerModeVerified && organizationIdentityMatches) {
    try {
      account = await options.stripe.accounts.retrieve(null) as unknown as Stripe.Account
    } catch {
      accountRequestError = true
      addDrift(drifts, 'provider_account_unavailable', 'blocked', 'stripe.account', 'Stripe account binding could not be read.')
    }
  }
  if (!accountRequestError && account && !accountMatches(account, request)) {
    addDrift(drifts, 'provider_account_mismatch', 'blocked', 'stripe.account', 'Stripe account id does not match the request.')
  }

  let customerId: string | null = null
  let discoveredByMetadataSearch = false
  let customer: Stripe.Customer | Stripe.DeletedCustomer | null = null
  let providerSubscriptions: OrganizationReconciliationProviderSubscription[] = []
  if (candidateCustomerIds.length > 1) {
    addDrift(drifts, 'customer_id_conflict', 'blocked', 'stripe.customer', 'Better Auth and app-owned customer identities disagree.')
  }
  const accountVerified = Boolean(account && accountMatches(account, request))
  let metadataSearchResolved = false
  let metadataSearchEvidenceValid = true
  let metadataSearchSubscriptionIds = new Set<string>()
  if (!accountRequestError && accountVerified && providerModeVerified && organizationIdentityMatches) {
    try {
      const [customerSearch, subscriptionSearch] = await Promise.all([
        searchOrganizationCustomers(options.stripe, request.organizationId),
        searchOrganizationSubscriptions(options.stripe, request.organizationId),
      ])
      if (customerSearch.hasMore || customerSearch.ids.length > 1) {
        addDrift(drifts, 'provider_customer_ambiguous', 'blocked', 'stripe.customer', 'Metadata search returned multiple possible organization customers.')
      }
      if (subscriptionSearch.hasMore) {
        addDrift(drifts, 'provider_subscription_search_unbounded', 'blocked', 'stripe.subscription', 'Provider subscription metadata search exceeded the bounded reconciliation window.')
      }
      metadataSearchSubscriptionIds = new Set<string>()
      for (const searchedSubscription of subscriptionSearch.subscriptions) {
        const searchedSubscriptionId = nullableString(searchedSubscription.id)
        const searchedCustomerId = providerCustomerId(searchedSubscription.customer)
        const searchedOwner = resolveOwnerMetadata(searchedSubscription.metadata)
        if (!searchedSubscriptionId || !searchedCustomerId) {
          metadataSearchEvidenceValid = false
          addDrift(drifts, 'provider_subscription_search_malformed', 'blocked', searchedSubscriptionId ?? 'unknown', 'Provider subscription metadata search returned a subscription without a valid id or customer identity.')
        } else {
          metadataSearchSubscriptionIds.add(searchedSubscriptionId)
        }
        if (searchedOwner.conflict) {
          metadataSearchEvidenceValid = false
          addDrift(drifts, 'provider_subscription_search_owner_metadata_conflict', 'blocked', searchedSubscriptionId ?? 'unknown', 'Provider subscription metadata search returned conflicting owner keys.')
        } else if (searchedOwner.ownerId !== request.organizationId) {
          metadataSearchEvidenceValid = false
          addDrift(drifts, 'provider_subscription_search_owner_mismatch', 'blocked', searchedSubscriptionId ?? 'unknown', 'Provider subscription metadata search returned a subscription owned by another organization.')
        }
      }
      const searchedCustomerIds = [...new Set([
        ...customerSearch.ids,
        ...subscriptionSearch.customerIds,
      ])].sort()
      const searchIdentityIsBounded = !customerSearch.hasMore
        && !subscriptionSearch.hasMore
        && customerSearch.ids.length <= 1
        && metadataSearchEvidenceValid
      if (searchedCustomerIds.length > 1) {
        addDrift(drifts, 'provider_customer_ambiguous', 'blocked', 'stripe.customer', 'Provider metadata searches point at multiple customer identities.')
      } else if (!searchIdentityIsBounded) {
        // A page boundary means the complete identity set is unknown; do not
        // adopt or retrieve the one visible id as if it were authoritative.
        metadataSearchResolved = false
      } else if (searchedCustomerIds.length === 1) {
        const searchedCustomerId = searchedCustomerIds[0] as string
        if (candidateCustomerIds.length > 0 && (candidateCustomerIds.length !== 1 || candidateCustomerIds[0] !== searchedCustomerId)) {
          addDrift(drifts, 'provider_customer_local_search_disagreement', 'blocked', 'stripe.customer', 'Provider metadata search disagrees with a local customer identity.')
        } else if (customerSearch.ids.length === 0 && subscriptionSearch.customerIds.length === 0) {
          addDrift(drifts, 'provider_customer_search_missing', 'blocked', 'stripe.customer', 'Provider metadata search did not return a customer identity.')
        } else {
          customerId = searchedCustomerId
          metadataSearchResolved = true
        }
        if (candidateCustomerIds.length === 0 && metadataSearchResolved) {
          discoveredByMetadataSearch = true
          addDrift(drifts, 'provider_customer_discoverable_without_local_identity', 'drift', 'stripe.customer', 'A provider customer exists but no local identity points at it.')
        }
      } else if (candidateCustomerIds.length > 0) {
        addDrift(drifts, 'provider_customer_local_search_disagreement', 'blocked', 'stripe.customer', 'Provider metadata search found no customer matching a local identity.')
      }
    } catch (error) {
      addDrift(
        drifts,
        error instanceof ReconciliationProviderReadBoundError ? error.code : 'provider_customer_search_failed',
        'blocked',
        'stripe.customer',
        error instanceof Error ? error.message : 'Provider customer or subscription metadata search failed.',
      )
    }
  }
  if (customerId && metadataSearchResolved && accountVerified && !drifts.some(drift => drift.code === 'customer_id_conflict')) {
    try {
      customer = await options.stripe.customers.retrieve(customerId) as unknown as Stripe.Customer | Stripe.DeletedCustomer
      if (isDeletedCustomer(customer)) {
        addDrift(drifts, 'provider_customer_deleted', 'blocked', customerId, 'The organization customer is deleted.')
      } else {
        const ownerMetadata = resolveCustomerOwnerMetadata(customer.metadata)
        const customerType = metadataValue(customer.metadata, 'customerType')
        if (ownerMetadata.conflict || ownerMetadata.ownerId !== request.organizationId || customerType !== 'organization') {
          addDrift(drifts, 'provider_customer_metadata_conflict', 'blocked', customerId, 'Provider customer metadata does not identify this organization.')
        }
        const subscriptions: Stripe.Subscription[] = []
        let startingAfter: string | undefined
        for (let pageNumber = 0; pageNumber < MAX_PROVIDER_SUBSCRIPTION_PAGES; pageNumber += 1) {
          const page = await options.stripe.subscriptions.list({
            customer: customerId,
            status: 'all',
            limit: 100,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          })
          if (!Array.isArray(page.data) || page.data.length > 100 || typeof page.has_more !== 'boolean' || page.data.some(subscription => typeof subscription?.id !== 'string' || !subscription.id.trim())) {
            throw new ReconciliationProviderReadBoundError('provider_search_malformed', 'Stripe subscription history returned malformed pagination evidence.')
          }
          subscriptions.push(...page.data)
          if (!page.has_more) break
          startingAfter = page.data.at(-1)?.id
          if (!startingAfter || pageNumber === MAX_PROVIDER_SUBSCRIPTION_PAGES - 1) {
            addDrift(drifts, 'provider_subscription_list_unbounded', 'blocked', customerId, 'Provider subscription history exceeded the bounded reconciliation window.')
            break
          }
        }
        const loadPlans = options.loadPlans ?? createBoundedReconciliationPlanLoader(options.stripe)
        let planSnapshot: StripePlan[] | null = null
        let planSnapshotError: unknown = null
        if (subscriptions.length > 0) {
          try {
            planSnapshot = await loadPlans({ includeFeatureDisabled: true })
          } catch (error) {
            planSnapshotError = error
            addDrift(
              drifts,
              error instanceof ReconciliationProviderReadBoundError ? error.code : 'provider_plan_unresolved',
              'blocked',
              customerId,
              error instanceof Error ? error.message : 'Stripe plan catalog could not be loaded.',
            )
          }
        }
        const snapshotLoader: StripePlanLoader = async () => {
          if (planSnapshotError) throw planSnapshotError
          return planSnapshot ?? []
        }
        const boundedHistoricalProvider = createBoundedHistoricalProvider(options.stripe)
        for (const providerSubscription of subscriptions) {
          try {
            const resolved = await resolveCanonicalSubscriptionPlan(boundedHistoricalProvider, providerSubscription, snapshotLoader)
            const normalized = normalizeProviderSubscription(providerSubscription, resolved)
            providerSubscriptions.push(normalized)
            if (normalized.metadata.ownerMetadataConflict) {
              addDrift(drifts, 'provider_subscription_owner_metadata_conflict', 'blocked', providerSubscription.id, 'Provider subscription owner metadata keys conflict.')
            } else if (normalized.metadata.ownerId !== request.organizationId) {
              addDrift(drifts, 'provider_subscription_owner_mismatch', 'blocked', providerSubscription.id, 'Provider subscription owner metadata does not identify this organization.')
            }
            if (
              !normalized.id
              || !normalized.status
              || !KNOWN_PROVIDER_SUBSCRIPTION_STATUSES.has(normalized.status)
              || !normalized.customerId
              || normalized.quantity !== 1
              || normalized.cancelAtPeriodEnd === null
              || !hasOrderedPeriod(normalized.periodStart, normalized.periodEnd)
              || !normalized.billingInterval
              || !normalized.canonicalPlan
              || !normalized.canonicalBasePriceId
              || !normalized.canonicalBaseItemId
            ) {
              addDrift(drifts, 'provider_subscription_malformed', 'blocked', providerSubscription.id, 'Provider subscription has incomplete billing period or plan state.')
            }
          } catch (error) {
            providerSubscriptions.push(normalizeProviderSubscription(providerSubscription, null, 'canonical_plan_unresolved'))
            addDrift(
              drifts,
              error instanceof ReconciliationProviderReadBoundError ? error.code : 'provider_plan_unresolved',
              'blocked',
              providerSubscription.id,
              error instanceof Error ? error.message : 'Provider subscription has no unambiguous canonical recurring plan.',
            )
          }
        }
        providerSubscriptions = providerSubscriptions.sort((a, b) => a.id.localeCompare(b.id))
        const activeProviderSubscriptions = providerSubscriptions.filter(subscription => subscription.status === 'active')
        if (activeProviderSubscriptions.length > MAX_PROVIDER_CURRENT_INVOICE_READS) {
          addDrift(
            drifts,
            'provider_invoice_reads_unbounded',
            'blocked',
            customerId,
            'Active provider subscriptions exceeded the bounded invoice-evidence window.',
          )
        }
        for (const providerSubscription of activeProviderSubscriptions.slice(0, MAX_PROVIDER_CURRENT_INVOICE_READS)) {
          if (!providerSubscription.latestInvoiceId) {
            compareProviderInvoiceCoverage(drifts, providerSubscription)
            continue
          }
          try {
            providerSubscription.latestInvoice = await readBoundedProviderInvoice(
              options.stripe,
              providerSubscription.latestInvoiceId,
              providerSubscription.id,
              providerSubscription.canonicalBasePriceId,
              providerSubscription.canonicalBaseItemId,
              providerSubscription.quantity,
            )
            compareProviderInvoiceCoverage(drifts, providerSubscription)
          } catch (error) {
            addDrift(
              drifts,
              error instanceof ReconciliationProviderReadBoundError ? error.code : 'provider_invoice_read_failed',
              providerSubscription.status === 'active' ? 'blocked' : 'drift',
              providerSubscription.latestInvoiceId,
              error instanceof Error ? error.message : 'Latest provider invoice could not be read.',
            )
            providerSubscription.latestInvoice = null
          }
        }
        const listedProviderSubscriptionIds = new Set(providerSubscriptions.map(subscription => subscription.id))
        for (const searchedSubscriptionId of metadataSearchSubscriptionIds) {
          if (!listedProviderSubscriptionIds.has(searchedSubscriptionId)) {
            addDrift(drifts, 'provider_subscription_search_not_listed', 'blocked', searchedSubscriptionId, 'Provider subscription metadata search result was absent from the customer subscription history.')
          }
        }
      }
    } catch (error) {
      addDrift(
        drifts,
        error instanceof ReconciliationProviderReadBoundError ? error.code : 'provider_customer_read_failed',
        'blocked',
        customerId,
        error instanceof Error ? error.message : 'Provider customer or subscription reads failed.',
      )
    }
  }

  let subscriptionsForLocalEvidence = [
    ...betterAuthSubscriptions.map(subscription => subscription.stripeSubscriptionId),
    ...providerSubscriptions.map(subscription => subscription.id),
  ].filter((value): value is string => Boolean(value))
  subscriptionsForLocalEvidence = [...new Set(subscriptionsForLocalEvidence)].sort()
  let readEvidence: OrganizationReconciliationLocalEvidence
  try {
    readEvidence = await readLocalEvidence(options.db, request.organizationId, subscriptionsForLocalEvidence)
  } catch (error) {
    readEvidence = localEvidence
    if (error instanceof ReconciliationLocalEvidenceBoundError) {
      addDrift(drifts, 'local_evidence_unbounded', 'blocked', error.subject, error.message)
    } else {
      addDrift(drifts, 'local_state_unavailable', 'blocked', request.organizationId, 'Application billing evidence could not be read.')
    }
  }

  const currentBetterAuth = betterAuthSubscriptions.filter(subscription => currentSubscriptionStatus(subscription.status))
  const currentProvider = providerSubscriptions.filter(subscription => currentSubscriptionStatus(subscription.status))
  if (currentBetterAuth.length > 1) addDrift(drifts, 'better_auth_multiple_current_subscriptions', 'blocked', request.organizationId, 'Better Auth has more than one current subscription.')
  if (currentProvider.length > 1) addDrift(drifts, 'provider_multiple_current_subscriptions', 'blocked', request.organizationId, 'Stripe has more than one current subscription.')
  const pairedBetterAuth = currentBetterAuth.length === 1 ? (currentBetterAuth[0] ?? null) : null
  const pairedProvider = currentProvider.length === 1 ? (currentProvider[0] ?? null) : null
  if (pairedBetterAuth && pairedProvider) compareSubscriptionPair(drifts, pairedBetterAuth, pairedProvider)
  else if (pairedBetterAuth && !pairedProvider) addDrift(drifts, 'provider_subscription_missing', 'blocked', request.organizationId, 'Better Auth has a current subscription but Stripe does not.')
  else if (!pairedBetterAuth && pairedProvider) addDrift(drifts, 'better_auth_subscription_missing', 'blocked', request.organizationId, 'Stripe has a current subscription but Better Auth does not.')

  // Canceled and expired rows remain fulfillment evidence. Compare matching
  // historical identities, and expose an orphan on either side, without
  // treating a clean all-terminal history as a missing current subscription.
  const comparedSubscriptionIds = new Set<string>()
  if (pairedBetterAuth?.stripeSubscriptionId && pairedProvider?.id && pairedBetterAuth.stripeSubscriptionId === pairedProvider.id) {
    comparedSubscriptionIds.add(pairedBetterAuth.stripeSubscriptionId)
  }
  const providerById = new Map(providerSubscriptions.map(subscription => [subscription.id, subscription]))
  const betterAuthById = new Map(
    betterAuthSubscriptions
      .filter(subscription => Boolean(subscription.stripeSubscriptionId))
      .map(subscription => [subscription.stripeSubscriptionId as string, subscription]),
  )
  for (const historical of betterAuthSubscriptions) {
    const subscriptionId = historical.stripeSubscriptionId
    if (!subscriptionId || comparedSubscriptionIds.has(subscriptionId)) continue
    const providerHistorical = providerById.get(subscriptionId)
    if (providerHistorical) {
      compareSubscriptionPair(drifts, historical, providerHistorical)
      comparedSubscriptionIds.add(subscriptionId)
    } else {
      addDrift(drifts, 'provider_historical_subscription_missing', 'blocked', subscriptionId, 'Better Auth historical subscription has no matching Stripe subscription.')
    }
  }
  for (const historical of providerSubscriptions) {
    if (comparedSubscriptionIds.has(historical.id)) continue
    if (!betterAuthById.has(historical.id)) {
      addDrift(drifts, 'better_auth_historical_subscription_missing', 'blocked', historical.id, 'Stripe historical subscription has no matching Better Auth record.')
    }
  }

  const authoritativePair = selectAuthoritativeSubscriptionPair(
    betterAuthSubscriptions,
    providerSubscriptions,
    currentBetterAuth,
  )
  compareAppProjection(
    drifts,
    projection,
    authoritativePair?.betterAuth ?? null,
    authoritativePair?.provider ?? null,
    normalizedRow !== null,
  )
  compareSiteProjection(drifts, readEvidence, projection)
  compareExactEntitlements(drifts, readEvidence, projection, normalizedRow !== null)
  comparePaymentEvidence(drifts, readEvidence, authoritativePair?.provider ?? null)
  const effectiveEntitlements = projection?.entitlements ?? getPlanEntitlements('free')
  const sortedDrifts = sortDrifts(drifts)
  const providerCustomerMetadata = customer && !isDeletedCustomer(customer)
    ? {
        ...(() => {
          const ownerMetadata = resolveCustomerOwnerMetadata(customer.metadata)
          return {
            organizationId: ownerMetadata.organizationId,
            organization_id: ownerMetadata.organization_id,
            ownerId: ownerMetadata.ownerId,
            ownerMetadataConflict: ownerMetadata.conflict,
          }
        })(),
        customerType: metadataValue(customer.metadata, 'customerType'),
      }
    : null
  const reportWithoutHash: Omit<OrganizationSubscriptionReconciliationReport, 'reportSha256' | 'capturedAt' | 'operator'> = {
    schemaVersion: 1,
    kind: 'organization-subscription-reconciliation',
    request,
    provider: {
      mode: request.providerMode,
      expectedAccountId: request.expectedStripeAccountId,
      modeVerified: providerModeVerified,
      account: {
        id: account?.id ?? null,
        verified: Boolean(account && accountMatches(account, request)),
      },
      customer: {
        id: customerId,
        discoveredByMetadataSearch,
        deleted: Boolean(customer && isDeletedCustomer(customer)),
        metadata: providerCustomerMetadata,
      },
      subscriptions: providerSubscriptions,
    },
    betterAuth: {
      organization: {
        id: options.organization.id,
        stripeCustomerId: betterAuthOrganizationCustomerId,
      },
      subscriptions: betterAuthSubscriptions,
    },
    appProjection: {
      row: normalizedRow,
      projection,
      projectionError,
    },
    effectiveEntitlements,
    localEvidence: readEvidence,
    drifts: sortedDrifts,
    status: statusFromDrifts(sortedDrifts),
  }
  const reportSha256 = await sha256CanonicalJson(reportSnapshot(reportWithoutHash))
  return {
    ...reportWithoutHash,
    capturedAt: now.toISOString(),
    operator: { actor: options.actor, direct: true },
    reportSha256,
  }
}
