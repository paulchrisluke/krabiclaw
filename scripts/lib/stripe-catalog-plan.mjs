import { createHash } from 'node:crypto'

export const CATALOG_PLAN_SCHEMA_VERSION = 1
export const ACTIVE_PLAN_IDS = Object.freeze(['growth', 'managed', 'seo_accelerator'])
const SUPPORTED_OPERATION_TYPES = new Set([
  'archive_product',
  'upload_product_image',
  'create_product',
  'create_price',
  'deactivate_price',
  'update_product',
])

export const PLAN_DEFINITIONS = Object.freeze([
  {
    name: 'Growth',
    description: 'Your site, your domain — go live in minutes and edit everything through ChatGPT.',
    planId: 'growth',
    amountCents: 4900,
    highlighted: true,
    badge: 'Most Popular',
    imagePath: 'scripts/assets/stripe/growth.png',
    features: [
      'Restaurant or experience site live in minutes',
      'Your own domain (yourbusiness.com)',
      'Edit menus, content & photos through ChatGPT',
      'Bookings & ticketed experiences',
      'Messaging booking & reservation notifications',
      'Auto-sync from Facebook & Instagram',
      'Google Business profile sync',
    ],
  },
  {
    name: 'Managed',
    description: 'Send us a WhatsApp. We run your online presence — no login needed.',
    planId: 'managed',
    amountCents: 14900,
    highlighted: true,
    badge: 'Best Value',
    imagePath: 'scripts/assets/stripe/managed.png',
    features: [
      'Everything in Growth, plus:',
      'We manage your site for you — just WhatsApp us',
      'Full Google Business profile management',
      'Monthly content updates & photo refreshes',
      'Priority WhatsApp support from Paul & Julia',
    ],
  },
  {
    name: 'SEO Accelerator',
    description: 'Active SEO & AEO strategy from Julia — get found by tourists and recommended by AI.',
    planId: 'seo_accelerator',
    amountCents: 34900,
    highlighted: false,
    features: [
      'Everything in Managed, plus:',
      'Active keyword strategy for local & travel searches',
      'Monthly content cadence — blog, photos, seasonal',
      'Google Maps authority building',
      'Get recommended by ChatGPT, Claude & Perplexity',
      "Julia's playbook — tiffycooks.com 1M+ daily impressions",
    ],
  },
])

const IMAGE_MIME_TYPES = Object.freeze({
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
})

export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

export function sha256Json(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

export function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function keyMode(key) {
  if (/^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(String(key ?? ''))) return 'test'
  if (/^(?:sk|rk)_live_[A-Za-z0-9]+$/.test(String(key ?? ''))) return 'live'
  return 'unknown'
}

export function assertTestModeKey(key) {
  if (keyMode(key) !== 'test') {
    throw new Error('Stripe catalog apply requires a test-mode key (sk_test_ or rk_test_).')
  }
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {}
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, String(value ?? '')]).sort(([a], [b]) => a.localeCompare(b)))
}

function normalizeProduct(product) {
  return {
    id: String(product.id),
    active: Boolean(product.active),
    name: product.name ?? null,
    description: product.description ?? null,
    metadata: normalizeMetadata(product.metadata),
    default_price: typeof product.default_price === 'string'
      ? product.default_price
      : product.default_price?.id ?? null,
    images: Array.isArray(product.images) ? [...product.images] : [],
  }
}

function normalizePrice(price) {
  return {
    id: String(price.id),
    product: typeof price.product === 'string' ? price.product : price.product?.id ?? null,
    active: Boolean(price.active),
    type: price.type ?? null,
    currency: price.currency ?? null,
    unit_amount: price.unit_amount ?? null,
    recurring: price.recurring
      ? {
          interval: price.recurring.interval ?? null,
          interval_count: price.recurring.interval_count ?? null,
        }
      : null,
  }
}

async function listAll(list, params) {
  const rows = []
  let startingAfter
  while (true) {
    const page = await list({ ...params, ...(startingAfter ? { starting_after: startingAfter } : {}) })
    rows.push(...(page.data ?? []))
    if (!page.has_more || page.data?.length === 0) break
    startingAfter = page.data[page.data.length - 1]?.id
    if (!startingAfter) throw new Error('Stripe list response reported more rows without a final id.')
  }
  return rows
}

export async function readCatalogSnapshot(readAdapter, { accountMode = 'unknown' } = {}) {
  const products = (await listAll(readAdapter.products.list.bind(readAdapter.products), { active: true, limit: 100 }))
    .map(normalizeProduct)
    .sort((a, b) => a.id.localeCompare(b.id))
  const planProductIds = new Set(products
    .filter(product => ACTIVE_PLAN_IDS.includes(product.metadata.plan_id))
    .map(product => product.id))
  const recurringPrices = {}
  for (const productId of [...planProductIds].sort()) {
    recurringPrices[productId] = (await listAll(
      readAdapter.prices.list.bind(readAdapter.prices),
      { product: productId, active: true, type: 'recurring', limit: 100 },
    )).map(normalizePrice).sort((a, b) => a.id.localeCompare(b.id))
  }
  return { accountMode, products, recurringPrices }
}

export async function createCatalogPlan({
  readAdapter,
  filesAdapter,
  imageFiles,
  accountMode = 'unknown',
}) {
  const snapshot = await readCatalogSnapshot(readAdapter, { accountMode })
  const describedImages = imageFiles ?? await filesAdapter?.describeImageFiles?.() ?? {}
  return buildCatalogPlan({ snapshot, imageFiles: describedImages })
}

function productPatch(definition, priceRef, imageRef) {
  const patch = {
    description: definition.description,
    marketing_features: definition.features.map(name => ({ name })),
    metadata: {
      plan_id: definition.planId,
      highlighted: definition.highlighted ? 'true' : 'false',
      ...(definition.badge ? { badge: definition.badge } : {}),
      monthly_price_id: priceRef,
    },
    default_price: priceRef,
  }
  if (imageRef) patch.images = [imageRef]
  return patch
}

function matchingMonthlyPrice(prices, amountCents) {
  return prices.find(price =>
    price.currency === 'usd'
    && price.unit_amount === amountCents
    && price.recurring?.interval === 'month'
    && price.recurring?.interval_count === 1,
  ) ?? null
}

function imageOperation(definition, imageFiles) {
  const image = imageFiles?.[definition.planId]
  if (!image?.exists) return null
  return {
    type: 'upload_product_image',
    planId: definition.planId,
    path: image.path,
    sha256: image.sha256,
    mimeType: image.mimeType,
    fileName: image.fileName,
  }
}

export function buildCatalogPlan({ snapshot, imageFiles = {} }) {
  const operations = []
  for (const product of snapshot.products) {
    const planId = product.metadata.plan_id
    if (planId && !ACTIVE_PLAN_IDS.includes(planId)) {
      operations.push({
        type: 'archive_product',
        productId: product.id,
        expected: product,
      })
    }
  }

  for (const definition of PLAN_DEFINITIONS) {
    const existing = snapshot.products.find(product => product.metadata.plan_id === definition.planId)
    const productRef = existing ? { id: existing.id } : { ref: { kind: 'product', planId: definition.planId } }
    const image = imageOperation(definition, imageFiles)
    if (image) operations.push(image)

    const prices = existing ? (snapshot.recurringPrices[existing.id] ?? []) : []
    const canonical = matchingMonthlyPrice(prices, definition.amountCents)
    const priceRef = canonical
      ? canonical.id
      : { ref: { kind: 'price', planId: definition.planId } }

    if (!existing) {
      operations.push({
        type: 'create_product',
        planId: definition.planId,
        params: {
          name: definition.name,
          description: definition.description,
          marketing_features: definition.features.map(name => ({ name })),
          metadata: {
            plan_id: definition.planId,
            highlighted: definition.highlighted ? 'true' : 'false',
            ...(definition.badge ? { badge: definition.badge } : {}),
          },
        },
      })
    }

    if (!canonical) {
      operations.push({
        type: 'create_price',
        planId: definition.planId,
        product: productRef,
        params: {
          currency: 'usd',
          unit_amount: definition.amountCents,
          recurring: { interval: 'month', interval_count: 1 },
        },
      })
    }

    for (const price of prices) {
      if (
        price.id === canonical?.id
        || price.recurring?.interval !== 'month'
        || price.recurring?.interval_count !== 1
      ) continue
      operations.push({ type: 'deactivate_price', priceId: price.id, expected: price })
    }

    operations.push({
      type: 'update_product',
      product: productRef,
      params: productPatch(
        definition,
        priceRef,
        image ? { ref: { kind: 'file', planId: definition.planId } } : null,
      ),
    })
  }

  const plan = {
    schemaVersion: CATALOG_PLAN_SCHEMA_VERSION,
    kind: 'stripe-recurring-catalog-plan',
    accountMode: snapshot.accountMode,
    providerSnapshot: snapshot,
    providerSnapshotSha256: sha256Json(snapshot),
    operations,
  }
  return { ...plan, planSha256: sha256Json(plan) }
}

export function planSha256(plan) {
  const { planSha256: _ignored, ...unsigned } = plan
  return sha256Json(unsigned)
}

export function assertPlanIntegrity(plan, confirmedSha256) {
  const computed = planSha256(plan)
  if (plan.planSha256 !== computed) throw new Error('Stripe catalog plan file hash is invalid or the file was edited.')
  if (confirmedSha256 !== computed) throw new Error('Stripe catalog plan SHA-256 confirmation does not match the plan file.')
  return computed
}

function resolveReference(value, context) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => resolveReference(item, context))
  if (value.ref?.kind === 'product') return context.products[value.ref.planId]?.id ?? context.products[value.ref.planId]
  if (value.ref?.kind === 'price') return context.prices[value.ref.planId]?.id ?? context.prices[value.ref.planId]
  if (value.ref?.kind === 'file') return context.files[value.ref.planId]
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, resolveReference(nested, context)]))
}

function assertExpectedProduct(snapshot, operation) {
  const current = snapshot.products.find(product => product.id === operation.productId)
  if (!current || stableJson(current) !== stableJson(operation.expected)) {
    throw new Error(`Provider snapshot drift detected for product ${operation.productId}.`)
  }
}

function assertExpectedPrice(snapshot, operation) {
  const current = Object.values(snapshot.recurringPrices).flat().find(price => price.id === operation.priceId)
  if (!current || stableJson(current) !== stableJson(operation.expected)) {
    throw new Error(`Provider snapshot drift detected for price ${operation.priceId}.`)
  }
}

export async function applyCatalogPlan({
  plan,
  confirmedSha256,
  key,
  readAdapter,
  mutationAdapter,
  filesAdapter,
}) {
  assertTestModeKey(key)
  const hash = assertPlanIntegrity(plan, confirmedSha256)
  if (plan.accountMode !== 'test') throw new Error('Stripe catalog apply only accepts a test-mode plan.')
  if (!Array.isArray(plan.operations)) throw new Error('Stripe catalog plan operations must be an array.')
  for (const operation of plan.operations) {
    if (!SUPPORTED_OPERATION_TYPES.has(operation?.type)) {
      throw new Error(`Unsupported Stripe catalog operation: ${operation?.type ?? 'missing type'}`)
    }
  }

  if (filesAdapter?.verifyProductImage) {
    for (const operation of plan.operations.filter(operation => operation.type === 'upload_product_image')) {
      await filesAdapter.verifyProductImage(operation)
    }
  }

  const currentSnapshot = await readCatalogSnapshot(readAdapter, { accountMode: plan.accountMode })
  if (sha256Json(currentSnapshot) !== plan.providerSnapshotSha256) {
    throw new Error('Provider snapshot drift detected; regenerate and review a new plan before applying.')
  }

  const context = { products: {}, prices: {}, files: {} }
  for (const operation of plan.operations) {
    if (operation.type === 'archive_product') {
      assertExpectedProduct(currentSnapshot, operation)
      await mutationAdapter.products.update(operation.productId, { active: false })
      continue
    }
    if (operation.type === 'upload_product_image') {
      if (!filesAdapter?.uploadProductImage) throw new Error('Plan requires a files adapter for image upload.')
      context.files[operation.planId] = await filesAdapter.uploadProductImage(operation)
      continue
    }
    if (operation.type === 'create_product') {
      context.products[operation.planId] = await mutationAdapter.products.create(operation.params)
      continue
    }
    if (operation.type === 'create_price') {
      const resolvedProduct = resolveReference(operation.product, context)
      const product = typeof resolvedProduct === 'string' ? resolvedProduct : resolvedProduct?.id
      if (!product) throw new Error(`Unable to resolve product for ${operation.planId} price creation.`)
      const params = { ...operation.params, product }
      context.prices[operation.planId] = await mutationAdapter.prices.create(params)
      continue
    }
    if (operation.type === 'deactivate_price') {
      assertExpectedPrice(currentSnapshot, operation)
      await mutationAdapter.prices.update(operation.priceId, { active: false })
      continue
    }
    if (operation.type === 'update_product') {
      const resolvedProduct = operation.product.id ?? resolveReference(operation.product, context)
      const productId = typeof resolvedProduct === 'string' ? resolvedProduct : resolvedProduct?.id
      if (!productId) throw new Error('Unable to resolve product for product update.')
      const params = resolveReference(operation.params, context)
      await mutationAdapter.products.update(productId, params)
      continue
    }
    throw new Error(`Unsupported Stripe catalog operation: ${operation.type}`)
  }

  return { planSha256: hash, appliedOperations: plan.operations.length }
}

export function imageMimeType(path) {
  return IMAGE_MIME_TYPES[path.slice(path.lastIndexOf('.')).toLowerCase()] ?? 'image/png'
}
