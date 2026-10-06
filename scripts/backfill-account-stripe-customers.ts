/**
 * Gives every Better Auth user without a Stripe customer the customer Better
 * Auth's Stripe plugin creates at sign-up (`createCustomerOnSignUp`): same
 * email, name and plugin metadata, recorded in the plugin's
 * `user.stripeCustomerId`. Users created before the plugin owned this, or whose
 * sign-up creation the plugin logged as failed, are the ones it finds. A second
 * run over unchanged state creates nothing.
 *
 *   STRIPE_SECRET_KEY=<key for that environment> \
 *     corepack yarn stripe:account-customers --env staging
 *
 * `--env` is `staging` or `production`; the database is that environment's `DB`
 * binding in wrangler.toml. A test key is refused for production and a live key
 * for staging. Exits non-zero when any user is left without a customer.
 */
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { unstable_readConfig } from 'wrangler'
import { createStripeClient } from '../server/utils/stripe-client.ts'

const { values } = parseArgs({ options: { env: { type: 'string' } }, strict: true })
if (values.env !== 'staging' && values.env !== 'production') throw new Error('Pass --env staging or --env production.')
const key = process.env.STRIPE_SECRET_KEY
if (!key) throw new Error('STRIPE_SECRET_KEY is required.')
if (/^(sk|rk)_live_/u.test(key) !== (values.env === 'production')) throw new Error(`The Stripe key's mode does not match ${values.env}.`)

const config = unstable_readConfig({ config: 'wrangler.toml', env: values.env === 'production' ? undefined : values.env }, { hideWarnings: true })
const database = config.d1_databases.find((binding: { binding: string }) => binding.binding === 'DB')?.database_name
if (!database) throw new Error(`wrangler.toml has no DB database for ${values.env}.`)

function d1<T>(sql: string): { results: T[]; meta: { changes: number } } {
  const output = execFileSync('corepack', ['yarn', 'wrangler', 'd1', 'execute', database!, '--remote', '--json', '--command', sql], { encoding: 'utf8' })
  return JSON.parse(output.slice(output.search(/^\[/mu)))[0]
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

const stripe = createStripeClient(key)
const users = d1<{ id: string; email: string; name: string | null }>('SELECT id, email, name FROM user WHERE "stripeCustomerId" IS NULL ORDER BY id').results
let created = 0
for (const user of users) {
  const customer = await stripe.customers.create({ email: user.email, name: user.name ?? undefined, metadata: { userId: user.id, customerType: 'user' } }, { idempotencyKey: `account-customer:${user.id}` })
  const recorded = d1(`UPDATE user SET "stripeCustomerId" = ${quote(customer.id)} WHERE id = ${quote(user.id)} AND "stripeCustomerId" IS NULL`).meta.changes
  // The plugin recorded one first: this run's customer is not the account's.
  if (recorded !== 1) await stripe.customers.del(customer.id)
  else created += 1
}
const missing = d1<{ n: number }>('SELECT COUNT(*) AS n FROM user WHERE "stripeCustomerId" IS NULL').results[0]!.n
console.log(`${database}: ${users.length} users without a customer, ${created} created, ${missing} still without`)
process.exitCode = missing ? 1 : 0
