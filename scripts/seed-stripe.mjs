// Stripe product/price seeder for managed service plans.
// Run: node scripts/seed-stripe.mjs
// Requires STRIPE_SECRET_KEY in .env (reads via dotenv-style manual parse).
import { readFileSync } from 'node:fs'
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

// --- Archive old plans ---
async function archiveOldPlans() {
  console.log('\nArchiving old pro/enterprise products...')
  const products = await stripe.products.list({ active: true, limit: 100 })
  for (const product of products.data) {
    const planId = product.metadata?.plan_id
    if (planId === 'pro' || planId === 'enterprise') {
      await stripe.products.update(product.id, { active: false })
      console.log(`  Archived: ${product.name} (${product.id})`)
    }
  }
}

// --- Create recurring subscription plans ---
async function createSubscriptionPlan({ name, description, planId, amountCents, highlighted, badge, features }) {
  console.log(`\nCreating plan: ${name} ($${amountCents / 100}/mo)`)

  // Check if already exists
  const existing = await stripe.products.list({ active: true, limit: 100 })
  const match = existing.data.find(p => p.metadata?.plan_id === planId)
  if (match) {
    console.log(`  Already exists: ${match.id} — skipping`)
    return match
  }

  const product = await stripe.products.create({
    name,
    description,
    metadata: {
      plan_id: planId,
      highlighted: highlighted ? 'true' : 'false',
      ...(badge ? { badge } : {}),
    },
    marketing_features: features.map(name => ({ name })),
  })

  await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: amountCents,
    recurring: { interval: 'month' },
  })

  console.log(`  Created product: ${product.id}`)
  return product
}

// --- Create one-time prices ---
async function createOneTimePrice({ productName, amountCents, priceKey }) {
  console.log(`\nCreating one-time price: ${productName} ($${amountCents / 100})`)

  const product = await stripe.products.create({
    name: productName,
    metadata: { addon_type: priceKey },
  })

  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: amountCents,
  })

  console.log(`  Product: ${product.id}`)
  console.log(`  Price:   ${price.id}`)
  return { product, price }
}

async function main() {
  console.log('=== KrabiClaw Stripe Seeder ===')
  console.log(`Mode: ${STRIPE_SECRET_KEY.startsWith('sk_test') ? 'TEST' : 'LIVE'}`)

  await archiveOldPlans()

  // Recurring plans
  await createSubscriptionPlan({
    name: 'Growth',
    description: 'We handle translations & updates — you focus on cooking.',
    planId: 'growth',
    amountCents: 4900,
    highlighted: false,
    features: [
      'One language translation (EN, ZH, or DE)',
      'AI-assisted menu updates via WhatsApp',
      'Monthly traffic & performance snapshot',
      'Google Business profile basics',
      '2,000 AI credits / month',
    ],
  })

  await createSubscriptionPlan({
    name: 'Managed',
    description: 'Paul & Julia run your restaurant online — send a voice note, we handle the rest.',
    planId: 'managed',
    amountCents: 14900,
    highlighted: true,
    badge: 'Best Value',
    features: [
      'Everything in Growth, plus:',
      'Unlimited language translations',
      'Menu, posts & seasonal content managed for you',
      'Full Google Business profile management',
      'Monthly marketing report',
      'Priority WhatsApp support from Paul & Julia',
    ],
  })

  await createSubscriptionPlan({
    name: 'SEO Accelerator',
    description: "Julia's 1M impressions/day playbook applied to your restaurant.",
    planId: 'seo_accelerator',
    amountCents: 34900,
    highlighted: false,
    features: [
      'Everything in Managed, plus:',
      'Local & travel keyword targeting',
      'Google Maps authority building',
      'Monthly content cadence (blog, photos, posts)',
      'Competitive analysis & reporting',
      'The same playbook behind tiffycooks.com — 1M daily impressions',
    ],
  })

  // One-time add-ons
  const { price: translationPrice } = await createOneTimePrice({
    productName: 'Additional Language Translation',
    amountCents: 4500,
    priceKey: 'translation',
  })

  const { price: seasonalPrice } = await createOneTimePrice({
    productName: 'Seasonal Relaunch Package',
    amountCents: 9900,
    priceKey: 'seasonal',
  })

  const { price: gbpPrice } = await createOneTimePrice({
    productName: 'Google Business Optimization',
    amountCents: 4900,
    priceKey: 'gbp_setup',
  })

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
