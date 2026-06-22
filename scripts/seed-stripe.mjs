// Stripe product/price seeder for managed service plans.
// Run: node scripts/seed-stripe.mjs
// Requires STRIPE_SECRET_KEY in .env (reads via dotenv-style manual parse).
import { readFileSync, existsSync } from 'node:fs'
import { resolve, extname, basename } from 'node:path'
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

const ACTIVE_PLAN_IDS = new Set(['growth', 'managed', 'seo_accelerator'])

// --- Archive old non-canonical paid plan products ---
async function archiveOldPlans() {
  console.log('\nArchiving non-canonical Stripe plan products...')
  let startingAfter;
  while (true) {
    const products = await stripe.products.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {})
    })
    for (const product of products.data) {
      const planId = product.metadata?.plan_id
      if (planId && !ACTIVE_PLAN_IDS.has(planId)) {
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
    if (localPath) console.warn(`  Image not found at path: ${localPath}`)
    return null
  }
  console.log(`  Uploading image: ${localPath}`)
  try {
    const ext = extname(localPath).toLowerCase()
    const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }
    const mimeType = mimeTypes[ext] ?? 'image/png'
    const fileData = readFileSync(localPath)
    const filename = basename(localPath)

    const form = new FormData()
    form.append('purpose', 'product_image')
    form.append('file', new Blob([fileData], { type: mimeType }), filename)

    const response = await fetch('https://files.stripe.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      body: form,
    })
    const result = await response.json()
    if (!response.ok) {
      console.error('  Failed to upload image:', result?.error?.message ?? JSON.stringify(result))
      return null
    }
    // Create a public file link
    const linkResponse = await fetch('https://api.stripe.com/v1/file_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `file=${result.id}`,
    })
    const link = await linkResponse.json()
    if (!linkResponse.ok) {
      console.error('  Failed to create file link:', link?.error?.message ?? JSON.stringify(link))
      return null
    }
    console.log(`  Uploaded image: ${link.url}`)
    return link.url
  } catch (err) {
    console.error('  Failed to upload image:', err.message)
    return null
  }
}

// --- Create or update recurring subscription plans ---
async function createSubscriptionPlan({ name, description, planId, amountCents, highlighted, badge, features, imagePath }) {
  console.log(`\nUpserting plan: ${name} ($${amountCents / 100}/mo)`)

  // Always upload the image so products get updated images even if they already exist.
  let imageUrl = null
  if (imagePath) {
    imageUrl = await uploadProductImage(imagePath)
  }

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

  const existing = await stripe.products.list({ active: true, limit: 100 })
  const match = existing.data.find(p => p.metadata?.plan_id === planId)

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
async function createOneTimePrice({ productName, amountCents, priceKey, description, features }) {
  console.log(`\nCreating one-time price: ${productName} ($${amountCents / 100})`)

  const productData = {
    name: productName,
    metadata: { addon_type: priceKey },
    ...(description ? { description } : {}),
    ...(features?.length ? { marketing_features: features.map(f => ({ name: f })) } : {}),
  }

  // Check if product already exists by metadata.addon_type
  const existingProducts = await stripe.products.list({ active: true, limit: 100 })
  const existingProduct = existingProducts.data.find(p => p.metadata?.addon_type === priceKey)

  if (existingProduct) {
    console.log(`  Product already exists: ${existingProduct.id} — updating description & features`)
    await stripe.products.update(existingProduct.id, {
      ...(description ? { description } : {}),
      ...(features?.length ? { marketing_features: features.map(f => ({ name: f })) } : {}),
    })
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

  const product = await stripe.products.create(productData)

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
    description: 'Your site, your domain — go live in minutes and edit everything through ChatGPT.',
    planId: 'growth',
    amountCents: 4900,
    highlighted: false,
    imagePath: '/Users/paulchrisluke/Downloads/growth.png',
    features: [
      'Restaurant or experience site live in minutes',
      'Your own domain (yourbusiness.com)',
      'Unlimited locations per site — add more sites anytime',
      'Edit menus, content & photos through ChatGPT',
      'Bookings, ticketed experiences & delivery links',
      'WhatsApp booking & reservation notifications',
      'Auto-sync from Facebook & Instagram',
      'Google Business profile sync',
      '1 language translation included',
    ],
  })

  await createSubscriptionPlan({
    name: 'Managed',
    description: 'Send us a WhatsApp. We run your online presence — no login needed.',
    planId: 'managed',
    amountCents: 14900,
    highlighted: true,
    badge: 'Best Value',
    imagePath: '/Users/paulchrisluke/Downloads/managed.png',
    features: [
      'Everything in Growth, plus:',
      'We manage your site for you — just WhatsApp us',
      'Unlimited language translations',
      'Full Google Business profile management',
      'Monthly content updates & photo refreshes',
      'Priority WhatsApp support from Paul & Julia',
    ],
  })

  await createSubscriptionPlan({
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
  })

  // One-time add-ons
  const { price: translationPrice } = await createOneTimePrice({
    productName: 'Additional Language Translation',
    amountCents: 4500,
    priceKey: 'translation',
    description: 'Professional translation into Thai, Chinese, Russian, or any target language — reviewed and published to your live site.',
    features: [
      'Human-reviewed AI translation',
      'Published to your live site',
      'Thai, Chinese, Russian, Korean & more',
      'Covers all pages: menus, content, Q&A',
    ],
  })

  const { price: seasonalPrice } = await createOneTimePrice({
    productName: 'Seasonal Relaunch Package',
    amountCents: 9900,
    priceKey: 'seasonal',
    description: 'Content refresh for a new season, promotion, or menu change — updated copy, photos, and Google Business sync.',
    features: [
      'Updated homepage and menu copy',
      'Seasonal photo refresh',
      'Google Business profile sync',
      'New promotion or event feature',
    ],
  })

  const { price: gbpPrice } = await createOneTimePrice({
    productName: 'Google Business Optimization',
    amountCents: 4900,
    priceKey: 'gbp_setup',
    description: 'Full Google Business Profile setup and optimization — categories, photos, posts, Q&A, and service areas configured by our team.',
    features: [
      'Category and service area optimization',
      'Photo upload and ordering',
      'Q&A seeding for common guest questions',
      'First Google post published',
    ],
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
