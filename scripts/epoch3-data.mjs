import { createHash } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'

const repoRoot = resolve(import.meta.dirname, '..')
const baselineSql = readFileSync(resolve(repoRoot, 'migrations/0000_epoch_3_baseline.sql'), 'utf8')
const PLATFORM_ORGANIZATION_ID = 'platform'
const PLATFORM_SITE_ID = 'platform'
const DELETION_CENSUS = ['client_import_artifacts', 'customer_claims', 'google_place_snapshots', 'platform_analytics']
const CUSTOM_TABLES = new Set([
  'blog_posts', 'experiences', 'organization_billing', 'organization_events', 'platform_locale_catalogs',
  'onboarding_drafts', 'platform_locale_messages', 'prices', 'products', 'resource_localizations', 'site_language_licenses',
  'site_pageview_events', 'site_redirects',
  'usage_events', 'usage_quota_grants',
])
const BETTER_AUTH_TABLES = [
  'account', 'invitation', 'jwks', 'member', 'oauthAccessToken', 'oauthClient', 'oauthClientAssertion',
  'oauthClientResource', 'oauthConsent', 'oauthRefreshToken', 'oauthResource', 'organization', 'session',
  'subscription', 'team', 'teamMember', 'user', 'verification',
]
const RESOURCE_TYPES = new Set(['site', 'business_location', 'product', 'experience', 'offering', 'site_post', 'tenant_blog_post', 'location_qa', 'media_asset', 'booking_policy', 'site_link_page', 'site_link_item', 'tenant_compliance', 'site_consultation_settings'])
const CONTENT_OWNER_TYPES = new Set(['platform_blog', 'platform_doc', 'tenant_blog', 'tenant_page'])
const CONTENT_BLOCK_TYPES = new Set(['heading', 'markdown', 'image', 'gallery', 'faq', 'how_to', 'divider', 'ai_assistance', 'cta', 'callout', 'hero', 'button_group', 'feature_grid', 'testimonial_grid', 'contact_cta', 'booking_cta', 'donation_choices', 'offering_grid', 'location_grid'])
const FRACTION_DIGITS = { THB: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, AUD: 2, CAD: 2, SGD: 2, HKD: 2, MYR: 2, IDR: 2, PHP: 2, VND: 0, INR: 2 }

function usage() {
  throw new Error('Usage: node scripts/epoch3-data.mjs transform <epoch2.sqlite|export.sql> <epoch3.sqlite> | verify <epoch2.sqlite> <epoch3.sqlite>')
}

function qi(value) { return `"${String(value).replaceAll('"', '""')}"` }
function tableExists(db, table) { return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table)) }
function columns(db, table) { return db.prepare(`PRAGMA table_info(${qi(table)})`).all() }
function count(db, table) { return db.prepare(`SELECT count(*) count FROM ${qi(table)}`).get().count }
function rows(db, table) { return db.prepare(`SELECT * FROM ${qi(table)}`).all() }
function iso(value) {
  if (value === null || value === undefined || value === '') return null
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp: ${value}`)
  return date.toISOString()
}
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
}
function logicalRows(db, table) {
  const names = columns(db, table).map(column => column.name)
  return db.prepare(`SELECT ${names.map(qi).join(',')} FROM ${qi(table)}`).all()
    .map(row => stable(row)).sort()
}
function logicalRowsForColumns(db, table, names, where = '', parameters = []) {
  return db.prepare(`SELECT ${names.map(qi).join(',')} FROM ${qi(table)} ${where}`).all(...parameters)
    .map(row => stable(row)).sort()
}
function hashLogicalRows(db, table, names = columns(db, table).map(column => column.name), where = '', parameters = []) {
  return createHash('sha256').update(logicalRowsForColumns(db, table, names, where, parameters).join('\n')).digest('hex')
}
function assert(condition, message) { if (!condition) throw new Error(message) }

function openEpoch2(input) {
  const path = resolve(input)
  if (!path.endsWith('.sql')) return new Database(path, { readonly: true, fileMustExist: true })
  const db = new Database(':memory:')
  db.exec(readFileSync(path, 'utf8'))
  return db
}

function insertRows(db, table, values) {
  if (!values.length) return
  const names = Object.keys(values[0])
  const statement = db.prepare(`INSERT INTO ${qi(table)} (${names.map(qi).join(',')}) VALUES (${names.map(() => '?').join(',')})`)
  for (const row of values) statement.run(names.map(name => row[name]))
}

function copyCompatible(source, target, table) {
  const sourceNames = new Set(columns(source, table).map(column => column.name))
  const destinationColumns = columns(target, table)
  const names = destinationColumns.filter(column => sourceNames.has(column.name)).map(column => column.name)
  for (const column of destinationColumns) {
    if (!names.includes(column.name) && column.notnull && column.dflt_value === null && column.pk === 0) {
      throw new Error(`${table}.${column.name} requires an epoch-3 transformation`)
    }
  }
  const selected = source.prepare(`SELECT ${names.map(qi).join(',')} FROM ${qi(table)}`).all()
  insertRows(target, table, selected)
}

function majorToMinor(value, currency, label) {
  const digits = FRACTION_DIGITS[currency]
  if (digits === undefined) throw new Error(`${label}: unsupported currency ${currency}`)
  const text = String(value)
  const pattern = digits === 0 ? /^(?:0|[1-9]\d*)$/ : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/
  if (!pattern.test(text)) throw new Error(`${label}: invalid ${currency} precision: ${text}`)
  const [whole, fraction = ''] = text.split('.')
  const result = Number(whole) * (10 ** digits) + Number(fraction.padEnd(digits, '0') || 0)
  if (!Number.isSafeInteger(result)) throw new Error(`${label}: amount exceeds safe integer range`)
  return result
}

function experienceUnit(priceText, hasAmount, id) {
  if (!hasAmount) return null
  const normalized = String(priceText ?? '').toLowerCase()
  if (/per table|\/ table/.test(normalized)) return 'table'
  if (/per guest|\/ guest|per person|\/ person/.test(normalized)) return 'person'
  if (/^[฿$€£₹\s\d,.]+$/.test(normalized) || /^(thb|usd|eur|gbp|jpy|aud|cad|sgd|hkd|myr|idr|php|vnd|inr)\s*[\d,.]+$/.test(normalized)) return 'item'
  throw new Error(`Experience ${id} has unmapped pricing text: ${priceText}`)
}

function accessExpiry(row) {
  if (row.plan === 'free') return null
  if (row.status === 'trialing') return iso(row.current_period_end)
  if (row.status === 'active' && row.payment_status === 'paid') return iso(row.paid_through)
  if (row.status === 'past_due') {
    const anchor = row.paid_through ?? row.past_due_since
    return anchor ? new Date(new Date(anchor).getTime() + 7 * 86400000).toISOString() : null
  }
  return iso(row.paid_through)
}

function weekBounds(key, fallback) {
  const date = key ? new Date(`${key}T00:00:00.000Z`) : new Date(fallback)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  const end = new Date(date); end.setUTCDate(end.getUTCDate() + 7)
  return { key: date.toISOString().slice(0, 10), start: date.toISOString(), end: end.toISOString() }
}

function validateRegistries(source) {
  const checks = [
    ['resource_localizations', 'resource_type', RESOURCE_TYPES],
    ['content_documents', 'owner_type', CONTENT_OWNER_TYPES],
    ['content_blocks', 'type', CONTENT_BLOCK_TYPES],
  ]
  for (const [table, column, registry] of checks) {
    if (!tableExists(source, table)) continue
    const values = source.prepare(`SELECT DISTINCT ${qi(column)} value FROM ${qi(table)}`).all().map(row => row.value)
    const unknown = values.filter(value => !registry.has(value))
    if (unknown.length) throw new Error(`${table}.${column} contains unknown values: ${unknown.join(', ')}`)
  }
}

function validateIsoTimestamps(target) {
  const timestampColumns = {
    platform_locale_catalogs: ['available_at', 'created_at', 'updated_at'],
    platform_locale_messages: ['updated_at'],
    resource_localizations: ['created_at', 'updated_at'],
    site_language_licenses: ['activated_at', 'disabled_at', 'created_at', 'updated_at'],
  }
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
  for (const [table, names] of Object.entries(timestampColumns)) {
    for (const name of names) {
      const invalid = target.prepare(`SELECT rowid row_key, ${qi(name)} value FROM ${qi(table)} WHERE ${qi(name)} IS NOT NULL`).all()
        .find(row => typeof row.value !== 'string' || !isoPattern.test(row.value))
      if (invalid) throw new Error(`${table}.${name} is not canonical ISO text at row ${invalid.row_key}: ${invalid.value}`)
    }
  }
}

function assertCopiedTableParity(source, target) {
  const checked = []
  const destinationTables = target.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name)
  for (const table of destinationTables) {
    if (CUSTOM_TABLES.has(table) || !tableExists(source, table)) continue
    const sourceNames = new Set(columns(source, table).map(column => column.name))
    const commonNames = columns(target, table).map(column => column.name).filter(name => sourceNames.has(name))
    assert(count(source, table) === count(target, table), `${table} row-count mismatch`)
    assert(hashLogicalRows(source, table, commonNames) === hashLogicalRows(target, table, commonNames), `${table} logical hash mismatch`)
    checked.push(table)
  }
  return checked
}

function assertCutoverParity(source, target) {
  const copiedTables = assertCopiedTableParity(source, target)

  for (const table of ['canary_runs', 'notification_deliveries', 'notification_reads']) {
    assert(count(source, table) === count(target, table), `${table} row-count mismatch`)
    assert(hashLogicalRows(source, table) === hashLogicalRows(target, table), `${table} logical hash mismatch`)
  }

  const sourceSiteViews = count(source, 'site_pageview_events')
  const sourcePlatformViews = count(source, 'platform_pageview_events')
  assert(count(target, 'site_pageview_events') === sourceSiteViews + sourcePlatformViews, 'Pageview count mismatch')
  const platformColumns = columns(source, 'platform_pageview_events').map(column => column.name)
  assert(
    hashLogicalRows(source, 'platform_pageview_events', platformColumns)
      === hashLogicalRows(target, 'site_pageview_events', platformColumns, 'WHERE site_id = ? AND page_type = ?', [PLATFORM_SITE_ID, 'platform']),
    'Platform pageview logical hash mismatch',
  )
  const sourceDuration = source.prepare(`
    SELECT COALESCE((SELECT SUM(duration_seconds) FROM site_pageview_events), 0)
         + COALESCE((SELECT SUM(duration_seconds) FROM platform_pageview_events), 0) total
  `).get().total
  const targetDuration = target.prepare('SELECT COALESCE(SUM(duration_seconds), 0) total FROM site_pageview_events').get().total
  assert(sourceDuration === targetDuration, `Pageview duration mismatch: ${sourceDuration} != ${targetDuration}`)

  const platformBlogs = source.prepare('SELECT count(*) count FROM blog_posts WHERE site_id IS NULL').get().count
  const scopedPlatformBlogs = target.prepare('SELECT count(*) count FROM blog_posts WHERE organization_id=? AND site_id=?').get(PLATFORM_ORGANIZATION_ID, PLATFORM_SITE_ID).count
  assert(platformBlogs === scopedPlatformBlogs, 'Platform blog scope mismatch')
  assert(target.prepare('SELECT count(*) count FROM blog_posts WHERE organization_id IS NULL OR site_id IS NULL').get().count === 0, 'Blog scope contains null values')
  const platformRedirects = tableExists(source, 'platform_blog_redirects') ? count(source, 'platform_blog_redirects') : 0
  const scopedRedirects = target.prepare("SELECT count(*) count FROM site_redirects WHERE site_id=? AND source='epoch3-cutover'").get(PLATFORM_SITE_ID).count
  assert(platformRedirects === scopedRedirects, 'Platform blog redirect count mismatch')

  if (tableExists(source, 'site_events')) assert(count(source, 'site_events') === count(target, 'organization_events'), 'Organization event count mismatch')

  for (const row of rows(source, 'organization_billing')) {
    const projected = target.prepare('SELECT access_plan, access_expires_at FROM organization_billing WHERE organization_id=?').get(row.organization_id)
    assert(projected?.access_plan === (row.plan ?? 'free'), `Billing access plan mismatch for ${row.organization_id}`)
    assert(projected?.access_expires_at === accessExpiry(row), `Billing access expiry mismatch for ${row.organization_id}`)
  }

  if (tableExists(source, 'ai_credits')) {
    for (const credit of rows(source, 'ai_credits')) {
      const grant = target.prepare("SELECT quantity FROM usage_quota_grants WHERE idempotency_key=? AND grant_type='reset'").get(`epoch3-ai-reset:${credit.organization_id}`)
      assert(grant?.quantity === credit.balance, `AI quota balance mismatch for ${credit.organization_id}`)
    }
  }

  validateIsoTimestamps(target)
  return copiedTables
}

function buildManifest(source, target, copiedTables) {
  const preserved = [...new Set([...BETTER_AUTH_TABLES, ...copiedTables, 'canary_runs', 'notification_deliveries', 'notification_reads'])].sort()
  return {
    format: 1,
    source: {
      tables: source.prepare("SELECT count(*) count FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count,
      pageviews: count(source, 'site_pageview_events') + count(source, 'platform_pageview_events'),
      hashes: Object.fromEntries(preserved.filter(table => tableExists(source, table)).map(table => [table, hashLogicalRows(source, table)])),
    },
    target: {
      tables: target.prepare("SELECT count(*) count FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count,
      pageviews: count(target, 'site_pageview_events'),
      hashes: Object.fromEntries(preserved.filter(table => tableExists(target, table)).map(table => [table, hashLogicalRows(target, table)])),
    },
  }
}

function transform(source, target) {
  target.exec(baselineSql)
  for (const table of DELETION_CENSUS) {
    if (tableExists(source, table) && count(source, table) !== 0) throw new Error(`Deletion census failed: ${table} is non-empty`)
  }
  validateRegistries(source)

  const destinationTables = target.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name)
  for (const table of destinationTables) {
    if (CUSTOM_TABLES.has(table) || !tableExists(source, table)) continue
    copyCompatible(source, target, table)
  }

  copyCompatible(source, target, 'products')
  const sites = new Map(rows(source, 'sites').map(row => [row.id, row]))
  if (tableExists(source, 'onboarding_drafts')) {
    insertRows(target, 'onboarding_drafts', rows(source, 'onboarding_drafts').map(row => {
      const payload = JSON.parse(row.payload_json)
      if (payload.version !== 1 || !Array.isArray(payload.preview?.products)) {
        throw new Error(`Onboarding draft ${row.id} has an unsupported payload contract`)
      }
      const currency = payload.source?.details?.currency
      payload.preview.products = payload.preview.products.map(product => {
        const price = {
          amount_minor: majorToMinor(product.price_amount, currency, `Onboarding draft ${row.id} Product ${product.id}`),
          currency, unit: 'item', tax_behavior: 'unspecified',
          compare_at_amount_minor: product.compare_at_price_amount == null
            ? null
            : majorToMinor(product.compare_at_price_amount, currency, `Onboarding draft ${row.id} Product ${product.id} compare-at`),
          valid_from: product.sale_starts_at ? `${product.sale_starts_at}T00:00:00.000Z` : undefined,
          valid_until: product.sale_ends_at ? `${product.sale_ends_at}T23:59:59.999Z` : null,
          provenance: 'onboarding-import',
        }
        const canonicalProduct = { ...product }
        delete canonicalProduct.price_amount
        delete canonicalProduct.compare_at_price_amount
        delete canonicalProduct.sale_starts_at
        delete canonicalProduct.sale_ends_at
        return { ...canonicalProduct, price }
      })
      payload.version = 2
      return { ...row, payload_json: JSON.stringify(payload) }
    }))
  }
  const products = rows(source, 'products')
  const experiences = rows(source, 'experiences')
  const productIds = new Set(products.map(row => row.id))
  const slugs = new Set(products.map(row => `${row.site_id}\0${row.location_id}\0${row.slug}`))
  const experienceProducts = []
  const experienceSortOrder = new Map()
  for (const experience of [...experiences].sort((left, right) =>
    left.site_id.localeCompare(right.site_id)
    || left.location_id.localeCompare(right.location_id)
    || left.sort_order - right.sort_order
    || String(left.created_at).localeCompare(String(right.created_at))
    || left.id.localeCompare(right.id))) {
    if (productIds.has(experience.id)) throw new Error(`Product/Experience ID collision: ${experience.id}`)
    const slugKey = `${experience.site_id}\0${experience.location_id}\0${experience.slug}`
    if (slugs.has(slugKey)) throw new Error(`Product/Experience slug collision: ${experience.slug}`)
    slugs.add(slugKey)
    const orderKey = `${experience.site_id}\0${experience.location_id}`
    const normalizedSortOrder = experienceSortOrder.get(orderKey) ?? 0
    experienceSortOrder.set(orderKey, normalizedSortOrder + 1)
    experienceProducts.push({
      id: experience.id, organization_id: experience.organization_id, site_id: experience.site_id, location_id: experience.location_id,
      product_type: 'experience', category: 'Experiences', name: experience.title, slug: experience.slug,
      description: experience.body ?? '', order_url: null, is_visible: experience.status === 'inactive' ? 0 : 1,
      available: experience.status === 'sold_out' ? 0 : 1, featured: experience.featured ?? 0,
      featured_sort_order: experience.featured_sort_order ?? 0, sort_order: normalizedSortOrder,
      tags_json: '[]', details_json: '[]', seo_title: experience.seo_title, seo_description: experience.seo_description,
      canonical_url: experience.canonical_url, robots: experience.robots, source: experience.source ?? 'manual',
      created_at: experience.created_at, updated_at: experience.updated_at,
      created_by: experience.created_by ?? 'epoch3-cutover', updated_by: experience.created_by ?? 'epoch3-cutover',
    })
  }
  insertRows(target, 'products', experienceProducts)

  const experienceColumns = columns(target, 'experiences').map(column => column.name)
  insertRows(target, 'experiences', experiences.map(row => Object.fromEntries(experienceColumns.map(name => [name,
    name === 'pricing_note' ? (row.price_amount == null ? String(row.price ?? '').trim() || null : null) : row[name],
  ]))))

  const priceRows = []
  for (const product of products) {
    const currency = sites.get(product.site_id)?.default_currency
    priceRows.push({
      id: `epoch3-product-${product.id}`, organization_id: product.organization_id, site_id: product.site_id,
      location_id: product.location_id, product_id: product.id,
      amount_minor: majorToMinor(product.price_amount, currency, `Product ${product.id}`), currency, unit: 'item', tax_behavior: 'unspecified',
      compare_at_amount_minor: product.compare_at_price_amount == null ? null : majorToMinor(product.compare_at_price_amount, currency, `Product ${product.id} compare-at`),
      valid_from: product.sale_starts_at ? `${product.sale_starts_at}T00:00:00.000Z` : product.created_at,
      valid_until: product.sale_ends_at ? `${product.sale_ends_at}T23:59:59.999Z` : null,
      provenance: 'epoch2-product', created_by: product.created_by, created_at: product.created_at,
    })
  }
  for (const experience of experiences) {
    if (experience.price_amount == null) continue
    const currency = sites.get(experience.site_id)?.default_currency
    priceRows.push({
      id: `epoch3-experience-${experience.id}`, organization_id: experience.organization_id, site_id: experience.site_id,
      location_id: experience.location_id, product_id: experience.id,
      amount_minor: majorToMinor(String(experience.price_amount), currency, `Experience ${experience.id}`), currency,
      unit: experienceUnit(experience.price, true, experience.id), tax_behavior: 'unspecified',
      compare_at_amount_minor: experience.compare_at_price_amount == null ? null : majorToMinor(String(experience.compare_at_price_amount), currency, `Experience ${experience.id} compare-at`),
      valid_from: experience.sale_starts_at ? `${experience.sale_starts_at}T00:00:00.000Z` : experience.created_at,
      valid_until: experience.sale_ends_at ? `${experience.sale_ends_at}T23:59:59.999Z` : null,
      provenance: 'epoch2-experience', created_by: experience.created_by ?? 'epoch3-cutover', created_at: experience.created_at,
    })
  }
  insertRows(target, 'prices', priceRows)

  insertRows(target, 'blog_posts', rows(source, 'blog_posts').map(row => ({ ...row,
    organization_id: row.organization_id ?? PLATFORM_ORGANIZATION_ID, site_id: row.site_id ?? PLATFORM_SITE_ID,
  })))
  copyCompatible(source, target, 'site_redirects')
  if (tableExists(source, 'platform_blog_redirects')) {
    const redirects = source.prepare(`SELECT r.*, p.organization_id, p.category, p.slug FROM platform_blog_redirects r JOIN blog_posts p ON p.id = r.post_id`).all()
    insertRows(target, 'site_redirects', redirects.map(row => ({
      id: row.id, organization_id: row.organization_id ?? PLATFORM_ORGANIZATION_ID, site_id: PLATFORM_SITE_ID, locale: 'en',
      owner_type: 'platform_blog_post', owner_id: row.post_id, from_path: `/blog/${String(row.category ?? 'uncategorized').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${row.old_slug}`,
      to_path: `/blog/${String(row.category ?? 'uncategorized').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${row.slug}`,
      status_code: 301, behavior: 'redirect', reason: 'epoch2_platform_blog_slug_change', source: 'epoch3-cutover',
      created_at: row.created_at, updated_at: row.created_at,
    })))
  }

  copyCompatible(source, target, 'site_pageview_events')
  if (tableExists(source, 'platform_pageview_events')) {
    insertRows(target, 'site_pageview_events', rows(source, 'platform_pageview_events').map(row => ({ ...row, site_id: PLATFORM_SITE_ID,
      location_id: null, page_id: null, page_type: 'platform', recipe: null, locale: null, revision_id: null,
    })))
  }
  if (tableExists(source, 'site_events')) insertRows(target, 'organization_events', rows(source, 'site_events'))

  insertRows(target, 'organization_billing', rows(source, 'organization_billing').map(row => ({
    organization_id: row.organization_id, stripe_customer_id: row.stripe_customer_id, stripe_subscription_id: row.stripe_subscription_id,
    payment_status: row.payment_status ?? 'unknown', paid_through: row.paid_through, past_due_since: row.past_due_since,
    last_paid_invoice_id: row.last_paid_invoice_id, last_payment_event_created: row.last_payment_event_created,
    last_payment_event_id: row.last_payment_event_id, access_plan: row.plan ?? 'free', access_expires_at: accessExpiry(row), updated_at: row.updated_at,
  })))

  const timestampTables = ['platform_locale_catalogs', 'platform_locale_messages', 'resource_localizations', 'site_language_licenses']
  for (const table of timestampTables) {
    const destinationNames = columns(target, table).map(column => column.name)
    insertRows(target, table, rows(source, table).map(row => Object.fromEntries(destinationNames.map(name => [name,
      ['available_at', 'activated_at', 'disabled_at', 'created_at', 'updated_at'].includes(name) ? iso(row[name]) : row[name],
    ]))))
  }

  if (tableExists(source, 'ai_usage_log')) {
    insertRows(target, 'usage_events', rows(source, 'ai_usage_log').map(row => ({
      id: `epoch3-ai-${row.id}`, organization_id: row.organization_id, site_id: row.site_id, resource: 'ai_inference',
      source: row.action, provider: row.model, channel: null, session_id: null, quantity: row.credits_charged, unit: 'credit',
      metadata_json: JSON.stringify({ action: row.action, input_tokens: row.input_tokens, output_tokens: row.output_tokens, cf_gateway_log_id: row.cf_gateway_log_id, charged: row.credits_charged > 0 }),
      idempotency_key: `epoch2-ai-log:${row.id}`, created_at: row.created_at,
    })))
  }
  if (tableExists(source, 'ai_credits')) {
    const charged = new Map(rows(source, 'ai_usage_log').map(row => row.organization_id).map(orgId => [orgId,
      source.prepare('SELECT COALESCE(SUM(credits_charged),0) total FROM ai_usage_log WHERE organization_id=?').get(orgId).total,
    ]))
    for (const credit of rows(source, 'ai_credits')) {
      const attributable = charged.get(credit.organization_id) ?? 0
      if (credit.lifetime_used < attributable) throw new Error(`AI lifetime mismatch for ${credit.organization_id}`)
      const residual = credit.lifetime_used - attributable
      const resetAt = iso(credit.updated_at)
      if (residual > 0) insertRows(target, 'usage_events', [{
        id: `epoch3-ai-residual-${credit.organization_id}`, organization_id: credit.organization_id, site_id: null,
        resource: 'ai_inference', source: 'epoch2_residual', provider: null, channel: null, session_id: null,
        quantity: residual, unit: 'credit', metadata_json: JSON.stringify({ action: 'legacy_unattributed', charged: true }),
        idempotency_key: `epoch2-ai-residual:${credit.organization_id}`, created_at: new Date(new Date(resetAt).getTime() - 1).toISOString(),
      }])
      const period = weekBounds(credit.balance_period_key, resetAt)
      insertRows(target, 'usage_quota_grants', [{
        id: `epoch3-ai-reset-${credit.organization_id}`, organization_id: credit.organization_id, resource: 'ai_inference',
        quantity: credit.balance, unit: 'credit', period_key: `week:${period.key}`, period_start: period.start, period_end: period.end,
        grant_type: 'reset', reason: 'Epoch 3 legacy balance preservation', created_by: null,
        idempotency_key: `epoch3-ai-reset:${credit.organization_id}`, applied_at: resetAt, created_at: resetAt,
      }])
    }
  }

  const fk = target.pragma('foreign_key_check')
  if (fk.length) throw new Error(`Epoch-3 foreign-key check failed: ${stable(fk.slice(0, 20))}`)
  assert(count(target, 'products') === products.length + experiences.length, 'Product/Experience count mismatch')
  assert(count(target, 'prices') === priceRows.length, 'Price count mismatch')
  for (const table of BETTER_AUTH_TABLES) assert(stable(logicalRows(source, table)) === stable(logicalRows(target, table)), `Better Auth table changed: ${table}`)
  const copiedTables = assertCutoverParity(source, target)
  return { standardProducts: products.length, experienceProducts: experiences.length, prices: priceRows.length,
    inquiryExperiences: experiences.filter(row => row.price_amount == null).length, tables: destinationTables.length,
    manifest: buildManifest(source, target, copiedTables) }
}

function verify(source, target) {
  const fk = target.pragma('foreign_key_check')
  assert(fk.length === 0, `Epoch-3 foreign-key check failed: ${stable(fk)}`)
  for (const table of BETTER_AUTH_TABLES) assert(stable(logicalRows(source, table)) === stable(logicalRows(target, table)), `Better Auth table changed: ${table}`)
  const legacyUsage = source.prepare('SELECT COALESCE(SUM(lifetime_used),0) total FROM ai_credits').get().total
  const canonicalUsage = target.prepare("SELECT COALESCE(SUM(quantity),0) total FROM usage_events WHERE resource='ai_inference'").get().total
  assert(legacyUsage === canonicalUsage, `AI lifetime mismatch: ${legacyUsage} != ${canonicalUsage}`)
  const copiedTables = assertCutoverParity(source, target)
  return { foreignKeyFailures: 0, betterAuthTables: BETTER_AUTH_TABLES.length, aiLifetimeUsage: canonicalUsage,
    manifest: buildManifest(source, target, copiedTables) }
}

const [, , command, inputArg, outputArg] = process.argv
if (!command || !inputArg || !outputArg) usage()
const source = openEpoch2(inputArg)
try {
  if (command === 'transform') {
    const output = resolve(outputArg)
    const manifestPath = `${output}.manifest.json`
    if (existsSync(output) || existsSync(manifestPath)) throw new Error(`Refusing to overwrite ${existsSync(output) ? output : manifestPath}`)
    const target = new Database(output)
    try {
      target.pragma('foreign_keys = OFF')
      const report = target.transaction(() => transform(source, target))()
      target.pragma('foreign_keys = ON')
      writeFileSync(manifestPath, `${JSON.stringify(report.manifest, null, 2)}\n`)
      const { manifest: _manifest, ...summary } = report
      console.log(JSON.stringify({ output, manifest: manifestPath, ...summary, result: 'ok' }))
    } catch (error) {
      target.close()
      if (existsSync(output)) unlinkSync(output)
      if (existsSync(manifestPath)) unlinkSync(manifestPath)
      throw error
    }
    target.close()
  } else if (command === 'verify') {
    const target = new Database(resolve(outputArg), { readonly: true, fileMustExist: true })
    try {
      const report = verify(source, target)
      const { manifest, ...summary } = report
      console.log(JSON.stringify({ ...summary, manifest_sha256: createHash('sha256').update(stable(manifest)).digest('hex'), result: 'ok' }))
    } finally { target.close() }
  } else usage()
} finally { source.close() }
