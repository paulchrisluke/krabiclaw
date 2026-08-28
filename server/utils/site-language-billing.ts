import type Stripe from 'stripe'
import { HTTPError } from 'nitro'
import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'
import { getEffectiveAccessPlan } from '~/server/utils/billing-access'
import { createStripeClient } from '~/server/utils/stripe-client'
import { canonicalizeLocale, englishManifestHash } from '~/server/utils/localization'
import { localizationError } from '~/server/utils/localization-errors'

export const SITE_LANGUAGE_MONTHLY_AMOUNT_CENTS = 500
export const SITE_LANGUAGE_ANNUAL_AMOUNT_CENTS = 6000
export const SITE_LANGUAGE_PRODUCT_FAMILY = 'site_language'

type BillingInterval = 'month' | 'year'
type LicenseStatus = 'enabling' | 'active' | 'disabling' | 'disabled'

interface LanguageLicenseRow {
  id: string
  status: LicenseStatus
  operation_id: string | null
  provider_idempotency_key: string | null
  stripe_subscription_id: string | null
  stripe_subscription_item_id: string | null
  last_provider_quantity: number | null
}

interface BillingProjectionRow {
  plan: string | null
  status: string | null
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
  current_period_end: string | null
  stripe_subscription_id: string | null
}

export interface SiteLanguageBillingEnv {
  STRIPE_SECRET_KEY?: string
}

function stripeProduct(value: Stripe.Price['product']): Stripe.Product | null {
  return value && typeof value !== 'string' && !('deleted' in value) ? value : null
}

function productFamily(product: Stripe.Product | null): string | null {
  return product?.metadata?.product_family?.trim().toLowerCase() ?? null
}

function planId(product: Stripe.Product | null): string | null {
  return product?.metadata?.plan_id?.trim().toLowerCase() ?? null
}

function expectedAmount(interval: BillingInterval): number {
  return interval === 'month' ? SITE_LANGUAGE_MONTHLY_AMOUNT_CENTS : SITE_LANGUAGE_ANNUAL_AMOUNT_CENTS
}

export function selectSiteLanguagePrice(
  products: Stripe.Product[],
  prices: Stripe.Price[],
  interval: BillingInterval,
): Stripe.Price {
  const productMatches = products.filter(product => product.active !== false && productFamily(product) === SITE_LANGUAGE_PRODUCT_FAMILY)
  if (productMatches.length !== 1) throw new Error(`Stripe must have exactly one active ${SITE_LANGUAGE_PRODUCT_FAMILY} product`)
  const product = productMatches[0]!
  const matches = prices.filter(price => {
    const productId = typeof price.product === 'string' ? price.product : price.product.id
    return price.active !== false
      && productId === product.id
      && price.recurring?.interval === interval
      && price.recurring.interval_count === 1
      && price.currency.toLowerCase() === 'usd'
      && price.unit_amount === expectedAmount(interval)
  })
  if (matches.length !== 1) {
    throw new Error(`Stripe ${SITE_LANGUAGE_PRODUCT_FAMILY} catalog must have exactly one USD ${interval} price at ${expectedAmount(interval)} cents`)
  }
  return matches[0]!
}

async function listActiveCatalog(stripe: Stripe): Promise<{ products: Stripe.Product[]; prices: Stripe.Price[] }> {
  const [products, prices] = await Promise.all([
    stripe.products.list({ active: true, limit: 100 }).autoPagingToArray({ limit: 10_000 }),
    stripe.prices.list({ active: true, type: 'recurring', limit: 100, expand: ['data.product'] }).autoPagingToArray({ limit: 10_000 }),
  ])
  return { products, prices }
}

function resolveSubscriptionInterval(subscription: Stripe.Subscription): BillingInterval {
  const baseItems = subscription.items.data.filter(item => planId(stripeProduct(item.price.product)) === 'growth')
  if (baseItems.length !== 1) throw new Error(`Stripe subscription ${subscription.id} must have exactly one Growth base item`)
  const interval = baseItems[0]!.price.recurring?.interval
  if (interval !== 'month' && interval !== 'year') throw new Error(`Stripe subscription ${subscription.id} has an unsupported Growth interval`)
  return interval
}

function languageItem(subscription: Stripe.Subscription): Stripe.SubscriptionItem | null {
  const matches = subscription.items.data.filter(item => productFamily(stripeProduct(item.price.product)) === SITE_LANGUAGE_PRODUCT_FAMILY)
  if (matches.length > 1) throw new Error(`Stripe subscription ${subscription.id} has multiple language add-on items`)
  return matches[0] ?? null
}

async function requireGrowthBilling(db: DbClient, organizationId: string): Promise<string> {
  const billing = await queryFirst<BillingProjectionRow>(db, `
    SELECT plan, status, payment_status, paid_through, past_due_since, current_period_end, stripe_subscription_id
      FROM organization_billing
     WHERE organization_id = ?
     LIMIT 1
  `, [organizationId])
  const effectivePlan = billing ? getEffectiveAccessPlan({
    plan: billing.plan,
    status: billing.status,
    paymentStatus: billing.payment_status,
    paidThrough: billing.paid_through,
    pastDueSince: billing.past_due_since,
    periodEnd: billing.current_period_end,
  }) : 'free'
  if (effectivePlan !== 'growth' || !billing?.stripe_subscription_id) {
    localizationError(402, 'LANGUAGE_LICENSE_REQUIRED', 'An active Growth subscription is required to enable a language')
  }
  return billing.stripe_subscription_id
}

async function requireAvailableCatalog(db: DbClient, locale: string): Promise<void> {
  const catalog = await queryFirst<{ status: string; source_manifest_hash: string | null }>(db, `SELECT status, source_manifest_hash FROM platform_locale_catalogs WHERE locale = ? LIMIT 1`, [locale])
  if (!catalog || catalog.status !== 'available' || catalog.source_manifest_hash !== await englishManifestHash()) {
    localizationError(403, 'PLATFORM_LOCALE_UNAVAILABLE', 'The platform locale catalog is unavailable', { locale })
  }
}

async function loadLicense(db: DbClient, organizationId: string, siteId: string, locale: string): Promise<LanguageLicenseRow | null> {
  return await queryFirst<LanguageLicenseRow>(db, `
    SELECT id, status, operation_id, provider_idempotency_key, stripe_subscription_id,
           stripe_subscription_item_id, last_provider_quantity
      FROM site_language_licenses
     WHERE organization_id = ? AND site_id = ? AND locale = ?
     LIMIT 1
  `, [organizationId, siteId, locale]) ?? null
}

async function activeLicenseQuantity(db: DbClient, organizationId: string, excludeId?: string): Promise<number> {
  const row = await queryFirst<{ count: number }>(db, `
    SELECT COUNT(*) AS count
      FROM site_language_licenses
     WHERE organization_id = ? AND status = 'active' ${excludeId ? 'AND id != ?' : ''}
  `, excludeId ? [organizationId, excludeId] : [organizationId])
  return Number(row?.count ?? 0)
}

function providerErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code.slice(0, 120)
  }
  return 'stripe_provider_error'
}

export async function enableSiteLanguageLicense(
  db: DbClient,
  env: SiteLanguageBillingEnv,
  input: { organizationId: string; siteId: string; locale: unknown; label: string },
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === 'en') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English is the immutable source language')
  await requireAvailableCatalog(db, locale)
  const subscriptionId = await requireGrowthBilling(db, input.organizationId)
  let license = await loadLicense(db, input.organizationId, input.siteId, locale)
  if (license?.status === 'active') return license
  if (license?.status === 'disabling') localizationError(409, 'LANGUAGE_LICENSE_SYNCING', 'Language disable is still synchronizing', { locale })

  const id = license?.id ?? crypto.randomUUID()
  const operationId = license?.status === 'enabling' && license.operation_id ? license.operation_id : crypto.randomUUID()
  const idempotencyKey = license?.status === 'enabling' && license.provider_idempotency_key
    ? license.provider_idempotency_key
    : `site-language:enable:${id}:${operationId}`
  const now = Math.floor(Date.now() / 1000)
  await executeBatch(db, [
    {
      query: `INSERT INTO site_locales (id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 'disabled', ?, ?)
        ON CONFLICT(organization_id, site_id, locale) DO UPDATE SET label = excluded.label, status = 'disabled', updated_at = excluded.updated_at`,
      params: [`locale::${input.organizationId}::${input.siteId}::${locale}`, input.organizationId, input.siteId, locale, input.label.trim() || locale, new Date().toISOString(), new Date().toISOString()],
    },
    {
      query: `INSERT INTO site_language_licenses
        (id, organization_id, site_id, locale, stripe_subscription_id, status, operation_id, provider_idempotency_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'enabling', ?, ?, ?, ?)
        ON CONFLICT(organization_id, site_id, locale) DO UPDATE SET stripe_subscription_id = excluded.stripe_subscription_id,
          status = 'enabling', operation_id = excluded.operation_id, provider_idempotency_key = excluded.provider_idempotency_key,
          last_error_code = NULL, updated_at = excluded.updated_at`,
      params: [id, input.organizationId, input.siteId, locale, subscriptionId, operationId, idempotencyKey, now, now],
    },
  ], { operation: 'begin language license enable' })

  if (!env.STRIPE_SECRET_KEY) throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe not configured' })
  const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price.product'] })
    const interval = resolveSubscriptionInterval(subscription)
    const catalog = await listActiveCatalog(stripe)
    const price = selectSiteLanguagePrice(catalog.products, catalog.prices, interval)
    const quantity = await activeLicenseQuantity(db, input.organizationId, id) + 1
    const existingItem = languageItem(subscription)
    const item = existingItem
      ? await stripe.subscriptionItems.update(existingItem.id, { price: price.id, quantity, proration_behavior: 'none' }, { idempotencyKey })
      : await stripe.subscriptionItems.create({ subscription: subscriptionId, price: price.id, quantity, proration_behavior: 'none' }, { idempotencyKey })
    await executeBatch(db, [
      {
        query: `UPDATE site_language_licenses
                   SET status = 'active', stripe_subscription_id = ?, stripe_subscription_item_id = ?,
                       last_provider_quantity = ?, last_error_code = NULL, activated_at = ?, disabled_at = NULL, updated_at = ?
                 WHERE id = ? AND operation_id = ? AND status = 'enabling'`,
        params: [subscriptionId, item.id, quantity, now, now, id, operationId],
      },
      {
        query: `UPDATE site_locales SET status = 'published', updated_at = ? WHERE organization_id = ? AND site_id = ? AND locale = ? AND is_source = 0`,
        params: [new Date().toISOString(), input.organizationId, input.siteId, locale],
      },
    ], { operation: 'activate language license' })
  } catch (error) {
    await execute(db, `UPDATE site_language_licenses SET last_error_code = ?, updated_at = ? WHERE id = ? AND operation_id = ?`, [providerErrorCode(error), Math.floor(Date.now() / 1000), id, operationId])
    throw error
  }
  license = await loadLicense(db, input.organizationId, input.siteId, locale)
  if (!license || license.status !== 'active') throw new Error('Language license activation compare-and-set failed')
  return license
}

export async function disableSiteLanguageLicense(
  db: DbClient,
  env: SiteLanguageBillingEnv,
  input: { organizationId: string; siteId: string; locale: unknown },
) {
  const locale = canonicalizeLocale(input.locale)
  if (locale === 'en') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English cannot be disabled')
  const license = await loadLicense(db, input.organizationId, input.siteId, locale)
  if (!license || license.status === 'disabled') return license
  if (license.status === 'enabling') localizationError(409, 'LANGUAGE_LICENSE_SYNCING', 'Language enable is still synchronizing', { locale })
  const subscriptionId = license.stripe_subscription_id ?? await requireGrowthBilling(db, input.organizationId)
  const operationId = license.status === 'disabling' && license.operation_id ? license.operation_id : crypto.randomUUID()
  const idempotencyKey = license.status === 'disabling' && license.provider_idempotency_key
    ? license.provider_idempotency_key
    : `site-language:disable:${license.id}:${operationId}`
  const now = Math.floor(Date.now() / 1000)
  await execute(db, `UPDATE site_language_licenses SET status = 'disabling', operation_id = ?, provider_idempotency_key = ?, last_error_code = NULL, updated_at = ? WHERE id = ? AND status IN ('active', 'disabling')`, [operationId, idempotencyKey, now, license.id])
  if (!env.STRIPE_SECRET_KEY) throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe not configured' })
  const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price.product'] })
    const item = languageItem(subscription)
    const quantity = await activeLicenseQuantity(db, input.organizationId, license.id)
    if (item) {
      if (quantity > 0) await stripe.subscriptionItems.update(item.id, { quantity, proration_behavior: 'none' }, { idempotencyKey })
      else await stripe.subscriptionItems.del(item.id, { proration_behavior: 'none' }, { idempotencyKey })
    }
    await executeBatch(db, [
      {
        query: `UPDATE site_language_licenses
                   SET status = 'disabled', stripe_subscription_item_id = ?, last_provider_quantity = ?,
                       last_error_code = NULL, disabled_at = ?, updated_at = ?
                 WHERE id = ? AND operation_id = ? AND status = 'disabling'`,
        params: [quantity > 0 ? item?.id ?? null : null, quantity, now, now, license.id, operationId],
      },
      {
        query: `UPDATE site_locales SET status = 'disabled', updated_at = ? WHERE organization_id = ? AND site_id = ? AND locale = ? AND is_source = 0`,
        params: [new Date().toISOString(), input.organizationId, input.siteId, locale],
      },
    ], { operation: 'disable language license' })
  } catch (error) {
    await execute(db, `UPDATE site_language_licenses SET last_error_code = ?, updated_at = ? WHERE id = ? AND operation_id = ?`, [providerErrorCode(error), Math.floor(Date.now() / 1000), license.id, operationId])
    throw error
  }
  return await loadLicense(db, input.organizationId, input.siteId, locale)
}

export async function reconcileSiteLanguageSubscription(
  db: DbClient,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  if (!event.type.startsWith('customer.subscription.')) return
  const eventSubscription = event.data.object as Stripe.Subscription
  const billing = await queryFirst<{ organization_id: string }>(db, `
    SELECT organization_id FROM organization_billing WHERE stripe_subscription_id = ? LIMIT 1
  `, [eventSubscription.id])
  if (!billing) return

  let subscription: Stripe.Subscription | null = null
  if (event.type !== 'customer.subscription.deleted') {
    subscription = await stripe.subscriptions.retrieve(eventSubscription.id, { expand: ['items.data.price.product'] })
  }
  const rows = await queryAll<LanguageLicenseRow & { locale: string; site_id: string }>(db, `
    SELECT id, site_id, locale, status, operation_id, provider_idempotency_key,
           stripe_subscription_id, stripe_subscription_item_id, last_provider_quantity
      FROM site_language_licenses
     WHERE organization_id = ?
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'enabling' THEN 1 WHEN 'disabling' THEN 2 ELSE 3 END,
              site_id, locale
  `, [billing.organization_id])
  if (!rows.length) return

  const item = subscription ? languageItem(subscription) : null
  const quantity = Math.max(0, item?.quantity ?? 0)
  if (quantity > rows.length) {
    await execute(db, `
      UPDATE site_language_licenses
         SET last_error_code = 'provider_quantity_unmapped', last_provider_quantity = ?, updated_at = ?
       WHERE organization_id = ?
    `, [quantity, Math.floor(Date.now() / 1000), billing.organization_id])
    throw new Error(`Stripe language quantity ${quantity} exceeds the ${rows.length} mapped site-language licenses for organization ${billing.organization_id}`)
  }

  const now = Math.floor(Date.now() / 1000)
  const nowIso = new Date().toISOString()
  const statements: BatchQuery[] = []
  rows.forEach((row, index) => {
    const active = index < quantity
    statements.push({
      query: `UPDATE site_language_licenses
                 SET status = ?, stripe_subscription_id = ?, stripe_subscription_item_id = ?,
                     last_provider_quantity = ?, last_error_code = NULL,
                     activated_at = CASE WHEN ? = 1 THEN COALESCE(activated_at, ?) ELSE activated_at END,
                     disabled_at = CASE WHEN ? = 1 THEN NULL ELSE COALESCE(disabled_at, ?) END,
                     updated_at = ?
               WHERE id = ?`,
      params: [active ? 'active' : 'disabled', subscription?.id ?? row.stripe_subscription_id,
        active ? item?.id ?? null : null, quantity, active ? 1 : 0, now, active ? 1 : 0, now, now, row.id],
    })
    statements.push({
      query: `UPDATE site_locales SET status = ?, updated_at = ?
               WHERE organization_id = ? AND site_id = ? AND locale = ? AND is_source = 0`,
      params: [active ? 'published' : 'disabled', nowIso, billing.organization_id, row.site_id, row.locale],
    })
  })
  await executeBatch(db, statements, { operation: 'reconcile site language subscription quantity' })
}

export async function deleteDisabledSiteLanguageContent(
  db: DbClient,
  input: { organizationId: string; siteId: string; locale: unknown },
): Promise<{ deleted: true; locale: string }> {
  const locale = canonicalizeLocale(input.locale)
  if (locale === 'en') localizationError(422, 'LOCALIZATION_VALIDATION_FAILED', 'English source content cannot be deleted')
  const license = await loadLicense(db, input.organizationId, input.siteId, locale)
  if (license && license.status !== 'disabled') localizationError(409, 'LANGUAGE_LICENSE_SYNCING', 'Disable the language before permanently deleting its content', { locale })
  const documents = await queryFirst<{ ids: string | null }>(db, `
    SELECT json_group_array(document_id) AS ids
      FROM (
        SELECT document_id FROM resource_localizations
         WHERE organization_id = ? AND site_id = ? AND locale = ? AND document_id IS NOT NULL
        UNION
        SELECT document_id FROM tenant_page_variants
         WHERE organization_id = ? AND site_id = ? AND locale = ? AND document_id IS NOT NULL
      )
  `, [input.organizationId, input.siteId, locale, input.organizationId, input.siteId, locale])
  const documentIds = documents?.ids ? JSON.parse(documents.ids) as string[] : []
  const statements = [
    { query: `DELETE FROM site_redirects WHERE organization_id = ? AND site_id = ? AND locale = ?`, params: [input.organizationId, input.siteId, locale] },
    { query: `DELETE FROM resource_localizations WHERE organization_id = ? AND site_id = ? AND locale = ?`, params: [input.organizationId, input.siteId, locale] },
    { query: `DELETE FROM tenant_page_variants WHERE organization_id = ? AND site_id = ? AND locale = ?`, params: [input.organizationId, input.siteId, locale] },
    ...documentIds.map(documentId => ({ query: `DELETE FROM content_documents WHERE id = ?`, params: [documentId] })),
    { query: `DELETE FROM site_language_licenses WHERE organization_id = ? AND site_id = ? AND locale = ? AND status = 'disabled'`, params: [input.organizationId, input.siteId, locale] },
    { query: `DELETE FROM site_locales WHERE organization_id = ? AND site_id = ? AND locale = ? AND is_source = 0`, params: [input.organizationId, input.siteId, locale] },
  ]
  await executeBatch(db, statements, { operation: 'delete disabled language content' })
  return { deleted: true, locale }
}

export async function getSiteLanguageSettings(
  db: DbClient,
  env: SiteLanguageBillingEnv,
  input: { organizationId: string; siteId: string },
) {
  const billing = await queryFirst<BillingProjectionRow>(db, `
    SELECT plan, status, payment_status, paid_through, past_due_since, current_period_end, stripe_subscription_id
      FROM organization_billing WHERE organization_id = ? LIMIT 1
  `, [input.organizationId])
  const effectivePlan = billing ? getEffectiveAccessPlan({
    plan: billing.plan,
    status: billing.status,
    paymentStatus: billing.payment_status,
    paidThrough: billing.paid_through,
    pastDueSince: billing.past_due_since,
    periodEnd: billing.current_period_end,
  }) : 'free'
  let interval: BillingInterval | null = null
  if (effectivePlan === 'growth' && billing?.stripe_subscription_id && env.STRIPE_SECRET_KEY) {
    const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
    const subscription = await stripe.subscriptions.retrieve(billing.stripe_subscription_id, { expand: ['items.data.price.product'] })
    interval = resolveSubscriptionInterval(subscription)
  }
  const currentHash = await englishManifestHash()
  const languages = await queryFirst<{ json: string }>(db, `
    SELECT json_group_array(json_object(
      'locale', sl.locale,
      'label', sl.label,
      'is_source', sl.is_source,
      'locale_status', sl.status,
      'license_status', l.status,
      'last_error_code', l.last_error_code,
      'catalog_status', c.status,
      'catalog_current', CASE WHEN c.source_manifest_hash = ? THEN 1 ELSE 0 END
    )) AS json
      FROM site_locales sl
      LEFT JOIN site_language_licenses l
        ON l.organization_id = sl.organization_id AND l.site_id = sl.site_id AND l.locale = sl.locale
      LEFT JOIN platform_locale_catalogs c ON c.locale = sl.locale
     WHERE sl.organization_id = ? AND sl.site_id = ?
  `, [currentHash, input.organizationId, input.siteId])
  const availableCatalogs = await queryFirst<{ json: string }>(db, `
    SELECT json_group_array(json_object('locale', locale, 'label', label, 'direction', direction)) AS json
      FROM platform_locale_catalogs
     WHERE status = 'available' AND source_manifest_hash = ?
     ORDER BY locale
  `, [currentHash])
  return {
    effective_plan: effectivePlan,
    interval,
    unit_amount_cents: interval ? expectedAmount(interval) : null,
    languages: languages?.json ? JSON.parse(languages.json) : [],
    available_catalogs: availableCatalogs?.json ? JSON.parse(availableCatalogs.json) : [],
  }
}
