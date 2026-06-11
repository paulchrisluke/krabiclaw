#!/usr/bin/env node
/**
 * Pre-deploy environment check.
 *
 * Verifies that all secrets required for `wrangler deploy` are present and
 * have the necessary API permissions. Fails fast before a full build.
 *
 * Usage:
 *   node scripts/check-deploy-env.mjs            # uses process.env
 *   CLOUDFLARE_API_TOKEN=... node scripts/check-deploy-env.mjs
 *
 * Exit 0 = all checks passed. Non-zero = at least one failure.
 */

const REQUIRED_ENV = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
]

let failed = false

function pass(label) { console.log(`  ✓ ${label}`) }
function fail(label, detail) { console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failed = true }

// ── 1. Required env vars present ────────────────────────────────────────────
console.log('\nChecking required environment variables…')
for (const key of REQUIRED_ENV) {
  if (process.env[key]) pass(key)
  else fail(key, 'not set')
}

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID

if (!CF_TOKEN || !CF_ACCOUNT) {
  console.error('\nCannot check Cloudflare permissions without token + account ID.\n')
  process.exit(1)
}

// ── 2. Cloudflare token is active ────────────────────────────────────────────
console.log('\nChecking Cloudflare token…')
{
  const r = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${CF_TOKEN}` },
  })
  const body = await r.json()
  if (body.success && body.result?.status === 'active') pass('token is active')
  else fail('token verify', body.errors?.[0]?.message ?? `status ${r.status}`)
}

// ── 3. Workers Scripts: Edit (needed for wrangler deploy) ────────────────────
console.log('\nChecking Cloudflare Workers permissions…')
{
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/workers/scripts`,
    { headers: { Authorization: `Bearer ${CF_TOKEN}` } },
  )
  const body = await r.json()
  if (body.success) pass('Workers Scripts: list (read)')
  else fail('Workers Scripts: list', body.errors?.[0]?.message ?? `status ${r.status}`)
}


// ── 5. D1: can list databases ────────────────────────────────────────────────
{
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/d1/database`,
    { headers: { Authorization: `Bearer ${CF_TOKEN}` } },
  )
  const body = await r.json()
  if (body.success) pass('D1: list databases')
  else fail('D1: list databases', body.errors?.[0]?.message ?? `status ${r.status}`)
}

// ── 6. Stripe key format sanity ──────────────────────────────────────────────
console.log('\nChecking Stripe keys…')
{
  const sk = process.env.STRIPE_SECRET_KEY ?? ''
  if (sk.startsWith('sk_')) pass('STRIPE_SECRET_KEY format')
  else fail('STRIPE_SECRET_KEY', 'does not start with sk_')

  const pk = process.env.NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
  if (pk.startsWith('pk_')) pass('NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY format')
  else fail('NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'does not start with pk_')
}

// ── Result ───────────────────────────────────────────────────────────────────
if (failed) {
  console.error('\nPre-deploy check FAILED — fix the above before deploying.\n')
  process.exit(1)
} else {
  console.log('\nAll pre-deploy checks passed.\n')
}
