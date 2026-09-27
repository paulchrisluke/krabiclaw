/**
 * Brings the Resend Product News Segment and Topic into line with every Better
 * Auth user in an environment's D1, then removes Segment members who are not
 * an eligible user there. It runs the same reconciliation the article
 * broadcast runs before every send, so it is safe to repeat: a second run
 * over unchanged state reports zero changes.
 *
 * It must complete with no failures before the first native Product News
 * Broadcast is sent.
 *
 *   RESEND_PRODUCT_NEWS_SEGMENT_ID=<segment> RESEND_PRODUCT_NEWS_TOPIC_ID=<topic> \
 *     node --env-file-if-exists=.env --experimental-strip-types \
 *       --import ./tests/unit/support/register-aliases.mjs \
 *       scripts/sync-resend-product-news.ts --production
 *
 * The database is the environment's `DB` binding in wrangler.toml, reached
 * through Wrangler's remote proxy, so the reconciliation reads and writes the
 * real D1 through the application's own code. RESEND_API_KEY and the two IDs
 * are read from the process environment: Cloudflare secrets cannot be read
 * back. An environment whose EMAIL_DELIVERY_MODE is not `provider` is
 * refused — staging and local share the one Resend account but do not mail.
 *
 * Exits non-zero if any Resend operation failed.
 */
import { parseArgs } from 'node:util'
import { Miniflare } from 'miniflare'
import { startRemoteProxySession, unstable_readConfig } from 'wrangler'
import { reconcileProductNewsContacts } from '../server/domain/product-news-contacts.ts'
import { getEmailDeliveryMode } from '../server/utils/email-delivery.ts'

// Production is the only environment that delivers email, so it is the only
// target; the flag is required so the run is never an accident.
const { values } = parseArgs({ options: { production: { type: 'boolean', default: false } }, strict: true })
if (!values.production) throw new Error('Pass --production: Product News Contacts are synced only for production.')
const target = 'production'

const config = unstable_readConfig({ config: 'wrangler.toml' }, { hideWarnings: true })
const database = config.d1_databases.find((binding: { binding: string }) => binding.binding === 'DB')
if (!database?.database_id) throw new Error(`wrangler.toml has no DB database_id for ${target}`)
const deliveryMode = typeof config.vars.EMAIL_DELIVERY_MODE === 'string' ? config.vars.EMAIL_DELIVERY_MODE : undefined
if (getEmailDeliveryMode({ EMAIL_DELIVERY_MODE: deliveryMode }) !== 'provider') {
  throw new Error(`${target} has EMAIL_DELIVERY_MODE=${deliveryMode ?? '(unset)'}; Product News Contacts are synced only for the environment that delivers email.`)
}

const env = {
  EMAIL_DELIVERY_MODE: deliveryMode,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_PRODUCT_NEWS_SEGMENT_ID: process.env.RESEND_PRODUCT_NEWS_SEGMENT_ID,
  RESEND_PRODUCT_NEWS_TOPIC_ID: process.env.RESEND_PRODUCT_NEWS_TOPIC_ID,
}

const session = await startRemoteProxySession({ DB: { type: 'd1', database_id: database.database_id } })
const runtime = new Miniflare({ workers: [{
  dev: { remoteProxyConnectionString: session.remoteProxyConnectionString },
  config: {
    name: 'sync-resend-product-news', type: 'worker', compatibilityDate: config.compatibility_date ?? '2024-11-01',
    manifest: { mainModule: 'index.mjs', modules: { 'index.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
    env: { DB: { type: 'd1', id: database.database_id, dev: { remote: true } } },
  },
}] })

try {
  const db = await runtime.getD1Database('DB')
  const result = await reconcileProductNewsContacts(db, env)
  console.log(`Product News sync against ${target} (${database.database_name}): ${result.users} users`)
  for (const [name, count] of Object.entries(result.counts)) console.log(`  ${name}: ${count}`)
  console.log(`  failed: ${result.failures.length}`)
  for (const failure of result.failures) console.error(`  ${failure.target}: ${failure.error}`)
  process.exitCode = result.failures.length > 0 ? 1 : 0
} finally {
  await runtime.dispose()
  await session.dispose()
}
