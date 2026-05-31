// Stripe product/price seeder for managed service plans.
// Run: node scripts/seed-stripe.mjs
// Requires STRIPE_SECRET_KEY in .env (reads via dotenv-style manual parse).
import { readFileSync, createReadStream, existsSync } from 'node:fs'
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

// --- Upload local image to Stripe ---
async function uploadProductImage(localPath) {
  if (!localPath || !existsSync(localPath)) {
    if (localPath) console.warn(`  Image not found at path: ${localPath}`);
    return null;
  }
  console.log(`  Uploading image: ${localPath}`);
  try {
    const file = await stripe.files.create({
      purpose: 'product_image',
      file: {
        data: createReadStream(localPath),
        name: localPath.split('/').pop(),
        type: 'application/octet-stream'
      }
    });
    const fileLink = await stripe.fileLinks.create({
      file: file.id
    });
    return fileLink.url;
  } catch (err) {
    console.error('  Failed to upload image:', err.message);
    return null;
  }
}

// --- Create or update recurring subscription plans ---
async function createSubscriptionPlan({ name, description, planId, amountCents, highlighted, badge, features, imagePath }) {
  console.log(`\nUpserting plan: ${name} ($${amountCents / 100}/mo)`)

  let imageUrl = null;
  if (imagePath) {
    imageUrl = await uploadProductImage(imagePath);
  }

  const existing = await stripe.products.list({ active: true, limit: 100 })
  const match = existing.data.find(p => p.metadata?.plan_id === planId)

  const updateData = {
    description,
    marketing_features: features.map(f => ({ name: f })),
    metadata: {
      plan_id: planId,
      highlighted: highlighted ? 'true' : 'false',
      ...(badge ? { badge } : {}),
    },
  }
  if (imageUrl) {
    updateData.images = [imageUrl]
  }

  if (match) {
    // Update description and marketing_features on existing product
    await stripe.products.update(match.id, updateData)
    console.log(`  Updated: ${match.id}`)
    return match
  }

  const product = await stripe.products.create({
    name,
    ...updateData
  })

  await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: amountCents,
    recurring: { interval: 'month' },
  })

  console.log(`  Created: ${product.id}`)
  return product
}

// --- Create one-time prices ---
async function createOneTimePrice({ productName, amountCents, priceKey }) {
  console.log(`\nCreating one-time price: ${productName} ($${amountCents / 100})`)

  // Check if product already exists by metadata.addon_type
  const existingProducts = await stripe.products.list({ active: true, limit: 100 })
  const existingProduct = existingProducts.data.find(p => p.metadata?.addon_type === priceKey)

  if (existingProduct) {
    console.log(`  Product already exists: ${existingProduct.id}`)
    // Search for an existing price matching currency 'usd' and unit_amount === amountCents for that product
    const existingPrices = await stripe.prices.list({
      product: existingProduct.id,
      active: true,
      limit: 100
    })
    const existingPrice = existingPrices.data.find(p => p.currency === 'usd' && p.unit_amount === amountCents)
    if (existingPrice) {
      console.log(`  Price already exists: ${existingPrice.id} — skipping`)
      return { product: existingProduct, price: existingPrice }
    } else {
      console.log(`  Product exists but matching price does not. Creating price...`)
      const price = await stripe.prices.create({
        product: existingProduct.id,
        currency: 'usd',
        unit_amount: amountCents,
      })
      console.log(`  Created price:   ${price.id}`)
      return { product: existingProduct, price }
    }
  }

  const product = await stripe.products.create({
    name: productName,
    metadata: { addon_type: priceKey },
  })

  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: amountCents,
  })

  console.log(`  Created product: ${product.id}`)
  console.log(`  Created price:   ${price.id}`)
  return { product, price }
}

async function main() {
  console.log('=== KrabiClaw Stripe Seeder ===')
  console.log(`Mode: ${STRIPE_SECRET_KEY.startsWith('sk_test') ? 'TEST' : 'LIVE'}`)

  await archiveOldPlans()

  // Recurring plans
  await createSubscriptionPlan({
    name: 'Growth',
    description: 'Your site, your domain — we handle updates so you can focus on your business.',
    planId: 'growth',
    amountCents: 4900,
    highlighted: false,
    imagePath: '/Users/paulchrisluke/Downloads/growth.png',
    features: [
      'AI-built site live in minutes',
      'Your own domain (yourbusiness.com)',
      'WhatsApp content & hours updates — we handle it',
      'Bookings, experiences & ordering links',
      'Booking notifications via WhatsApp or email',
      '1 language translation by our team',
      'Google Business profile basics',
    ],
  })

  await createSubscriptionPlan({
    name: 'Managed',
    description: 'Send us a WhatsApp. We run your online presence — no dashboard login needed.',
    planId: 'managed',
    amountCents: 14900,
    highlighted: true,
    badge: 'Best Value',
    imagePath: '/Users/paulchrisluke/Downloads/managed.png',
    features: [
      'Everything in Growth, plus:',
      'We manage all content — no login needed',
      'Unlimited language translations',
      'Facebook auto-sync for posts and content',
      'Full Google Business profile management',
      'Priority WhatsApp support from Paul & Julia',
    ],
  })

  await createSubscriptionPlan({
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
