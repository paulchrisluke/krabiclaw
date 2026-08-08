// Stripe recurring-catalog operator plan.
//
// Default mode is read-only: provider reads produce a deterministic plan JSON
// and SHA-256. Applying requires that reviewed plan, an exact SHA confirmation,
// an unchanged provider snapshot, and a Stripe test-mode key.
//
// Examples:
//   yarn stripe:catalog:plan
//   STRIPE_SECRET_KEY=sk_test_... node scripts/seed-stripe.mjs --dry-run --plan-file .tmp/stripe-catalog-plan.json
//   STRIPE_SECRET_KEY=sk_test_... node scripts/seed-stripe.mjs --apply \
//     --plan-file .tmp/stripe-catalog-plan.json --confirm-sha256 <sha256>

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import Stripe from 'stripe'
import {
  ACTIVE_PLAN_IDS,
  PLAN_DEFINITIONS,
  applyCatalogPlan,
  createCatalogPlan,
  imageMimeType,
  keyMode,
  sha256Bytes,
} from './lib/stripe-catalog-plan.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

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

function secretKeyFromEnv() {
  const env = loadEnv()
  return process.env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY || ''
}

function stripeReadAdapter(stripe) {
  return { products: stripe.products, prices: stripe.prices }
}

function stripeMutationAdapter(stripe) {
  return { products: stripe.products, prices: stripe.prices }
}

function describeImageFiles() {
  return Object.fromEntries(PLAN_DEFINITIONS
    .filter(definition => definition.imagePath)
    .map(definition => {
      const path = definition.imagePath
      const absolutePath = resolve(REPO_ROOT, path)
      if (!existsSync(absolutePath)) return [definition.planId, { path, exists: false }]
      const bytes = readFileSync(absolutePath)
      return [definition.planId, {
        path,
        exists: true,
        sha256: sha256Bytes(bytes),
        mimeType: imageMimeType(path),
        fileName: basename(path),
      }]
    }))
}

function localImagePath(path) {
  return resolve(REPO_ROOT, path)
}

function stripeFilesAdapter(secretKey) {
  return {
    async verifyProductImage(operation) {
      const path = localImagePath(operation.path)
      if (!existsSync(path)) throw new Error(`Stripe catalog image is missing: ${operation.path}`)
      const bytes = readFileSync(path)
      const actualHash = sha256Bytes(bytes)
      if (actualHash !== operation.sha256) {
        throw new Error(`Stripe catalog image changed since plan generation: ${operation.path}`)
      }
    },
    async uploadProductImage(operation) {
      await this.verifyProductImage(operation)
      const path = localImagePath(operation.path)
      const bytes = readFileSync(path)
      const form = new FormData()
      form.append('purpose', 'product_image')
      form.append('file', new Blob([bytes], { type: operation.mimeType }), operation.fileName)

      const response = await fetch('https://files.stripe.com/v1/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}` },
        body: form,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error?.message ?? 'Stripe product image upload failed')

      const linkResponse = await fetch('https://api.stripe.com/v1/file_links', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `file=${encodeURIComponent(result.id)}`,
      })
      const link = await linkResponse.json()
      if (!linkResponse.ok) throw new Error(link?.error?.message ?? 'Stripe product image link creation failed')
      return link.url
    },
  }
}

export function parseCanonicalProductOverrides(values = []) {
  const overrides = {}
  const inputs = Array.isArray(values) ? values : [values]
  for (const value of inputs.filter(item => item != null)) {
    const raw = String(value).trim()
    const separator = raw.indexOf('=')
    if (separator <= 0 || separator === raw.length - 1 || raw.indexOf('=', separator + 1) !== -1) {
      throw new Error('--canonical-product must use the exact plan_id=prod_id format.')
    }
    const planId = raw.slice(0, separator).trim()
    const productId = raw.slice(separator + 1).trim()
    if (!ACTIVE_PLAN_IDS.includes(planId)) {
      throw new Error(`--canonical-product has unsupported plan ID ${planId}.`)
    }
    if (!productId) throw new Error(`--canonical-product ${planId} requires a product ID.`)
    if (Object.hasOwn(overrides, planId)) {
      throw new Error(`Duplicate --canonical-product override for plan ${planId}.`)
    }
    overrides[planId] = productId
  }
  return Object.fromEntries(Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b)))
}

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'dry-run': { type: 'boolean' },
      apply: { type: 'boolean' },
      'plan-file': { type: 'string' },
      'confirm-sha256': { type: 'string' },
      'canonical-product': { type: 'string', multiple: true },
    },
    allowPositionals: false,
  })
  if (values['dry-run'] && values.apply) throw new Error('Choose either --dry-run or --apply, not both.')
  const apply = Boolean(values.apply)
  const planFile = values['plan-file'] ? resolve(String(values['plan-file'])) : null
  if (apply && !planFile) throw new Error('--apply requires an explicit --plan-file.')
  if (apply && !values['confirm-sha256']) throw new Error('--apply requires --confirm-sha256 <plan-sha256>.')
  const canonicalProductIds = parseCanonicalProductOverrides(values['canonical-product'])
  if (apply && Object.keys(canonicalProductIds).length > 0) {
    throw new Error('--canonical-product is only valid when generating a catalog plan.')
  }
  return {
    apply,
    planFile,
    confirmSha256: values['confirm-sha256'] ? String(values['confirm-sha256']) : null,
    canonicalProductIds,
  }
}

function writePlan(path, plan) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
}

export async function main(argv = process.argv.slice(2)) {
  const cli = parseCli(argv)
  const secretKey = secretKeyFromEnv()
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not found in environment or .env')

  // Apply key validation happens before Stripe construction. A live key can
  // never reach an object that exposes mutating catalog methods in apply mode.
  const mode = keyMode(secretKey)
  if (cli.apply && mode !== 'test') {
    throw new Error('Refusing Stripe catalog apply with a live or unrecognised key; use sk_test_ or rk_test_.')
  }

  const stripe = new Stripe(secretKey)
  if (!cli.apply) {
    const plan = await createCatalogPlan({
      readAdapter: stripeReadAdapter(stripe),
      accountMode: mode,
      imageFiles: describeImageFiles(),
      canonicalProductIds: cli.canonicalProductIds,
    })
    if (cli.planFile) {
      writePlan(cli.planFile, plan)
      console.log(`Wrote read-only Stripe catalog plan: ${cli.planFile}`)
      console.log(`Plan SHA-256: ${plan.planSha256}`)
    } else {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
    }
    return { mode, planSha256: plan.planSha256, operationCount: plan.operations.length }
  }

  const plan = JSON.parse(readFileSync(cli.planFile, 'utf8'))
  const result = await applyCatalogPlan({
    plan,
    confirmedSha256: cli.confirmSha256,
    key: secretKey,
    readAdapter: stripeReadAdapter(stripe),
    mutationAdapter: stripeMutationAdapter(stripe),
    filesAdapter: stripeFilesAdapter(secretKey),
  })
  console.log(`Applied ${result.appliedOperations} enumerated Stripe catalog operations.`)
  console.log(`Plan SHA-256: ${result.planSha256}`)
  return result
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isDirectRun) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
