// Stripe product/price seeder for managed service plans.
// Run: node scripts/seed-stripe.mjs
// Requires STRIPE_SECRET_KEY in .env (reads via dotenv-style manual parse).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import Stripe from 'stripe'

// --- Parse .env manually (no dotenv dependency needed) ---
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
    const env = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      env[key] = val
    }
    return env
  } catch {
    return {}
  }
}

const env = loadEnv()
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY not found in environment or .env')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY)

// CLI args
const args = process.argv.slice(2)
const force = args.includes('--yes') || args.includes('-y')
const apply = args.includes('--apply') || args.includes('--run')
const dryRun = !apply
const fixturesArg = args.find(a => a.startsWith('--fixtures='))
const fixtureSlug = fixturesArg ? fixturesArg.split('=')[1] : null

// Safety: prevent accidental live modifications. If a live key is used,
// require explicit confirmation via `--yes` CLI flag or --apply.
if (STRIPE_SECRET_KEY.startsWith('sk_live') && !force && !apply) {
  console.error('\nERROR: Detected a LIVE Stripe key. To proceed, re-run with --yes (or -y) AND --apply.')
  console.error('This script will modify Stripe products and prices. Aborting for safety.')
  process.exit(2)
}

// --- Archive old plans ---
async function archiveOldPlans() {
  console.log('\nArchiving old pro/enterprise products...')
  let startingAfter;
  while (true) {
    const products = await stripe.products.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {})
    })
    for (const product of products.data) {
      const planId = product.metadata?.plan_id
      if (planId === 'pro' || planId === 'enterprise') {
        await stripe.products.update(product.id, { active: false })
        console.log(`  Archived: ${product.name} (${product.id})`)
      }
    }
    if (!products.has_more || products.data.length === 0) break
    startingAfter = products.data[products.data.length - 1]?.id
  }
}

// --- Create or update recurring subscription plans ---
function makePlaceholderId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`
}

async function createSubscriptionPlan({ name, description, planId, amountCents, highlighted, badge, features }, options = { dryRun: false }) {
  const { dryRun } = options
  console.log(`\nUpserting plan: ${name} ($${amountCents / 100}/mo)`)
  if (dryRun) {
    const product = { id: makePlaceholderId('prod'), name, metadata: { plan_id: planId }, description }
    const price = { id: makePlaceholderId('price'), unit_amount: amountCents, currency: 'usd', recurring: { interval: 'month' } }
    console.log(`  Dry-run: would create product ${product.id} and price ${price.id}`)
    return { product, price }
  }

  const existing = await stripe.products.list({ active: true, limit: 100 })
  const match = existing.data.find(p => p.metadata?.plan_id === planId)

  if (match) {
    // Update description and marketing_features on existing product
    await stripe.products.update(match.id, {
      description,
      marketing_features: features.map(f => ({ name: f })),
      metadata: {
        plan_id: planId,
        highlighted: highlighted ? 'true' : 'false',
        ...(badge ? { badge } : {}),
      },
    })
    console.log(`  Updated: ${match.id}`)
    // Ensure there is a price for the product
    const existingPrices = await stripe.prices.list({ product: match.id, active: true, limit: 100 })
    let price = existingPrices.data.find(p => p.currency === 'usd' && p.unit_amount === amountCents)
    if (!price) {
      price = await stripe.prices.create({ product: match.id, currency: 'usd', unit_amount: amountCents, recurring: { interval: 'month' } })
      console.log(`  Created price: ${price.id}`)
    }
    return { product: match, price }
  }

  const product = await stripe.products.create({
    name,
    description,
    metadata: {
      plan_id: planId,
      highlighted: highlighted ? 'true' : 'false',
      ...(badge ? { badge } : {}),
    },
    marketing_features: features.map(f => ({ name: f })),
  })

  const price = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: amountCents, recurring: { interval: 'month' } })
  console.log(`  Created: ${product.id} / price ${price.id}`)
  return { product, price }
}

// --- Create one-time prices ---
async function createOneTimePrice({ productName, amountCents, priceKey }, options = { dryRun: false }) {
  const { dryRun } = options
  console.log(`\nCreating one-time price: ${productName} ($${amountCents / 100})`)

  if (dryRun) {
    const product = { id: makePlaceholderId('prod'), name: productName, metadata: { addon_type: priceKey } }
    const price = { id: makePlaceholderId('price'), unit_amount: amountCents, currency: 'usd' }
    console.log(`  Dry-run: would create product ${product.id} and price ${price.id}`)
    return { product, price }
  }

  // Check if product already exists by metadata.addon_type
  const existingProducts = await stripe.products.list({ active: true, limit: 100 })
  const existingProduct = existingProducts.data.find(p => p.metadata?.addon_type === priceKey)

  if (existingProduct) {
    console.log(`  Product already exists: ${existingProduct.id}`)
    // Search for an existing price matching currency 'usd' and unit_amount === amountCents for that product
    const existingPrices = await stripe.prices.list({ product: existingProduct.id, active: true, limit: 100 })
    const existingPrice = existingPrices.data.find(p => p.currency === 'usd' && p.unit_amount === amountCents)
    if (existingPrice) {
      console.log(`  Price already exists: ${existingPrice.id} — skipping`)
      return { product: existingProduct, price: existingPrice }
    } else {
      console.log(`  Product exists but matching price does not. Creating price...`)
      const price = await stripe.prices.create({ product: existingProduct.id, currency: 'usd', unit_amount: amountCents })
      console.log(`  Created price:   ${price.id}`)
      return { product: existingProduct, price }
    }
  }

  const product = await stripe.products.create({ name: productName, metadata: { addon_type: priceKey } })
  const price = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: amountCents })

  console.log(`  Created product: ${product.id}`)
  console.log(`  Created price:   ${price.id}`)
  return { product, price }
}

async function main() {
  console.log('=== KrabiClaw Stripe Seeder ===')
  console.log(`Mode: ${STRIPE_SECRET_KEY.startsWith('sk_test') ? 'TEST' : 'LIVE'} — ${dryRun ? 'DRY-RUN' : 'APPLY'}`)

  await archiveOldPlans()

  // Recurring plans
  const fixtures = { recurring: {}, oneTime: {} }

  const growth = await createSubscriptionPlan({
    name: 'Growth',
    description: 'Your site, your domain — we handle updates so you can focus on your business.',
    planId: 'growth',
    amountCents: 4900,
    highlighted: false,
    features: [
      'AI-built site live in minutes',
      'Your own domain (yourbusiness.com)',
      'WhatsApp content & hours updates — we handle it',
      'Bookings, experiences & ordering links',
      'Booking notifications via WhatsApp or email',
      '1 language translation by our team',
      'Google Business profile basics',
    ],
  }, { dryRun })
  fixtures.recurring.growth = { productId: growth.product.id, priceId: growth.price.id }

  const managed = await createSubscriptionPlan({
    name: 'Managed',
    description: 'Send us a WhatsApp. We run your online presence — no dashboard login needed.',
    planId: 'managed',
    amountCents: 14900,
    highlighted: true,
    badge: 'Best Value',
    features: [
      'Everything in Growth, plus:',
      'We manage all content — no login needed',
      'Unlimited language translations',
      'Facebook auto-sync for posts and content',
      'Full Google Business profile management',
      'Priority WhatsApp support from Paul & Julia',
    ],
  }, { dryRun })
  fixtures.recurring.managed = { productId: managed.product.id, priceId: managed.price.id }

  const seo = await createSubscriptionPlan({
    name: 'SEO Accelerator',
    description: "Active SEO strategy from Julia — get found by tourists and recommended by AI.",
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
  }, { dryRun })
  fixtures.recurring.seo_accelerator = { productId: seo.product.id, priceId: seo.price.id }

  // One-time add-ons
  const { price: translationPrice } = await createOneTimePrice({
    productName: 'Additional Language Translation',
    amountCents: 4500,
    priceKey: 'translation',
  }, { dryRun })
  fixtures.oneTime.translation = { priceId: translationPrice.id, productId: translationPrice.product?.id ?? null }

  const { price: seasonalPrice } = await createOneTimePrice({
    productName: 'Seasonal Relaunch Package',
    amountCents: 9900,
    priceKey: 'seasonal',
  }, { dryRun })
  fixtures.oneTime.seasonal = { priceId: seasonalPrice.id, productId: seasonalPrice.product?.id ?? null }

  const { price: gbpPrice } = await createOneTimePrice({
    productName: 'Google Business Optimization',
    amountCents: 4900,
    priceKey: 'gbp_setup',
  }, { dryRun })
  fixtures.oneTime.gbp_setup = { priceId: gbpPrice.id, productId: gbpPrice.product?.id ?? null }

  // Write fixtures file if requested
  if (fixtureSlug) {
    try {
      const dir = resolve(process.cwd(), 'scripts', 'stripe-fixtures')
      mkdirSync(dir, { recursive: true })
      const outPath = resolve(dir, `${fixtureSlug}.json`)
      writeFileSync(outPath, JSON.stringify({ mode: dryRun ? 'dry-run' : 'apply', fixtures, generatedAt: new Date().toISOString() }, null, 2))
      console.log(`\nWrote fixtures to ${outPath}`)
    } catch (err) {
      console.error('Failed to write fixtures file:', err)
    }
  }

  console.log('\n=== Add these to your .env ===')
  console.log(`STRIPE_PRICE_TRANSLATION=${translationPrice.id}`)
  console.log(`STRIPE_PRICE_SEASONAL=${seasonalPrice.id}`)
  console.log(`STRIPE_PRICE_GBP_SETUP=${gbpPrice.id}`)
  console.log('\nDone! Verify products at https://dashboard.stripe.com/test/products')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
