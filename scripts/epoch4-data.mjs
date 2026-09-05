#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/epoch4-data.mjs transform /abs/epoch3.sqlite /abs/epoch4.sqlite
 *   node scripts/epoch4-data.mjs verify    /abs/epoch3.sqlite /abs/epoch4.sqlite
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { planCategories } from './product-category-plan.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const migrationsDirectory = resolve(repoRoot, 'migrations')
const baselineSql = readdirSync(migrationsDirectory)
  .filter(name => /^\d{4}_.+\.sql$/u.test(name))
  .sort()
  .map(name => ({ name, sql: readFileSync(join(migrationsDirectory, name), 'utf8') }))

const RESET_TABLES = new Set([
  'guest_thread_deliveries', 'guest_thread_entries', 'guest_threads',
  'notification_reads', 'notifications',
])

const DELETED_TABLES = new Set([
  'guest_thread_commands', 'guest_thread_member_state', 'guest_thread_outbox',
  'guest_thread_sequence_counters', 'notification_deliveries', 'notification_events',
  'platform_content',
])

const CONSOLIDATED_AVAILABILITY_TABLES = new Set([
  'experience_slot_overrides', 'reservation_slot_overrides',
])

/** Tables this transform rewrites rather than copies. */
const TRANSFORMED_TABLES = new Set([
  'products', 'product_categories', 'booking_policies', 'experiences', 'posts',
  'post_channel_jobs', 'availability_overrides', 'tenant_pages',
  ...CONSOLIDATED_AVAILABILITY_TABLES, ...RESET_TABLES,
])

function qi(value) { return `"${String(value).replaceAll('"', '""')}"` }
function tableExists(db, table) { return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table)) }
function columns(db, table) { return db.prepare(`PRAGMA table_info(${qi(table)})`).all() }
function count(db, table) { return db.prepare(`SELECT count(*) count FROM ${qi(table)}`).get().count }
function rows(db, table) { return db.prepare(`SELECT * FROM ${qi(table)}`).all() }
function assert(condition, message) { if (!condition) throw new Error(message) }

function tables(db) {
  return db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()
    .map(row => row.name).filter(name => name !== 'd1_migrations' && !name.startsWith('sqlite_') && !name.startsWith('_cf_'))
}

function openDatabase(path) {
  if (!path.endsWith('.sql')) return new Database(path, { readonly: true, fileMustExist: true })
  const db = new Database(':memory:')
  // D1 exports interleave child inserts and parent definitions.
  db.pragma('foreign_keys = OFF')
  db.exec(readFileSync(path, 'utf8'))
  return db
}

function hashRows(records, names) {
  // Sorted, typed JSON tuples avoid row-order sensitivity and delimiter/null
  // collisions. BLOBs retain their bytes through Buffer's JSON representation.
  const logical = records.map(record => JSON.stringify(names.map(name => record[name]))).sort()
  return createHash('sha256').update(logical.join('\n')).digest('hex')
}

function assertSchemaParity(source, target) {
  assert(tableExists(source, 'products') && columns(source, 'products').some(column => column.name === 'category'), 'Source must be Epoch 3 with products.category')
  assert(!tableExists(source, 'product_categories'), 'Source already contains product_categories')
  assert(count(source, 'platform_content') === 0, 'platform_content is populated; unmapped platform content cannot be discarded')
  const pageVariants = source.prepare(`
    SELECT p.id, v.id AS variant_id,
      p.title IS v.title AND p.summary IS v.summary
      AND p.seo_title IS v.seo_title AND p.seo_description IS v.seo_description
      AND p.canonical_url IS v.canonical_url AND p.robots IS v.robots AS matches
    FROM tenant_pages p
    LEFT JOIN site_locales l ON l.site_id = p.site_id AND l.organization_id = p.organization_id AND l.is_source = 1
    LEFT JOIN tenant_page_variants v ON v.page_id = p.id AND v.site_id = p.site_id AND v.organization_id = p.organization_id AND v.locale = l.locale
  `).all()
  assert(pageVariants.every(page => page.variant_id && page.matches === 1), 'tenant_pages has missing source variants or unmapped presentation fields')
  const sourceTables = tables(source)
  const expectedTargetTables = [
    ...sourceTables.filter(table => !DELETED_TABLES.has(table) && !CONSOLIDATED_AVAILABILITY_TABLES.has(table)),
    'availability_overrides', 'product_categories',
  ].sort()
  assert(JSON.stringify(expectedTargetTables) === JSON.stringify(tables(target)), 'Application table census changed outside the declared Epoch 4 correction')
  for (const table of sourceTables) {
    if (DELETED_TABLES.has(table) || TRANSFORMED_TABLES.has(table)) continue
    const before = columns(source, table).map(column => column.name).filter(name => table !== 'products' || name !== 'category').sort()
    const after = columns(target, table).map(column => column.name).filter(name => table !== 'products' || name !== 'category_id').sort()
    assert(JSON.stringify(before) === JSON.stringify(after), `${table}: unexpected source/destination columns`)
  }
  assert(columns(target, 'products').some(column => column.name === 'category_id'), 'Target must be Epoch 4 with products.category_id')
  assert(!columns(target, 'posts').some(column => column.name === 'google_post_id'), 'Target posts still contains google_post_id')
  assert(columns(target, 'post_channel_jobs').some(column => column.name === 'provider_post_id'), 'Target channel jobs lack provider_post_id')
  assert(!columns(target, 'guest_thread_entries').some(column => ['organization_id', 'site_id'].includes(column.name)), 'Target entries duplicate tenant ownership')
  assert(!columns(target, 'guest_thread_deliveries').some(column => ['thread_id', 'idempotency_key'].includes(column.name)), 'Target deliveries duplicate thread or idempotency identity')
  assert(!columns(target, 'notifications').some(column => ['guest_thread_id', 'event_type', 'actor_user_id', 'payload'].includes(column.name)), 'Target notifications retain overlapping fact fields')
  assert(tableExists(target, 'availability_overrides'), 'Target lacks canonical availability overrides')
  assert(!tableExists(target, 'experience_slot_overrides') && !tableExists(target, 'reservation_slot_overrides'), 'Target retains split availability override tables')
  // Category translations need an explicit, reviewed mapping; silently retaining
  // the retired Product field would create invalid canonical localization data.
  const legacyTranslations = source.prepare("SELECT count(*) count FROM resource_localizations WHERE resource_type = 'product' AND json_type(values_json, '$.category') IS NOT NULL").get().count
  assert(legacyTranslations === 0, `${legacyTranslations} legacy Product category translations require an explicit transformation`)
}

function tableParity(source, target) {
  return tables(source).filter(table => !DELETED_TABLES.has(table) && !TRANSFORMED_TABLES.has(table)).map((table) => {
    const names = columns(source, table).map(column => column.name)
      .filter(name => table !== 'products' || !['category', 'sort_order'].includes(name)).sort()
    const sourceRows = rows(source, table)
    const targetRows = rows(target, table)
    const sourceHash = hashRows(sourceRows, names)
    const targetHash = hashRows(targetRows, names)
    assert(sourceRows.length === targetRows.length && sourceHash === targetHash, `${table}: row count or content changed outside the category transformation`)
    return { table, columns: names, source_count: sourceRows.length, target_count: targetRows.length, source_hash: sourceHash, target_hash: targetHash }
  })
}

function insertRows(db, table, values) {
  if (!values.length) return
  const names = Object.keys(values[0])
  const statement = db.prepare(`INSERT INTO ${qi(table)} (${names.map(qi).join(',')}) VALUES (${names.map(() => '?').join(',')})`)
  const insertAll = db.transaction((records) => {
    for (const record of records) statement.run(names.map(name => record[name] ?? null))
  })
  insertAll(values)
}

function projectCommonRows(source, target, table) {
  const sourceNames = new Set(columns(source, table).map(column => column.name))
  const targetNames = columns(target, table).map(column => column.name)
  const projected = rows(source, table).map((row) => Object.fromEntries(
    targetNames.map(name => [name, sourceNames.has(name) ? row[name] : null]),
  ))
  insertRows(target, table, projected)
  return projected
}

function normalizedPosts(source, target) {
  const sourceNames = new Set(columns(source, 'posts').map(column => column.name))
  const targetNames = columns(target, 'posts').map(column => column.name)
  return rows(source, 'posts').map((post) => Object.fromEntries(targetNames.map((name) => {
    if (name === 'post_type' && post.post_type === 'offer' && !post.offer_coupon && !post.offer_terms) {
      return [name, 'standard']
    }
    return [name, sourceNames.has(name) ? post[name] : null]
  })))
}

function normalizedPostChannelJobs(source, target) {
  const targetNames = columns(target, 'post_channel_jobs').map(column => column.name)
  const sourceNames = new Set(columns(source, 'post_channel_jobs').map(column => column.name))
  const jobs = rows(source, 'post_channel_jobs').map(job => Object.fromEntries(
    targetNames.map(name => [name, sourceNames.has(name) ? job[name] : null]),
  ))
  const jobByPostChannel = new Map(jobs.map(job => [`${job.post_id}:${job.channel}`, job]))
  const postsById = new Map(rows(source, 'posts').map(post => [post.id, post]))

  for (const post of postsById.values()) {
    if (!post.google_post_id) continue
    const raw = String(post.google_post_id)
    const channel = raw.startsWith('ig-') ? 'instagram' : raw.startsWith('fb-') ? 'facebook' : 'google'
    const providerPostId = raw.replace(/^(?:ig|fb)-/u, '')
    const key = `${post.id}:${channel}`
    const existing = jobByPostChannel.get(key)
    if (existing) {
      existing.provider_post_id = providerPostId
      continue
    }
    const values = {
      id: `epoch4-${channel}-${post.id}`,
      post_id: post.id,
      organization_id: post.organization_id,
      channel,
      status: post.status === 'published' ? 'published' : 'pending',
      provider_post_id: providerPostId,
      error: null,
      published_at: post.published_at ?? null,
      created_at: post.created_at,
    }
    const job = Object.fromEntries(targetNames.map(name => [name, values[name] ?? null]))
    jobs.push(job)
    jobByPostChannel.set(key, job)
  }
  return jobs
}

function normalizedAvailabilityOverrides(source, target) {
  const targetNames = columns(target, 'availability_overrides').map(column => column.name)
  const records = []
  const ids = new Set()
  for (const [table, ownerType, ownerColumn] of [
    ['reservation_slot_overrides', 'location', 'location_id'],
    ['experience_slot_overrides', 'experience', 'experience_id'],
  ]) {
    for (const row of rows(source, table)) {
      assert(!ids.has(row.id), `Availability override id ${row.id} is duplicated across legacy tables`)
      ids.add(row.id)
      const values = {
        ...row,
        owner_type: ownerType,
        location_id: ownerType === 'location' ? row[ownerColumn] : null,
        experience_id: ownerType === 'experience' ? row[ownerColumn] : null,
      }
      records.push(Object.fromEntries(targetNames.map(name => [name, values[name] ?? null])))
    }
  }
  return records
}

/**
 * The rendered order a customer sees, as one flat list per location: category
 * name followed by its Products, in display order. Computed from each schema's
 * own rules so the verifier can prove the two agree.
 */
function renderedOrderBefore(db) {
  const products = db.prepare(`
    SELECT id, location_id, product_type, category, sort_order FROM products WHERE is_visible = 1
     ORDER BY location_id, product_type, sort_order, id
  `).all()
  // The public collection page groups by category in first-appearance order and
  // renders each group's Products in their existing order, so the comparison
  // has to interleave the same way rather than list categories then Products.
  const rendered = []
  const emitted = new Set()
  for (const product of products) {
    const scope = `${product.location_id}::${product.product_type}`
    const key = `${scope}::${product.category}`
    if (emitted.has(key)) continue
    emitted.add(key)
    rendered.push(`${scope}|category|${product.category}`)
    for (const member of products) {
      if (member.location_id !== product.location_id) continue
      if (member.product_type !== product.product_type) continue
      if (member.category !== product.category) continue
      rendered.push(`${scope}|product|${product.category}|${member.id}`)
    }
  }
  return rendered
}

function renderedOrderAfter(db) {
  const categories = db.prepare(`
    SELECT id, location_id, product_type, name FROM product_categories
     ORDER BY location_id, product_type, sort_order, id
  `).all()
  const products = db.prepare(`
    SELECT id, category_id FROM products WHERE is_visible = 1 ORDER BY sort_order, id
  `).all()
  const rendered = []
  for (const category of categories) {
    if (!products.some(product => product.category_id === category.id)) continue
    const scope = `${category.location_id}::${category.product_type}`
    rendered.push(`${scope}|category|${category.name}`)
    for (const product of products) {
      if (product.category_id !== category.id) continue
      rendered.push(`${scope}|product|${category.name}|${product.id}`)
    }
  }
  return rendered
}

function transformProducts(source, target, now) {
  const legacy = rows(source, 'products')
  const { categories, assignments } = planCategories(legacy)
  const categoryById = new Map(categories.map(category => [category.id, category]))
  const assignmentByProduct = new Map(assignments.map(assignment => [assignment.product_id, assignment]))

  insertRows(target, 'product_categories', categories.map(category => ({
    id: category.id,
    organization_id: category.organization_id,
    site_id: category.site_id,
    location_id: category.location_id,
    product_type: category.product_type,
    name: category.name,
    slug: category.slug,
    sort_order: category.sort_order,
    created_at: now,
    updated_at: now,
    created_by: 'migration:epoch4',
    updated_by: 'migration:epoch4',
  })))

  const destinationNames = columns(target, 'products').map(column => column.name)
  insertRows(target, 'products', legacy.map((product) => {
    const assignment = assignmentByProduct.get(product.id)
    assert(assignment, `Product ${product.id} was not assigned a category`)
    const category = categoryById.get(assignment.category_id)
    assert(category, `Product ${product.id} references an unplanned category`)
    assert(
      category.location_id === product.location_id && category.site_id === product.site_id,
      `Product ${product.id} was assigned a category from another location or site`,
    )
    const record = {}
    for (const name of destinationNames) {
      if (name === 'category_id') record[name] = assignment.category_id
      else if (name === 'sort_order') record[name] = assignment.sort_order
      else record[name] = product[name] ?? null
    }
    return record
  }))
}

function verifyDatabases(source, target) {
  assertSchemaParity(source, target)
  const parity = tableParity(source, target)
  for (const table of RESET_TABLES) assert(count(target, table) === 0, `${table}: historical messaging rows were backfilled`)
  const projections = ['booking_policies', 'experiences', 'tenant_pages'].map(table => {
    const names = columns(target, table).map(column => column.name)
    const projected = rows(source, table).map(row => Object.fromEntries(names.map(name => [name, row[name] ?? null])))
    assert(hashRows(projected, names) === hashRows(rows(target, table), names), `${table}: retained fields changed`)
    return { table, columns: names, source_count: projected.length, target_count: count(target, table), hash: hashRows(projected, names) }
  })
  const postNames = columns(target, 'posts').map(column => column.name)
  assert(hashRows(normalizedPosts(source, target), postNames) === hashRows(rows(target, 'posts'), postNames), 'posts: canonical projection changed')
  const jobNames = columns(target, 'post_channel_jobs').map(column => column.name)
  assert(hashRows(normalizedPostChannelJobs(source, target), jobNames) === hashRows(rows(target, 'post_channel_jobs'), jobNames), 'post_channel_jobs: provider identity projection changed')
  const availabilityNames = columns(target, 'availability_overrides').map(column => column.name)
  const normalizedAvailability = normalizedAvailabilityOverrides(source, target)
  const actualAvailability = rows(target, 'availability_overrides')
  assert(hashRows(normalizedAvailability, availabilityNames) === hashRows(actualAvailability, availabilityNames), 'availability_overrides: consolidated rows changed')
  const planned = planCategories(rows(source, 'products'))
  const actualCategories = rows(target, 'product_categories')
  const categoryColumns = ['id', 'organization_id', 'site_id', 'location_id', 'product_type', 'name', 'slug', 'sort_order']
  assert(hashRows(planned.categories, categoryColumns) === hashRows(actualCategories, categoryColumns), 'Category identity, scope, names, slugs or order differ from the source mapping')
  const actualAssignments = target.prepare('SELECT id AS product_id, category_id, sort_order FROM products').all()
  const assignmentColumns = ['product_id', 'category_id', 'sort_order']
  assert(hashRows(planned.assignments, assignmentColumns) === hashRows(actualAssignments, assignmentColumns), 'Product category membership or relative order changed')
  assert(JSON.stringify(renderedOrderBefore(source)) === JSON.stringify(renderedOrderAfter(target)), 'Customer-visible sections or Product order changed')
  for (const [label, db] of [['source', source], ['target', target]]) {
    const violations = db.pragma('foreign_key_check')
    assert(violations.length === 0, `${label}: ${violations.length} foreign key violations`)
    assert(db.pragma('integrity_check', { simple: true }) === 'ok', `${label}: SQLite integrity check failed`)
  }
  return {
    epoch: 4,
    generated_at: new Date().toISOString(),
    baseline: baselineSql.map(migration => ({ name: migration.name, sha256: createHash('sha256').update(migration.sql).digest('hex') })),
    tables: parity,
    projected_tables: projections,
    products: { source: count(source, 'products'), target: count(target, 'products') },
    product_categories: actualCategories.length,
    availability_overrides: {
      source: normalizedAvailability.length,
      target: actualAvailability.length,
      hash: hashRows(actualAvailability, availabilityNames),
    },
    category_hash: hashRows(actualCategories, categoryColumns),
    assignment_hash: hashRows(actualAssignments, assignmentColumns),
    discarded_rows: Object.fromEntries(
      [...RESET_TABLES, ...DELETED_TABLES]
        .filter(table => tableExists(source, table))
        .sort()
        .map(table => [table, count(source, table)]),
    ),
  }
}

function transform(sourcePath, targetPath) {
  assert(existsSync(sourcePath), `Source database not found: ${sourcePath}`)
  assert(!existsSync(targetPath), `Refusing to overwrite an existing target: ${targetPath}`)

  const source = openDatabase(sourcePath)
  const target = new Database(targetPath)
  target.pragma('foreign_keys = OFF')
  for (const migration of baselineSql) target.exec(migration.sql)

  assertSchemaParity(source, target)
  const now = new Date().toISOString()
  const destinationTables = tables(target)
  const copiedTables = []
  for (const table of destinationTables) {
    if (TRANSFORMED_TABLES.has(table)) continue
    insertRows(target, table, rows(source, table))
    copiedTables.push(table)
  }

  transformProducts(source, target, now)
  for (const table of ['booking_policies', 'experiences', 'tenant_pages']) projectCommonRows(source, target, table)
  insertRows(target, 'posts', normalizedPosts(source, target))
  insertRows(target, 'post_channel_jobs', normalizedPostChannelJobs(source, target))
  insertRows(target, 'availability_overrides', normalizedAvailabilityOverrides(source, target))

  target.pragma('foreign_keys = ON')
  const violations = target.pragma('foreign_key_check')
  assert(violations.length === 0, `Foreign key violations after transform: ${JSON.stringify(violations.slice(0, 5))}`)

  const manifest = verifyDatabases(source, target)
  writeFileSync(`${targetPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
  source.close()
  target.close()
  console.log(`Epoch 4 transform wrote ${targetPath}`)
  console.log(`  ${manifest.products.target} Products in ${manifest.product_categories} categories across ${copiedTables.length} copied tables`)
}

function verify(sourcePath, targetPath) {
  const source = openDatabase(sourcePath)
  const target = openDatabase(targetPath)
  try {
    const manifest = verifyDatabases(source, target)
    writeFileSync(`${targetPath}.verification.json`, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
    console.log(`Epoch 4 verification passed: ${manifest.tables.length} tables, ${manifest.products.target} Products, all content and visible ordering preserved.`)
  } finally {
    source.close()
    target.close()
  }
}

const [command, sourcePath, targetPath] = process.argv.slice(2)
if (!command || !sourcePath || !targetPath) {
  console.error('Usage: epoch4-data.mjs <transform|verify> <epoch3.sqlite|export.sql> <epoch4.sqlite|export.sql>')
  process.exit(1)
}
if (command === 'transform') transform(resolve(sourcePath), resolve(targetPath))
else if (command === 'verify') verify(resolve(sourcePath), resolve(targetPath))
else {
  console.error(`Unknown command "${command}"`)
  process.exit(1)
}
